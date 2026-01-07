import type { APIRoute } from 'astro';
import Replicate from 'replicate';

export const POST: APIRoute = async ({ request }) => {
  // MUISTA: Päivitä uusi turvallinen avain .env-tiedostoon ja Verceliin!
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

    console.log("Fetching latest Flux PuLID version (zsxkib)...");

    // 1. Haetaan oikea malli: zsxkib/flux-pulid
    // Tämä on Replicaten suosituin julkinen versio tästä mallista.
    const model = await replicate.models.get("zsxkib", "flux-pulid");
    const latestVersion = model.latest_version?.id;

    if (!latestVersion) {
      throw new Error("Flux PuLID -mallin versiota ei löytynyt.");
    }

    console.log(`Starting generation with version: ${latestVersion}`);

    // 2. Ajetaan malli
    const output = await replicate.run(
      `zsxkib/flux-pulid:${latestVersion}`,
      {
        input: {
          main_face_image: base64Image,
          prompt: "A professional studio portrait of a person wearing a smart casual dark grey blazer. Background is solid dark neutral grey #141414. Soft cinematic studio lighting, rim light, sharp focus on eyes, 85mm lens, photorealistic, 8k, highly detailed skin texture, masterpiece.",
          
          // HUOM: Tämän mallin parametrit voivat olla hieman erilaiset
          // 'identity_weight' sijaan käytetään usein 'mix_weight' tai vastaavaa,
          // mutta 'main_face_image' on vakio. Flux hoitaa loput.
          width: 896,
          height: 1152,
          guidance_scale: 3.5,
          num_inference_steps: 20,
          true_cfg: 1.0, 
          start_step: 0,
          timestep_to_start_cfg: 1,
          max_sequence_length: 128
        }
      }
    );

    console.log("Replicate Output:", output);

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