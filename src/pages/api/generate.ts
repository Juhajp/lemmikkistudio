/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { readFileSync } from 'fs';
import { join } from 'path';
import satori from "satori";

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

// Uusi vesileimafunktio Satorilla - VARMA TOIMIVUUS
async function createWatermarkSvg(width: number, height: number) {
  const fontSize = Math.floor(width / 12);
  
  // Haetaan fontti lennosta CDN:stä (varmempi kuin levytallennus serverlessissä)
  // Käytetään ArrayBufferia suoraan
  let fontData: ArrayBuffer;
  try {
      const fontRes = await fetch('https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Bold.ttf');
      if (!fontRes.ok) throw new Error("Font download failed");
      fontData = await fontRes.arrayBuffer();
  } catch (e) {
      console.error("Font fetch failed, trying fallback logic or failing gracefully:", e);
      // Jos fontin haku epäonnistuu, voimme palauttaa tyhjän SVG:n tai heittää virheen
      throw new Error("Watermark font missing");
  }

  // Satori renderöi React-like objektin SVG-koodiksi
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          // Satori ei tue 'transform' parentissa täydellisesti samalla tavalla kuin CSS, 
          // mutta kokeillaan laittaa kierto lapsiin tai wrapperiin.
        },
        children: [
            {
                type: 'div',
                props: {
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'rotate(-45deg)', // Kierto tässä wrapperissa
                    },
                    children: [
                        {
                            type: 'p',
                            props: {
                                style: {
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    fontSize: `${fontSize}px`,
                                    fontWeight: 700,
                                    textShadow: '0px 0px 20px rgba(0,0,0,0.8)',
                                    margin: 0,
                                },
                                children: 'MUOTOKUVAT.FI',
                            }
                        },
                        {
                            type: 'p',
                            props: {
                                style: {
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    fontSize: `${fontSize * 0.5}px`,
                                    fontWeight: 700,
                                    textShadow: '0px 0px 20px rgba(0,0,0,0.8)',
                                    marginTop: '20px',
                                },
                                children: 'ESIKATSELU',
                            }
                        }
                    ]
                }
            }
        ],
      },
    } as any,
    {
      width,
      height,
      fonts: [
        {
          name: 'Roboto',
          data: fontData,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );
  
  return svg;
}

export const POST: APIRoute = async ({ request }) => {
  const FAL_KEY = import.meta.env.FAL_KEY ?? process.env.FAL_KEY;
  const BLOB_READ_WRITE_TOKEN = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

  if (!FAL_KEY) {
    console.error("VIRHE: FAL_KEY puuttuu!");
    return new Response(JSON.stringify({ error: "Server Config Error: FAL_KEY missing" }), { status: 500 });
  }

  if (!BLOB_READ_WRITE_TOKEN) {
    console.warn("VAROITUS: BLOB_READ_WRITE_TOKEN puuttuu! Kuvan tallennus ei onnistu.");
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

    // 5. Luo VESILEIMALLINEN versio näytettäväksi
    // Huom: createWatermarkSvg on nyt async
    const metadata = await sharp(originalBuffer).metadata();
    const watermarkSvg = await createWatermarkSvg(metadata.width || 1024, metadata.height || 1536);
    
    const watermarkedBuffer = await sharp(originalBuffer)
      .composite([{ input: Buffer.from(watermarkSvg), gravity: 'center' }])
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
