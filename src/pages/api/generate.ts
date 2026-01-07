/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";

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

  const B = (globalThis as any).Buffer;
  if (B) return B.from(ab).toString("base64");

  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore
  return btoa(binary);
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

    // (valinnainen) suojaraja: base64 payloadit voi muuten räjäyttää serverlessin
    if (typeof base64OrDataUri === "string" && base64OrDataUri.length > 12_000_000) {
      return new Response(JSON.stringify({ error: "Image payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inputImage = toDataUri(base64OrDataUri, mimeType);

    // Default prompt: erittäin eksplisiittinen “pidä kasvot/identiteetti, vaihda tausta+vaate”
    const prompt =
      (body.prompt as string | undefined) ??
      [
        "Edit the provided photo into a professional studio headshot.",
        "IMPORTANT: keep the same person, same identity, same facial features, same face shape, same age, same expression.",
        "Do NOT change the person's face.",
        "Change clothing to a smart casual dark grey blazer (no logos).",
        "Replace the background with a solid dark neutral grey studio backdrop (#141414).",
        "Soft clean studio lighting with a subtle rim light, realistic photo.",
        "Natural skin texture, subtle retouch, ultra clean (no noise/grain).",
      ].join(" ");

    // Kontext käyttää aspect_ratioa (ei image_size) :contentReference[oaicite:1]{index=1}
    const aspect_ratio =
      (body.aspect_ratio as
        | "21:9"
        | "16:9"
        | "4:3"
        | "3:2"
        | "1:1"
        | "2:3"
        | "3:4"
        | "9:16"
        | "9:21"
        | undefined) ?? "3:4";

    // Kontextin parametrit (schema): guidance_scale, seed, num_images, output_format, sync_mode, enhance_prompt, safety_tolerance :contentReference[oaicite:2]{index=2}
    const guidance_scale = clampNumber(body.guidance_scale, 1, 10, 3.5);
    const seed = body.seed !== undefined ? clampNumber(body.seed, 0, 2_147_483_647, 0) : undefined;

    const output_format = ((body.output_format as "png" | "jpeg" | undefined) ?? "png"); // png vähentää jpeg-artefakteja
    const enhance_prompt = Boolean(body.enhance_prompt ?? false);

    const safety_tolerance = String(body.safety_tolerance ?? "2") as "1" | "2" | "3" | "4" | "5" | "6";

    const result: any = await fal.subscribe("fal-ai/flux-pro/kontext", {
      input: {
        prompt,
        image_url: inputImage, // ✅ Kontext: image_url (ei image_urls) :contentReference[oaicite:3]{index=3}
        aspect_ratio,
        guidance_scale,
        ...(seed !== undefined ? { seed } : {}),
        num_images: 1,
        output_format,
        sync_mode: true, // palauttaa usein data-URI:nä :contentReference[oaicite:4]{index=4}
        enhance_prompt,
        safety_tolerance,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          (update.logs ?? []).map((l: any) => l.message).forEach(console.log);
        }
      },
    });

    // serverless-clientissä voi tulla result.images tai result.data.images -> otetaan molemmat
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
        message: "Luotu Fal.ai FLUX Kontext (pro) -mallilla",
        meta: { aspect_ratio, guidance_scale, output_format, enhance_prompt, seed },
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
