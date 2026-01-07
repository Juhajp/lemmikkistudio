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

    console.log("Starting generation with Fal.ai (GPT-Image-1.5 Edit)...");

    // KORJATTU MALLI: Käytetään pyytämääsi 'fal-ai/gpt-image-1.5/edit' mallia.
    const result: any = await fal.subscribe("fal-ai/gpt-image-1.5/edit", {
      input: {
        // Kuva syötetään image_url-kenttään
        image_url: base64Image,
        
        // Prompti on nyt ohje (instruction) eikä vain kuvaus.
        // Tämä malli ymmärtää paremmin käskyjä "vaihda X", "pidä Y".
        prompt: "Based on the input image, keep the person's facial features and identity exactly the same. Change their clothing to a smart casual dark grey blazer. Replace the background with a solid dark neutral grey #141414 studio setting. Apply soft cinematic studio lighting with a subtle rim light.",
        
        // Tämä malli ei välttämättä tarvitse tai tue samoja lisäparametreja
        // (kuten strength, steps, jne.) kuin Flux, joten pidetään input yksinkertaisena.
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
           console.log("Fal.ai processing...");
        }
      },
    });

    console.log("Fal.ai Result:", JSON.stringify(result, null, 2));

    // Tarkistetaan tulos. Rakenne voi vaihdella malleittain.
    // Yleensä se on result.images[0].url tai suoraan result.image.url
    const imageUrl = result.images?.[0]?.url || result.image?.url;

    if (!imageUrl) {
        console.error("Full result object:", JSON.stringify(result, null, 2));
        throw new Error("Fal.ai ei palauttanut kuvan URLia (tuntematon vastausmuoto).");
    }

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Result = Buffer.from(imageBuffer).toString('base64');

    return new Response(JSON.stringify({ 
      image: base64Result, 
      message: "Luotu Fal.ai GPT-Image-1.5 Edit -mallilla" 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fal.ai Error:', error);
    // Jos virhe on Falin päästä, siinä on usein 'body'-kenttä, jossa on tarkempi syy
    const errorMessage = error.body?.detail || error.message || 'Generation failed';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
};