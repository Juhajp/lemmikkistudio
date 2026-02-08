/// <reference types="node" />

import type { APIRoute } from "astro";
import { kv } from "@vercel/kv";
import * as fal from "@fal-ai/serverless-client";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

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

// VESILEIMA: Vain isot ruksit, ei tekstiä.
async function createWatermarkSvg(width: number, height: number) {
  // Yksinkertainen, varma vesileima.
  // Ohuempi viiva: width / 160 (käyttäjän pyynnöstä)
  const strokeWidth = Math.max(2, Math.floor(width / 240)); 
  
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .cross { 
          stroke: rgba(255, 255, 255, 0.5); 
          stroke-width: ${strokeWidth}; 
        }
        .cross-bg { 
          stroke: rgba(0, 0, 0, 0.3); 
          stroke-width: ${strokeWidth}; 
        }
      </style>
      
      <!-- Varjo (hieman siirrettynä) -->
      <line x1="${strokeWidth}" y1="${strokeWidth}" x2="${width+strokeWidth}" y2="${height+strokeWidth}" class="cross-bg" />
      <line x1="${width+strokeWidth}" y1="${strokeWidth}" x2="${strokeWidth}" y2="${height+strokeWidth}" class="cross-bg" />

      <!-- Varsinainen viiva -->
      <line x1="0" y1="0" x2="${width}" y2="${height}" class="cross" />
      <line x1="${width}" y1="0" x2="0" y2="${height}" class="cross" />
    </svg>
  `;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // --- CLOUDFLARE TURNSTILE VALIDATION (ENSIN!) ---
  const body = await request.json();
  const cfTurnstileToken = body.cfTurnstileToken;

  // Tarkista onko preview-ympäristö (ohita Turnstile preview-ympäristössä)
  const isPreview = import.meta.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'preview';
  
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
  const MAX_GENERATIONS = Number(import.meta.env.RATE_LIMIT_MAX ?? 5);
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

    // KÄSITELLÄÄN TAUSTAVÄRIVALINTA
    const bgOption = body.background ?? "studio";
    let backgroundPrompt = "Solid dark neutral grey background (#141414).";
    
    if (bgOption === "black") {
        backgroundPrompt = "Solid pitch black background (#000000). High contrast.";
    } else if (bgOption === "white") {
        backgroundPrompt = "Solid pure white background (#FFFFFF). High key lighting.";
    } else if (bgOption === "outdoor") {
        backgroundPrompt = "Outdoor background, shallow depth of field (bokeh), blurred, indistinct, light and fresh atmosphere.";
    } else if (bgOption === "office") {
        backgroundPrompt = "Modern office background, shallow depth of field (bokeh), blurred, indistinct.";
    } else if (bgOption.startsWith("color_")) {
        const color = bgOption.replace("color_", "");
        backgroundPrompt = `Solid ${color} background. High key lighting.`;
    }

    // KÄSITELLÄÄN VAATEVALINTA
    const clothingOption = body.clothing ?? "blazer";
    let clothingPrompt = "Change clothing to a smart casual dark grey blazer.";
    
    if (clothingOption === "original") {
        clothingPrompt = "Keep the original clothing.";
    } else if (clothingOption === "beige_blazer") {
        clothingPrompt = "Change clothing to a soft beige or camel colored blazer. Warm, approachable professional look, well-tailored.";
    } else if (clothingOption === "blue_dress_shirt") {
        clothingPrompt = "Change clothing to a classic light blue dress shirt with collar. Professional business attire, crisp and trustworthy.";
    } else if (clothingOption === "sweater_light") {
        clothingPrompt = "Change clothing to a cozy, high-quality beige or cream colored knitted sweater. Soft texture, casual but elegant.";
    } else if (clothingOption === "navy_sweater") {
        clothingPrompt = "Change clothing to a high-quality navy blue knitted sweater. Elegant, professional, sophisticated look.";
    } else if (clothingOption === "turtleneck_black") {
        clothingPrompt = "Change clothing to a stylish black turtleneck. Minimalist, modern, Steve Jobs style.";
    } else if (clothingOption === "tshirt_grey") {
        clothingPrompt = "Change clothing to a high-quality, well-fitted grey t-shirt. Clean, smart casual look, relaxed but professional.";
    } else if (clothingOption === "tshirt_black") {
        clothingPrompt = "Change clothing to a premium black t-shirt, well-fitted. Minimalist, modern, tech startup style.";
    }

    const prompt = body.prompt ?? `Keep the person's facial features and identity exactly the same. Create a professional studio portrait headshot. Shot with 85mm portrait lens at f/2.8, shallow depth of field. IMPORTANT: Frame as a medium close-up ensuring the ENTIRE head including top of hair is completely visible within the frame - never crop the top of the head. Show full head and shoulders. Leave ample headroom above the hair, minimum 10% of frame height above the top of the head. ${clothingPrompt} ${backgroundPrompt} Professional three-point studio lighting setup with soft key light, subtle fill light, and rim light for dimension. Catchlight in eyes. Natural skin tones with even complexion, subtle professional retouching while maintaining natural skin texture. Confident posture with relaxed shoulders. Sharp focus on eyes and face. Professional DSLR quality, cinematic color grading, realistic photo.`;

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

    // 5. Luo vesileima (RASTI + PNG-TEKSTI)
    const metadata = await sharp(cleanBuffer).metadata();
    const width = metadata.width || 1024;
    
    // A. Luodaan rasti SVG:nä (ohut viiva)
    const watermarkSvg = await createWatermarkSvg(width, metadata.height || 1536);
    
    // B. Valmistellaan kerrokset
    const compositeLayers: any[] = [
        { input: Buffer.from(watermarkSvg), gravity: 'center' } // Rasti
    ];

    // C. Yritetään hakea PNG-teksti (fetch ensin, sitten fs fallback)
    try {
        let pngBuffer: Buffer | null = null;
        
        // DEBUG: Logataan origin
        const origin = new URL(request.url).origin;
        console.log("Watermark fetch origin:", origin);

        // Yritä hakea URL:n kautta (Vercelissä varmempi tapa saada public assetit)
        try {
            const watermarkUrl = `${origin}/watermark.png`;
            const pngRes = await fetch(watermarkUrl);
            if (pngRes.ok) {
                const arr = await pngRes.arrayBuffer();
                pngBuffer = Buffer.from(arr);
                console.log("Watermark fetched successfully from URL");
            } else {
                console.warn(`Watermark fetch failed: ${pngRes.status} from ${watermarkUrl}`);
            }
        } catch (fetchErr) {
            console.warn("Fetch watermark failed:", fetchErr);
        }

        // Jos fetch epäonnistui, yritä lukea levyltä (FS Fallback)
        if (!pngBuffer) {
             const pathsToTry = [
                 join(process.cwd(), 'public', 'watermark.png'),
                 join(process.cwd(), 'watermark.png'),
                 resolve('./public/watermark.png'),
                 // Joskus Vercelissä dist kansio on eri paikassa
                 join(process.cwd(), 'dist', 'client', 'watermark.png')
             ];
             
             console.log("Trying FS read from:", pathsToTry);

             for (const p of pathsToTry) {
                 try {
                    pngBuffer = readFileSync(p);
                    if (pngBuffer) {
                        console.log("Watermark found at FS path:", p);
                        break;
                    }
                 } catch (fsErr) {
                    // ignore
                 }
             }
        }

        if (pngBuffer) {
             // Skaalataan PNG sopivaksi (esim 80% kuvan leveydestä)
            const watermarkPngBuffer = await sharp(pngBuffer)
                .resize({ width: Math.floor(width * 0.8) })
                .toBuffer();
                
            compositeLayers.push({ input: watermarkPngBuffer, gravity: 'center' });
        } else {
            console.error("CRITICAL: Watermark PNG could not be loaded via fetch OR fs.");
        }

    } catch (e) {
        console.warn("Watermark processing error:", e);
    }

    const watermarkedBuffer = await sharp(cleanBuffer)
      .composite(compositeLayers)
      .jpeg({ quality: 80 })
      .toBuffer();

    const watermarkedBase64 = watermarkedBuffer.toString("base64");

    // 6. Palauta vastaus
    const response = new Response(
      JSON.stringify({
        image: watermarkedBase64, // Vesileimattu versio
        purchaseToken: cleanImageUrl, // Alkuperäisen kuvan URL
        thumbnailUrl: thumbnailUrl, // Pikkukuvan URL
        message: "Vesileimallinen esikatselu luotu",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    // Huom: uploadedUrl on Fal.ai:n URL, ei Vercel Blob URL
    // Fal.ai:n kuvat poistetaan automaattisesti, joten poisto-operaatiota ei tarvita
    // Vercel Blob:n del() funktio toimii vain Vercel Blob URL:ille

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
