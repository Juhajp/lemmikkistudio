/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";

// --- APUFUNKTIOT ---
function toDataUri(image: string, mimeType = "image/jpeg") {
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) return image;
  return "data:" + mimeType + ";base64," + image;
}

function dataUriToBase64(dataUri: string) {
  const i = dataUri.indexOf(",");
  return i >= 0 ? dataUri.slice(i + 1) : dataUri;
}

async function urlToBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();

  const B = (globalThis as any).Buffer;
  if (B) return B.from(ab).toString("base64");

  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore
  return btoa(binary);
}
// -------------------

export const POST: APIRoute = async ({ request }) => {
  const FAL_KEY = process.env.FAL_KEY;

  if (!FAL_KEY) {
    return new Response(JSON.stringify({ error: "Server Config Error: FAL_KEY missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  fal.config({ credentials: FAL_KEY });

  try {
    const body = await request.json();

    const base64OrDataUri = body.image as string | undefined;
    const mimeType = (body.mimeType as string | undefined) ?? "image/jpeg";

    if (!base64OrDataUri) {
      return new Response(JSON.stringify({ error: "No image data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inputImage = toDataUri(base64OrDataUri, mimeType);

    // Prompti: Ohjaa Fluxia luomaan haluttu tyyli
    const prompt =
      (body.prompt as string | undefined) ??
      "Professional studio portrait of this person. Wearing a smart casual dark grey blazer. Solid dark neutral grey background #141414. Soft cinematic studio lighting, rim light. Looking at camera. High quality, photorealistic, 8k, sharp focus, natural skin texture.";

    // --- KUSTANNUSTEHOKAS FLUX DEV ---
    // Hinta: n. 0,025 € / kuva
    const result: any = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        prompt,
        // HUOM: Flux Dev käyttää 'image_url' (yksikkö), ei taulukkoa
        image_url: inputImage,
        
        // --- STRENGTH-SÄÄTÖ ---
        // 0.75 - 0.85 on optimi vaatteiden vaihtoon.
        // < 0.70: Kasvot muuttuvat liikaa.
        // > 0.90: Vaatteet eivät vaihdu tarpeeksi.
        strength: 0.80,

        // Flux-parametrit
        guidance_scale: 3.5,
        num_inference_steps: 28,
        enable_safety_checker: false,
        output_format: "jpeg",
        sync_mode: true,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Flux processing...");
        }
      },
    });

    const outUrlOrDataUri: string | undefined = result?.images?.[0]?.url;

    if (!outUrlOrDataUri) {
      console.error("Full result:", JSON.stringify(result, null, 2));
      throw new Error("Fal.ai ei palauttanut kuvan URL:ia.");
    }

    const outputBase64 = outUrlOrDataUri.startsWith("data:")
      ? dataUriToBase64(outUrlOrDataUri)
      : await urlToBase64(outUrlOrDataUri);

    return new Response(
      JSON.stringify({
        image: outputBase64,
        message: "Luotu Fal.ai Flux Dev -mallilla (Low Cost)",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Fal.ai Error:", error);
    const errorMessage = error?.body?.detail || error?.message || "Generation failed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};