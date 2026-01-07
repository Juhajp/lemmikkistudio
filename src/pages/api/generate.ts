import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Kokeillaan Imagen 3.0:aa, joka tukee usein "editointia" paremmin kuin 4.0-preview
  // Jos haluat väkisin käyttää 4.0:aa, vaihda tähän: "models/imagen-4.0-generate-001"
  const IMAGE_MODEL = "models/imagen-3.0-generate-001";

  // Tämä on puhtaasti tyyliohjeistus. Emme kuvaile henkilöä, koska AI näkee kuvan.
  const STYLE_PROMPT = `
  Change the style of this photo to a professional studio portrait.
  Keep the person's identity, facial features, and pose exactly as they are.
  
  Wear a smart casual blazer.
  Background: Solid dark neutral grey #141414.
  Lighting: Soft cinematic studio lighting, rim light, sharp focus on eyes.
  Style: 85mm lens, photorealistic, 8k, highly detailed skin texture.
  `;

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // --- SUORA LÄHETYS IMAGENILLE ---
    console.log(`Sending image directly to ${IMAGE_MODEL}...`);

    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/${IMAGE_MODEL}:predict?key=${API_KEY}`;
    
    // Rakennetaan payload, jossa on sekä kuva ETTÄ prompti.
    // Tämä on "Image Editing" tai "Instruction based editing" pyyntö.
    const imagenPayload = {
      instances: [
        { 
          prompt: STYLE_PROMPT,
          image: {
             bytesBase64Encoded: base64Data
          }
        }
      ],
      parameters: {
        aspectRatio: "3:4", 
        sampleCount: 1,
        // Nämä parametrit ovat tärkeitä kun muokataan olemassa olevaa kuvaa:
        // personGeneration: "allow_adult" varmistaa että ihmisiä saa generoida
        personGeneration: "allow_adult",
        safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      }
    };

    const imagenResponse = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imagenPayload)
    });

    if (!imagenResponse.ok) {
      const err = await imagenResponse.json();
      console.error("Imagen API Error:", JSON.stringify(err, null, 2));
      
      // Jos API valittaa, että "image input not supported", tiedämme että malli on väärä
      throw new Error(`Imagen Error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const imagenData = await imagenResponse.json();
    
    // Tarkistetaan vastaus (rakenne voi vaihdella)
    const prediction = imagenData.predictions?.[0];
    const generatedBase64 = prediction?.bytesBase64Encoded || prediction?.bytes || prediction;

    if (!generatedBase64) {
      throw new Error("Generointi onnistui, mutta kuadataa ei löytynyt vastauksesta.");
    }

    return new Response(JSON.stringify({ 
      image: generatedBase64, 
      message: `Suora editointi mallilla: ${IMAGE_MODEL}` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown processing error' 
    }), { status: 500 });
  }
};