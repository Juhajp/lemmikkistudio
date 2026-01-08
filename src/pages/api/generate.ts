/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

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
  const strokeWidth = Math.max(2, Math.floor(width / 160)); 
  
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

export const POST: APIRoute = async ({ request }) => {
  const FAL_KEY = import.meta.env.FAL_KEY ?? process.env.FAL_KEY;
  const BLOB_READ_WRITE_TOKEN = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

  if (!FAL_KEY) {
    console.error("VIRHE: FAL_KEY puuttuu!");
    return new Response(JSON.stringify({ error: "Server Config Error: FAL_KEY missing" }), { status: 500 });
  }

  fal.config({ credentials: FAL_KEY });

  try {
    const body = await request.json();
    const base64OrDataUri = body.image as string | undefined;
    const mimeType = (body.mimeType as string | undefined) ?? "image/jpeg";
    
    if (!base64OrDataUri) {
      return new Response(JSON.stringify({ error: "No image data" }), { status: 400 });
    }

    // 1. Upload input image to Fal storage
    const dataUri = toDataUri(base64OrDataUri, mimeType);
    const imageBlob = dataUriToBlob(dataUri);
    const uploadedUrl = await fal.storage.upload(imageBlob);

    const prompt = body.prompt ?? "Keep the person's facial features and identity the same. Create a professional studio headshot. Change clothing to a smart casual dark grey blazer. Replace background with solid dark neutral grey (#141414). Soft cinematic studio lighting with a subtle rim light. Natural skin texture, subtle retouch, realistic photo.";

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

    // 4. Tallenna ALKUPERÄINEN (puhdas) kuva Vercel Blobiin
    let cleanImageUrl = "";
    if (BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`portraits/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, originalBuffer, {
            access: 'public',
            contentType: 'image/jpeg',
        });
        cleanImageUrl = blob.url;
    } else {
        console.warn("Skipping Blob upload because token is missing. Using FAL url as fallback (will expire).");
        cleanImageUrl = outUrl;
    }

    // 5. Luo vesileima (RASTI + PNG-TEKSTI)
    const metadata = await sharp(originalBuffer).metadata();
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

    const watermarkedBuffer = await sharp(originalBuffer)
      .composite(compositeLayers)
      .jpeg({ quality: 80 })
      .toBuffer();

    const watermarkedBase64 = watermarkedBuffer.toString("base64");

    // 6. Palauta vastaus
    return new Response(
      JSON.stringify({
        image: watermarkedBase64, // Vesileimattu versio
        purchaseToken: cleanImageUrl, // Alkuperäisen kuvan URL
        message: "Vesileimallinen esikatselu luotu",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    const errorMessage = error?.body?.detail || error?.message || "Generation failed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
