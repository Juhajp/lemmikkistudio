import type { APIRoute } from 'astro';
import * as fal from '@fal-ai/serverless-client';

export const POST: APIRoute = async ({ request }) => {
  const FAL_KEY = import.meta.env.FAL_KEY || process.env.FAL_KEY;

  if (!FAL_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: FAL_KEY missing' }), { status: 500 });
  }

  fal.config({
    credentials: FAL_KEY,
  });

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    console.log("Starting generation with Fal.ai (Flux Dev)...");

    // KORJATTU MALLI: Käytetään standardia 'fal-ai/flux/dev' mallia.
    // Tämä on varmin valinta, joka ei anna 404-virhettä.
    const result: any = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        // Kuva syötetään image_url-kenttään
        image_url: base64Image,
        
        // Prompti ohjaa muutosta
        prompt: "A professional studio portrait of a person wearing a smart casual dark grey blazer. Background is solid dark neutral grey #141414. Soft cinematic studio lighting, rim light, sharp focus on eyes, 85mm lens, photorealistic, 8k, highly detailed skin texture, masterpiece.",
        
        // Strength (0.0 - 1.0) määrittää kuinka paljon kuvaa saa muuttaa.
        // 0.85 on hyvä tasapaino: muuttaa vaatteet, mutta säilyttää kasvojen rakenteen.
        strength: 0.85, 
        
        guidance_scale: 3.5,
        num_inference_steps: 28,
        width: 896,
        height: 1152,
        enable_safety_checker: false // Yritetään välttää turhia blokkauksia
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
           console.log("Fal.ai processing...");
        }
      },
    });

    console.log("Fal.ai Result:", JSON.stringify(result, null, 2));

    const imageUrl = result.images?.[0]?.url;

    if (!imageUrl) {
        throw new Error("Fal.ai ei palauttanut kuvan URLia.");
    }

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Result = Buffer.from(imageBuffer).toString('base64');

    return new Response(JSON.stringify({ 
      image: base64Result, 
      message: "Luotu Fal.ai Flux Dev -mallilla" 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fal.ai Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Generation failed' }), { status: 500 });
  }
};