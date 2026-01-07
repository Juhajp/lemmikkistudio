/// <reference types="node" />

import type { APIRoute } from "astro";
import * as fal from "@fal-ai/serverless-client";

function toDataUri(image: string, mimeType = "image/jpeg") {
  // hyväksy jo valmiit data-URI:t
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) return image;
  // muuten oletetaan että tulee pelkkä base64
  return "data:" + mimeType + ";base64," + image;
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

    // (valinnainen) suoja: liian iso base64 voi räjäyttää serverlessin
    if (base64OrDataUri.length > 12_000_000) {
      return new Response(JSON.stringify({ error: "Image payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    // InstantID ottaa face_image_url:in (URL tai base64 data-URI) :contentReference[oaicite:1]{index=1}
    const faceImage = toDataUri(base64OrDataUri, mimeType);

    // Prompti: tee studio-headshot + puku + tausta
    const prompt =
      (body.prompt as string | undefined) ??
      [
        "Professional studio headshot photo of the same person.",
        "Smart casual dark grey blazer, clean corporate look.",
        "Solid dark neutral grey background (#141414).",
        "Soft studio lighting with subtle rim light.",
        "Realistic skin texture, subtle retouch, sharp focus.",
        "No noise, no grain.",
      ].join(" ");

    // InstantID: style oletuksena "Headshot" :contentReference[oaicite:2]{index=2}
    const style =
      (body.style as
        | "Headshot"
        | "Spring Festival"
        | "Watercolor"
        | "Film Noir"
        | "Neon"
        | "Jungle"
        | "Mars"
        | "Vibrant Color"
        | "Snow"
        | "Line art"
        | undefined) ?? "Headshot";

    // Negatiivinen prompti (auttaa “kohinaa” + artefakteja vastaan)
    const negative_prompt =
      (body.negative_prompt as string | undefined) ??
      "lowres, blurry, noise, grain, jpeg artifacts, watermark, text, logo, worst quality, low quality";

    // Hyvät lähtöarvot identiteetin säilyttämiseen
    const num_inference_steps = clampNumber(body.num_inference_steps, 10, 60, 30);
    const guidance_scale = clampNumber(body.guidance_scale, 0.1, 20, 5);
    const ip_adapter_scale = clampNumber(body.ip_adapter_scale, 0, 2, 0.7);
    const identity_controlnet_conditioning_scale = clampNumber(
      body.identity_controlnet_conditioning_scale,
      0,
      2,
      0.9 // hieman yli defaultin (0.7) -> yleensä parempi identiteetille
    );

    const controlnet_selection =
      (body.controlnet_selection as "pose" | "canny" | "depth" | undefined) ?? "canny";
    const controlnet_conditioning_scale = clampNumber(body.controlnet_conditioning_scale, 0, 2, 0.4);

    const enhance_face_region = body.enhance_face_region ?? true;

    const seed =
      body.seed !== undefined
        ? Math.floor(clampNumber(body.seed, 0, 2_147_483_647, 42))
        : undefined;

    const result: any = await fal.subscribe("fal-ai/instantid/standard", {
      input: {
        face_image_url: faceImage, // required :contentReference[oaicite:3]{index=3}
        prompt, // required :contentReference[oaicite:4]{index=4}
        style, // :contentReference[oaicite:5]{index=5}
        negative_prompt, // :contentReference[oaicite:6]{index=6}

        num_inference_steps, // :contentReference[oaicite:7]{index=7}
        guidance_scale, // :contentReference[oaicite:8]{index=8}

        controlnet_selection, // :contentReference[oaicite:9]{index=9}
        controlnet_conditioning_scale, // :contentReference[oaicite:10]{index=10}

        ip_adapter_scale, // :contentReference[oaicite:11]{index=11}
        identity_controlnet_conditioning_scale, // :contentReference[oaicite:12]{index=12}

        enhance_face_region, // :contentReference[oaicite:13]{index=13}

        ...(seed !== undefined ? { seed } : {}),
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          (update.logs ?? []).map((l: any) => l.message).forEach(console.log);
        }
      },
    });

    // Output schema: result.data.image.url (tai serverless-clientissä joskus suoraan result.image.url) :contentReference[oaicite:14]{index=14}
    const imageObj = result?.data?.image ?? result?.image;
    const imageUrl: string | undefined = imageObj?.url;

    if (!imageUrl) {
      console.error("Full result:", JSON.stringify(result, null, 2));
      throw new Error("Fal.ai ei palauttanut image.url:ia (tuntematon vastausmuoto).");
    }

    const base64Out = await urlToBase64(imageUrl);

    return new Response(
      JSON.stringify({
        image: base64Out,
        contentType: imageObj?.content_type ?? "image/png",
        seed: result?.data?.seed ?? result?.seed,
        message: "Luotu Fal.ai InstantID Standard -mallilla",
        meta: {
          style,
          num_inference_steps,
          guidance_scale,
          ip_adapter_scale,
          identity_controlnet_conditioning_scale,
          controlnet_selection,
          controlnet_conditioning_scale,
          enhance_face_region,
          seed,
        },
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
