/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";

function toDataUri(image: string, mimeType = "image/jpeg") {
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) return image;
  return "data:" + mimeType + ";base64," + image;
}

function dataUriToBase64(dataUri: string) {
  const i = dataUri.indexOf(",");
  return i >= 0 ? dataUri.slice(i + 1) : dataUri;
}

function dataUriToBlob(dataUri: string): Blob {
  const split = dataUri.split(",");
  const mimeString = split[0].split(":")[1].split(";")[0];
  const buffer = Buffer.from(split[1], "base64");
  return new Blob([buffer], { type: mimeString });
}

async function urlToBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

export const POST: APIRoute = async ({ request }) => {
  // ✅ Tuki sekä Astro local dev (import.meta.env) että Vercel (process.env)
  const FAL_KEY = import.meta.env.FAL_KEY ?? process.env.FAL_KEY;

  if (!FAL_KEY) {
    console.error("VIRHE: FAL_KEY puuttuu ympäristömuuttujista!");
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

    // 1. Ladataan kuva ensin pilveen (varmempi tapa)
    const dataUri = toDataUri(base64OrDataUri, mimeType);
    const imageBlob = dataUriToBlob(dataUri);
    const uploadedUrl = await fal.storage.upload(imageBlob);

    const prompt =
      (body.prompt as string | undefined) ??
      "Keep the person's facial features and identity the same. Create a professional studio headshot. Change clothing to a smart casual dark grey blazer. Replace background with solid dark neutral grey (#141414). Soft cinematic studio lighting with a subtle rim light. Natural skin texture, subtle retouch, realistic photo.";

    // 2. Kutsutaan mallia
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
        message: "Luotu Fal.ai GPT-Image-1.5 Edit -mallilla",
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