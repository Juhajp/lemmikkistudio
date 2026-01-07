import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const POST: APIRoute = async ({ request }) => {
  // 1. Haetaan API-avain ympäristömuuttujista
  const API_KEY = import.meta.env.GOOGLE_API_KEY;
  
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error: No API Key found' }), { status: 500 });
  }

  try {
    // 2. Luetaan lähetetty data
    const body = await request.json();
    const base64Image = body.image; // Muodossa "data:image/jpeg;base64,..."

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), { status: 400 });
    }

    // Puhdistetaan Base64-header pois, jotta Google ymmärtää sen
    const base64Data = base64Image.split(',')[1] || base64Image;

    // 3. Alustetaan Gemini-malli
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Käytetään Flash-mallia, joka on nopea ja halpa/ilmainen
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. Lähetetään kuva Geminille analysoitavaksi
    // (Tämä todistaa, että backend-yhteys toimii)
    const result = await model.generateContent([
      "Analyze this image. Describe the person's appearance, style, and facial expression in a creative way like an art critic.",
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log("Gemini vastaus:", text);

    // 5. Palautetaan vastaus frontendiin
    // Koska emme vielä generoi uutta kuvatiedostoa, palautamme alkuperäisen kuvan
    // ja Geminin keksimän tekstin.
    return new Response(JSON.stringify({ 
      image: base64Data, // Palautetaan sama kuva toistaiseksi
      message: text      // Tämä näytetään konsolissa tai UI:ssa
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'AI processing failed' }), { status: 500 });
  }
};