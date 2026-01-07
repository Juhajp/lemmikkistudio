import type { APIRoute } from 'astro';
import Replicate from 'replicate';

export const POST: APIRoute = async ({ request }) => {
  // Hakee avaimen ympäristömuuttujista
  const REPLICATE_API_TOKEN = import.meta.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_TOKEN;

  if (!REPLICATE_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'Server Config Error: Replicate API Token missing' }), { status: 500 });
  }

  const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
  });

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    console.log("Starting generation with Flux PuLID (Replicate)...");

    // Flux PuLID säilyttää kasvojen identiteetin erittäin tarkasti
    const output = await replicate.run(
      "yan-ops/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb01125252",
      {
        input: {
          main_face_image: base64Image,
          prompt: "A professional studio portrait of a person wearing a smart casual dark grey blazer. Background is solid dark neutral grey #141414. Soft cinematic studio lighting, rim light, sharp focus on eyes, 85mm lens, photorealistic, 8k, highly detailed skin texture, masterpiece.",
          identity_weight: 1.0,
          guidance_scale: 3.5,
          num_inference_steps: 20,
          width: 896,
          height: 1152,
          negative_prompt: "bad quality, blurry, distorted face, cartoon, painting, 3d render, extra fingers, smile (if unwanted)"
        }
      }
    );

    console.log("Replicate Output:", output);

    // Replicate palauttaa yleensä URLin. Haetaan kuva sieltä ja muutetaan base64:ksi.
    let imageUrl = "";
    if (Array.isArray(output)) {
      imageUrl = String(output[0]);
    } else {
      imageUrl = String(output);
    }

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Result = Buffer.from(imageBuffer).toString('base64');

    return new Response(JSON.stringify({ 
      image: base64Result, 
      message: "Luotu Flux PuLID -mallilla" 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Replicate Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Generation failed' }), { status: 500 });
  }
};