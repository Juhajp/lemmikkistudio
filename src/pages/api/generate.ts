/// <reference types="node" />

import type { APIRoute } from "astro";
import { kv } from "@vercel/kv";
import * as fal from "@fal-ai/serverless-client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DOG_BREEDS } from '../../data/dogBreeds';

function toDataUri(image: string, mimeType = "image/jpeg") {
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) return image;
  return "data:" + mimeType + ";base64," + image;
}

function dataUriToBlob(dataUri: string): Blob {
  const split = dataUri.split(",");
  const mimeString = split[0].split(":")[1].split(";")[0];
  const buffer = Buffer.from(split[1], "base64");
  return new Blob([buffer], { type: mimeString });
}

// VESILEIMA: Valkoinen X (ruksi) 1px, kattaa koko kuva-alueen.
function createWatermarkSvg(width: number, height: number) {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="white" stroke-width="1" />
      <line x1="${width}" y1="0" x2="0" y2="${height}" stroke="white" stroke-width="1" />
    </svg>
  `;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // --- CLOUDFLARE TURNSTILE VALIDATION (ENSIN!) ---
  const body = await request.json();
  const cfTurnstileToken = body.cfTurnstileToken;

  // Tarkista onko preview-ympäristö (ohita Turnstile preview-ympäristössä)
  const isPreview =
    import.meta.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'preview' ||
    cfTurnstileToken === 'preview-bypass-token';

  if (!isPreview) {
    // Tuotannossa: vaadi Turnstile-token
    if (!cfTurnstileToken) {
      return new Response(
        JSON.stringify({ error: 'Turvallisuustarkistus puuttuu' }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const TURNSTILE_SECRET = import.meta.env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY;
    
    if (!TURNSTILE_SECRET) {
      console.error('TURNSTILE_SECRET_KEY puuttuu ympäristömuuttujista!');
      return new Response(
        JSON.stringify({ error: 'Palvelinvirhe' }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET,
            response: cfTurnstileToken,
            remoteip: clientAddress,
          }),
        }
      );

      const verifyResult = await verifyResponse.json();
      
      if (!verifyResult.success) {
        console.log('Turnstile verification failed:', verifyResult['error-codes']);
        return new Response(
          JSON.stringify({ error: 'Turvallisuustarkistus epäonnistui. Yritä uudelleen.' }), 
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log('✅ Turnstile verification passed');
      
    } catch (turnstileError) {
      console.error('Turnstile validation error:', turnstileError);
      return new Response(
        JSON.stringify({ error: 'Turvallisuustarkistusvirhe' }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  } else {
    // Preview-ympäristössä: ohita Turnstile-validointi
    console.log('⚠️ Preview-ympäristö: Turnstile-validointi ohitettu');
  }
  // --- TURNSTILE VALIDATION END ---

  // --- RATE LIMIT START ---
  const MAX_GENERATIONS = Number(import.meta.env.RATE_LIMIT_MAX ?? 20);
  // Oletus 86400s = 24h
  const WINDOW_SECONDS = Number(import.meta.env.RATE_LIMIT_WINDOW ?? 86400);

  // Admin secret bypass
  const ADMIN_SECRET = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  const requestSecret = request.headers.get("x-admin-secret");
  const isAdmin = ADMIN_SECRET && requestSecret === ADMIN_SECRET;

  if (!isAdmin) {
      // Vercelissä ja monissa proxyissä oikea IP on x-forwarded-for -headerissa.
      // clientAddress on Astron tarjoama fallback.
      const ip = request.headers.get("x-forwarded-for") || clientAddress || "unknown";
      
      // Tehdään uniikki avain Redisille, esim "ratelimit:127.0.0.1"
      const rateLimitKey = `ratelimit:${ip}`;

      try {
        // Kasvatetaan laskuria (INCR)
        const requests = await kv.incr(rateLimitKey);

        // Jos tämä oli ensimmäinen pyyntö tällä avaimella (arvo on 1), asetetaan vanhenemisaika
        if (requests === 1) {
          await kv.expire(rateLimitKey, WINDOW_SECONDS);
        }

        // Jos raja ylittyy, palautetaan virhe
        if (requests > MAX_GENERATIONS) {
          return new Response(
            JSON.stringify({ 
              error: "Päivittäinen kuvakiintiö täynnä. Kokeile huomenna uudelleen." 
            }), 
            {
              status: 429,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      } catch (kvError) {
        // Jos KV ei toimi (esim. yhteysongelma tai lokaalisti ilman env-muuttujia),
        // logataan virhe mutta PÄÄSTETÄÄN KÄYTTÄJÄ LÄPI, jotta palvelu ei kaadu kokonaan.
        console.error("Rate limit check failed (allowing request):", kvError);
      }
  }
  // --- RATE LIMIT END ---

  const FAL_KEY = import.meta.env.FAL_KEY ?? process.env.FAL_KEY;
  const BLOB_READ_WRITE_TOKEN = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

  if (!FAL_KEY) {
    console.error("VIRHE: FAL_KEY puuttuu!");
    return new Response(JSON.stringify({ error: "Server Config Error: FAL_KEY missing" }), { status: 500 });
  }

  fal.config({ credentials: FAL_KEY });

  try {
    // Body on jo luettu Turnstile-validoinnissa, käytetään samaa
    const base64OrDataUri = body.image as string | undefined;
    const mimeType = (body.mimeType as string | undefined) ?? "image/jpeg";
    
    if (!base64OrDataUri) {
      return new Response(JSON.stringify({ error: "No image data" }), { status: 400 });
    }

    // 1. Upload input image to Fal storage
    const dataUri = toDataUri(base64OrDataUri, mimeType);
    const imageBlob = dataUriToBlob(dataUri);
    const uploadedUrl = await fal.storage.upload(imageBlob);

    // Koiran rotu: vain sallitulla listalla → engl. nimi promptiin; muuten ei roturiviä
    const dogBreed = typeof body.dogBreed === 'string' ? body.dogBreed.trim() : '';
    const normalized = dogBreed.toLowerCase();
    const match = DOG_BREEDS.find((b) => b.fi.toLowerCase() === normalized);
    const breedForPrompt = match ? match.en : null;
    // breedForPrompt säilytetään mahdollista tulevaa käyttöä varten, mutta sitä ei tällä hetkellä lisätä promptiin

    const backgroundStyle = typeof body.backgroundStyle === 'string' ? body.backgroundStyle : 'dark';

    const darkPrompt = `A high-end professional studio portrait of the specific dog from the reference image. The dog's unique individual identity, fur color, and markings must be perfectly maintained.

Key requirement: Preserve the exact identity, unique fur markings, specific eye color, and individual facial expression of the dog in the reference photo with 100% fidelity. Do not alter the dog's features or breed characteristics. The dog's mouth must be closed, no tongue visible, and the dog must not appear to be panting.

Lighting and Environment: Replace the original environment with a luxurious, dark charcoal studio background. Introduce dramatic, professional studio lighting (three-point lighting setup). Use strong rim lighting (backlight) to highlight the texture of the fur and separate the dog from the dark background, creating depth and a cinematic feel. The focus is tack sharp on the dog's eyes. 8k resolution, highly detailed, cinematic.

Eye and Facial Details: The expression is natural and characteristic of the breed. Crucially, if the dog naturally has fur falling over or around its eyes, preserve this authentic look. The fur may partially obscure the eyes, as is natural for the breed. Where the eyes are visible through the fur, they must have a soft, lifelike gaze, avoiding any unnatural or human-like staring. The visible parts of the eyes should have realistic depth and a subtle catchlight from the studio lighting.

Pose and Composition: The dog is posed in a classic, dignified studio sit, head slightly turned.`;

    const whitePrompt = `A high-end professional studio portrait of the specific dog from the reference image. The dog's unique individual identity, fur color, and markings must be perfectly maintained.

Key requirement: Preserve the exact identity, unique fur markings, specific eye color, and individual facial expression of the dog in the reference photo with 100% fidelity. Do not alter the dog's features or breed characteristics. The dog's mouth must be closed, no tongue visible, and the dog must not appear to be panting.

Lighting and Environment: A minimalist, ultra-modern bright white studio cyclorama background. Soft, diffused high-key lighting filling the space, creating gentle shadows beneath the dog. Clean, airy, immaculate aesthetic.

Eye and Facial Details: The expression is natural and characteristic of the breed. Crucially, if the dog naturally has fur falling over or around its eyes, preserve this authentic look. The fur may partially obscure the eyes, as is natural for the breed. Where the eyes are visible through the fur, they must have a soft, lifelike gaze, avoiding any unnatural or human-like staring. The visible parts of the eyes should have realistic depth and a subtle catchlight from the studio lighting.

Pose and Composition: The dog is posed in a classic, dignified studio sit, head slightly turned.`;

    const sunsetPrompt = `A high-end professional portrait of the specific dog from the reference image. The dog's unique individual identity, fur color, and markings must be perfectly maintained.

Key requirement: Preserve the exact identity, unique fur markings, specific eye color, and individual facial expression of the dog in the reference photo with 100% fidelity. Do not alter the dog's features or breed characteristics.

Lighting and Environment: Replace the original environment with A vast, golden tall grass meadow during sunset (golden hour). The low sun is behind the dog, creating beautiful warm rim lighting around its fur and lens flare. The background is a soft, warm blur of amber and gold tones. Natural and joyous fit. The focus is tack sharp on the dog's eyes. 8k resolution, highly detailed, cinematic.

Eye and Facial Details: The expression is natural and characteristic of the breed. Crucially, if the dog naturally has fur falling over or around its eyes, preserve this authentic look. The fur may partially obscure the eyes, as is natural for the breed. Where the eyes are visible through the fur, they must have a soft, lifelike gaze, avoiding any unnatural or human-like staring. The visible parts of the eyes should have realistic depth and a subtle catchlight from the studio lighting.

Pose and Composition: The dog is posed in a classic, dignified studio sit, head slightly turned.`;

    const prompt =
      body.prompt ??
      (backgroundStyle === 'white'
        ? whitePrompt
        : backgroundStyle === 'sunset'
        ? sunsetPrompt
        : darkPrompt);

    // 2. Generate with Fal
    const result: any = await fal.subscribe("fal-ai/gpt-image-1.5/edit", {
      input: {
        prompt,
        image_urls: [uploadedUrl],
        image_size: "1024x1536",
        quality: "medium",
        input_fidelity: "high",
        num_images: 1,
        output_format: "jpeg",
        sync_mode: true,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          (update.logs ?? []).map((l: any) => l.message).forEach(console.log);
        }
      },
    });

    const outUrl: string | undefined = result?.images?.[0]?.url;
    if (!outUrl) throw new Error("Fal.ai ei palauttanut kuvan URL:ia.");

    // 3. Hae generoidun kuvan data puskuriin (Buffer)
    const imageRes = await fetch(outUrl);
    if (!imageRes.ok) throw new Error("Failed to fetch generated image");
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const originalBuffer = Buffer.from(imageArrayBuffer);

    // 3.5. Poista EXIF-metadata kaikista kuvista turvallisuussyistä
    const cleanBuffer = await sharp(originalBuffer)
        .rotate() // Poistaa EXIF-metadatan automaattisesti
        .jpeg({ quality: 90 })
        .toBuffer();

    // 4. Tallenna ALKUPERÄINEN (puhdas) kuva Vercel Blobiin
    let cleanImageUrl = "";
    let thumbnailUrl = ""; // UUSI MUUTTUJA
    if (BLOB_READ_WRITE_TOKEN) {
        // A. Tallenna iso kuva (UUID takaa turvallisuuden)
        const blob = await put(`portraits/${randomUUID()}.jpg`, cleanBuffer, {
            access: 'public',
            contentType: 'image/jpeg',
        });
        cleanImageUrl = blob.url;

        // B. Luo ja tallenna THUMBNAIL (140px)
        try {
            const thumbBuffer = await sharp(cleanBuffer)
                .resize(140) // Leveys 140px
                .jpeg({ quality: 70 })
                .toBuffer();

            const thumbBlob = await put(`thumbnails/${randomUUID()}.jpg`, thumbBuffer, {
                access: 'public',
                contentType: 'image/jpeg',
            });
            thumbnailUrl = thumbBlob.url;
            console.log("Thumbnail created:", thumbnailUrl);
        } catch (thumbErr) {
            console.error("Failed to create thumbnail:", thumbErr);
            // Ei katkaista prosessia, pikkukuva on "nice to have"
        }

    } else {
        console.warn("Skipping Blob upload because token is missing. Using FAL url as fallback (will expire).");
        cleanImageUrl = outUrl;
        // Thumbnailia ei voi tehdä ilman blob-tallennusta tässä kontekstissa (tai pitäisi ladata base64:nä)
        thumbnailUrl = outUrl; // Fallback: käytetään isoa kuvaa jos blob ei toimi
    }

    // 5. Luo vesileima: valkoinen X 1px + watermark.png
    const metadata = await sharp(cleanBuffer).metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1536;
    const watermarkSvg = createWatermarkSvg(width, height);

    const compositeLayers: any[] = [
      { input: Buffer.from(watermarkSvg), gravity: 'center' },
    ];

    // Lataa watermark.png (fetch tai fs)
    let pngBuffer: Buffer | null = null;
    try {
      const origin = new URL(request.url).origin;
      const watermarkUrl = `${origin}/watermark.png`;
      const pngRes = await fetch(watermarkUrl);
      if (pngRes.ok) {
        pngBuffer = Buffer.from(await pngRes.arrayBuffer());
      }
    } catch (_) {}
    if (!pngBuffer) {
      const pathsToTry = [
        join(process.cwd(), 'public', 'watermark.png'),
        join(process.cwd(), 'watermark.png'),
      ];
      for (const p of pathsToTry) {
        try {
          pngBuffer = readFileSync(p);
          break;
        } catch (_) {}
      }
    }
    if (pngBuffer) {
      const watermarkPngBuffer = await sharp(pngBuffer)
        .resize({ width: Math.floor(width * 0.8) })
        .toBuffer();
      compositeLayers.push({ input: watermarkPngBuffer, gravity: 'center' });
    }

    const watermarkedBuffer = await sharp(cleanBuffer)
      .composite(compositeLayers)
      .jpeg({ quality: 80 })
      .toBuffer();

    const watermarkedBase64 = watermarkedBuffer.toString("base64");

    // Vesileimattu esikatselu Blobiin, jotta result-sivu voi näyttää sen
    let previewImageUrl: string | null = null;
    if (BLOB_READ_WRITE_TOKEN) {
      try {
        const previewBlob = await put(`previews/watermarked-${randomUUID()}.jpg`, watermarkedBuffer, {
          access: 'public',
          contentType: 'image/jpeg',
        });
        previewImageUrl = previewBlob.url;
      } catch (e) {
        console.warn("Preview image upload failed:", e);
      }
    }

    // 6. Palauta vastaus
    const response = new Response(
      JSON.stringify({
        image: watermarkedBase64, // Vesileimattu versio (base64)
        previewImageUrl: previewImageUrl, // Vesileimattu esikatselu URL (result-sivulla)
        purchaseToken: cleanImageUrl, // Alkuperäisen kuvan URL
        thumbnailUrl: thumbnailUrl, // Pikkukuvan URL
        message: "Vesileimallinen esikatselu luotu",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    // Huom: uploadedUrl on Fal.ai:n URL, ei Vercel Blob URL
    // Fal.ai:n kuvat poistetaan automaattisesti, joten poisto-operaatiota ei tarvita
    // Vercel Blob: kuvat jäävät tallennettuina

    return response;

  } catch (error: any) {
    console.error("Error:", error);
    const errorMessage = error?.body?.detail || error?.message || "Generation failed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
