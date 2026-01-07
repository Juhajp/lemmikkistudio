/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toDataUri(image: string, mimeType = "image/jpeg") {
  // hyväksy jo valmiit data-URI:t
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) return image;
  // muuten oletetaan että tulee pelkkä base64
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

  // Node: Buffer löytyy yleensä globaalisti
  const B = (globalThis as any).Buffer;
  if (B) return B.from(ab).toString("base64");

  // Fallback (jos Buffer ei ole käytössä)
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore
  return btoa(binary);
}

export const POST: APIRoute = async ({ request }) => {
  // ✅ Vercel serverless: käytä process.env
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

    // Pakollinen: kuva (base64 tai data-uri)
    const base64OrDataUri = body.image as string | undefined;
    // Valinnainen: jos image on pelkkä base64, tällä asetetaan prefixin mime
    const mimeType = (body.mimeType as string | undefined) ?? "image/jpeg";

    if (!base64OrDataUri) {
      return new Response(JSON.stringify({ error: "No image data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Flux dev odottaa image_url (voi olla myös data-uri)
    const inputImage = toDataUri(base64OrDataUri, mimeType);

    // Prompti (voit lähettää body.prompt frontendiltä)
    const prompt =
      (body.prompt as string | undefined) ??
      "Professional studio headshot. Preserve identity and facial features. Smart casual dark grey blazer. Solid dark neutral grey background (#141414). Soft clean studio lighting with subtle rim light. Natural skin texture, subtle retouch. Ultra clean, no noise, no grain, realistic photo.";

    // Flux-säädöt (voit halutessasi antaa nämä frontendiltä)
    const strength = clamp(Number(body.strength ?? 0.7), 0, 1); // pienempi = säilyttää enemmän lähtökuvaa
    const num_inference_steps = clamp(Number(body.steps ?? 40), 10, 60);
    const guidance_scale = clamp(Number(body.guidance ?? 3.5), 1, 10);
    const acceleration =
      (body.acceleration as "none" | "regular" | "high" | undefined) ?? "regular";

    const result: any = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
      input: {
        image_url: inputImage, // ✅ FLUX dev käyttää image_url (ei image_urls)
        prompt,

        strength,
        num_inference_steps,
        guidance_scale,

        num_images: 1,
        output_format: "png", // suositus: vähemmän jpeg-artefakteja
        sync_mode: true,      // usein palauttaa data-URI:n url-kentässä
        acceleration,

        // enable_safety_checker: true, // default true; jätä pois ellei tarvetta
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          (update.logs ?? []).map((l: any) => l.message).forEach(console.log);
        }
      },
    });

    // Joissain vastauksissa kuvat voivat olla result.images tai result.data.images
    const images = result?.images ?? result?.data?.images;
    const outUrlOrDataUri: string | undefined = images?.[0]?.url;

    if (!outUrlOrDataUri) {
      console.error("Full result:", JSON.stringify(result, null, 2));
      throw new Error("Fal.ai ei palauttanut kuvan URL:ia / data-URI:a.");
    }

    const outputBase64 = outUrlOrDataUri.startsWith("data:")
      ? dataUriToBase64(outUrlOrDataUri)
      : await urlToBase64(outUrlOrDataUri);

    return new Response(
      JSON.stringify({
        image: outputBase64,
        message: "Luotu Fal.ai FLUX Dev image-to-image -mallilla",
        meta: { strength, num_inference_steps, guidance_scale, acceleration },
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
