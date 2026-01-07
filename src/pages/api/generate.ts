import type { APIRoute } from 'astro';
// KORJAUS: Tuodaan koko kirjasto nimiavaruutena 'fal', koska kyseessä on CommonJS-moduuli
import * as fal from '@fal-ai/serverless-client';

export const POST: APIRoute = async ({ request }) => {
  // Varmista että olet lisännyt FAL_KEY:n .env tiedostoon ja Verceliin
  const FAL_KEY = import.meta.env.FAL_KEY || process.env.FAL_KEY;

  if (!FAL_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: FAL_KEY missing' }), { status: 500 });
  }

  // Fal vaatii configuroinnin näin server-side käytössä
  fal.config({
    credentials: FAL_KEY,
  });

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    console.log("Starting generation with Fal.ai (Flux PuLID)...");

    // Fal.ai:n Flux PuLID -malli
    // Käytetään 'any' tyyppiä resultille välttämään TypeScript-ongelmat tässä nopeassa korjauksessa
    const result: any = await fal.subscribe("fal-ai/flux/pulid", {
      input: {
        // Fal ottaa data-urin (base64) suoraan image_url kenttään
        image_url: base64Image,
        prompt: "A professional studio portrait of a person wearing a smart casual dark grey blazer. Background is solid dark neutral grey #141414. Soft cinematic studio lighting, rim light, sharp focus on eyes, 85mm lens, photorealistic, 8k, highly detailed skin texture, masterpiece.",
        identity_weight: 1.0,
        guidance_scale: 3.5,
        num_inference_steps: 20,
        width: 896,
        height: 1152,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
           console.log("Fal.ai processing...");
        }
      },
    });

    console.log("Fal.ai Result:", JSON.stringify(result, null, 2));

    // Fal palauttaa suoraan JSONin, jossa 'images' on lista objekteja { url: "..." }
    const imageUrl = result.images?.[0]?.url;

    if (!imageUrl) {
        throw new Error("Fal.ai ei palauttanut kuvan URLia.");
    }

    // Haetaan kuva URL:sta ja muutetaan Base64:ksi (jotta frontend toimii kuten ennenkin)
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Result = Buffer.from(imageBuffer).toString('base64');

    return new Response(JSON.stringify({ 
      image: base64Result, 
      message: "Luotu Fal.ai Flux PuLID -mallilla" 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fal.ai Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Generation failed' }), { status: 500 });
  }
};