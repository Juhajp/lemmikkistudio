import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Kokeillaan listaltasi löytynyttä uusinta Gemini 3 -mallia
  const MODEL_NAME = "models/gemini-3-pro-image-preview";

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    console.log(`Attempting generation with hybrid model: ${MODEL_NAME}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    // Gemini 3:lle lähetetään pyyntö, jossa pyydetään kuvaa vastaukseksi.
    const payload = {
      contents: [{
        parts: [
          // PROMPTI: Ohjeistetaan mallia toimimaan kuin kuvankäsittelijä
          { text: `
            You are an expert portrait photographer and editor.
            
            TASK: Generate a new professional studio portrait based on the person in the input image.
            
            REQUIREMENTS:
            1. KEEP THE IDENTITY: The person's face (eyes, nose, mouth, age, unique features) must look EXACTLY like the input image.
            2. CHANGE THE STYLE:
               - Outfit: Smart casual blazer.
               - Background: Solid dark neutral grey #141414.
               - Lighting: Soft cinematic studio lighting, professional rim light.
               - Camera: 85mm lens, f/1.8, sharp focus on eyes.
            
            Output ONLY the generated image.
            ` 
          },
          // INPUT KUVA
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }],
      // Tärkeä asetus: Pyydetään vastausta kuvamuodossa (jos malli tukee tätä)
      generationConfig: {
        responseMimeType: "image/jpeg" 
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      // Jos tämä malli ei tue suoraa kuvagenerointia generateContent-kutsulla,
      // se antaa tässä virheen.
      console.error("Gemini 3 Error:", err);
      throw new Error(`Gemini 3 Error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    
    // Gemini 3:n vastausrakenne kuvalle voi olla joko "inlineData" tai "text" (jos se epäonnistui ja vastasi tekstillä)
    const candidate = data.candidates?.[0]?.content?.parts?.[0];
    
    let generatedBase64 = "";
    
    if (candidate?.inline_data?.data) {
        // Hienoa! Malli palautti kuvan suoraan.
        generatedBase64 = candidate.inline_data.data;
    } else if (candidate?.text) {
        // Jos malli vastasi tekstillä (esim. "I cannot do that"), heitetään virhe
        throw new Error(`Malli vastasi tekstillä kuvan sijaan: "${candidate.text}"`);
    } else {
        throw new Error("Tuntematon vastausmuoto Gemini 3:lta.");
    }

    return new Response(JSON.stringify({ 
      image: generatedBase64, 
      message: `Luotu suoraan mallilla: ${MODEL_NAME}` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};