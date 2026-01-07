import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // KÄYTETÄÄN PYYTÄMÄÄSI GEMINI 3 -MALLIA
  const MODEL_NAME = "models/gemini-3-pro-image-preview";

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    console.log(`Sending request to ${MODEL_NAME}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          // Prompti: Pyydetään selkeästi kuvaa
          { text: `
            Function: Modify the input image to create a professional studio portrait.
            
            Instructions:
            1. Preserve the Identity: The person's facial features must remain exactly unchanged.
            2. Style: Apply a professional photoshoot style.
            3. Outfit: Smart casual blazer.
            4. Background: Solid dark neutral grey #141414.
            5. Output: Generate the result as an image.
            ` 
          },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
      // POISTETTU: generationConfig, joka aiheutti virheen.
      // Annetaan mallin toimia oletusasetuksilla.
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Gemini 3 API Error:", err);
      throw new Error(`Gemini 3 Error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    
    // Tarkistetaan vastaus: Onko siellä kuva (inline_data) vai tekstiä?
    const candidate = data.candidates?.[0]?.content?.parts?.[0];
    
    if (candidate?.inline_data?.data) {
        // ONNISTUI: Malli palautti kuvan
        return new Response(JSON.stringify({ 
          image: candidate.inline_data.data, 
          message: `Luotu onnistuneesti mallilla: ${MODEL_NAME}` 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    } else if (candidate?.text) {
        // Jos malli palauttaa vain tekstiä (esim. kieltäytyy tai kuvailee), näytetään se virheenä
        // jotta tiedämme mitä tapahtui.
        console.log("Malli vastasi tekstillä:", candidate.text);
        throw new Error(`Malli vastasi tekstillä kuvan sijaan: "${candidate.text}"`);
    } else {
        throw new Error("Malli vastasi tyhjää tai tunnistamatonta dataa.");
    }

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};