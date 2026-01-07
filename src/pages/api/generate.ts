import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Määritellään mallit listaltasi
  const VISION_MODEL = "models/gemini-2.0-flash"; // Nopea ja älykäs näkemään
  const IMAGE_MODEL = "models/imagen-4.0-ultra-generate-preview-06-06"; // Paras kuvanlaatu

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // --- VAIHE 1: Analysoidaan alkuperäinen kuva (Gemini 2.0) ---
    console.log(`Analyzing image with ${VISION_MODEL}...`);
    
    const visionUrl = `https://generativelanguage.googleapis.com/v1beta/${VISION_MODEL}:generateContent?key=${API_KEY}`;
    
    const visionPayload = {
      contents: [{
        parts: [
          // Pyydämme Geminiä luomaan tarkan promptin Imagenille
          { text: "Analyze this image and write a highly detailed text prompt that can be used to re-generate a portrait of this person. Describe their age, gender, facial features, hair, clothing, and expression precisely. Add artistic style tags for 'professional studio portrait, 8k resolution, photorealistic'." },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const visionResponse = await fetch(visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visionPayload)
    });

    if (!visionResponse.ok) {
      const err = await visionResponse.json();
      throw new Error(`Vision Error (${VISION_MODEL}): ${JSON.stringify(err)}`);
    }

    const visionData = await visionResponse.json();
    const imagePrompt = visionData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!imagePrompt) throw new Error("Vision model failed to describe the image.");
    console.log("Generated Prompt:", imagePrompt.substring(0, 100) + "...");


    // --- VAIHE 2: Generoidaan uusi kuva (Imagen 4.0 Ultra) ---
    console.log(`Generating image with ${IMAGE_MODEL}...`);

    // Huom: Imagen käyttää 'predict' endpointia, ei 'generateContent'
    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/${IMAGE_MODEL}:predict?key=${API_KEY}`;
    
    const imagenPayload = {
      instances: [
        { prompt: imagePrompt }
      ],
      parameters: {
        aspectRatio: "3:4", // Muotokuvasuhde
        sampleCount: 1,
        // Voit lisätä tähän negative_prompt jos haluat
      }
    };

    const imagenResponse = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imagenPayload)
    });

    if (!imagenResponse.ok) {
      const err = await imagenResponse.json();
      // Fallback: Jos Imagen 4 preview ei toimi tällä endpointilla, heitetään virhe
      throw new Error(`Imagen Error (${IMAGE_MODEL}): ${JSON.stringify(err)}`);
    }

    const imagenData = await imagenResponse.json();
    
    // Imagen palauttaa kuvan usein "bytesBase64Encoded" kentässä
    // Tarkistetaan data structure, koska se vaihtelee versioittain
    const prediction = imagenData.predictions?.[0];
    const generatedBase64 = prediction?.bytesBase64Encoded || prediction?.bytes || prediction;

    if (!generatedBase64) {
      throw new Error("Imagen generation successful but no image data found in response.");
    }

    return new Response(JSON.stringify({ 
      image: generatedBase64, 
      message: `Luotu mallilla: ${IMAGE_MODEL}` 
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