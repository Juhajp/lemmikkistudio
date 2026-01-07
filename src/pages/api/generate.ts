import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'API Key missing' }), { status: 500 });
  }

  // Määritellään malli. Kokeillaan "Pro"-versiota, joka on usein vakiomalli.
  // Jos tämäkään ei toimi, koodi tulostaa listan toimivista malleista.
  const MODEL_NAME = "gemini-1.5-pro"; 

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // --- YRITYS 1: Generointi ---
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [{
        parts: [
          { text: "Analyze this image. Describe the person's appearance, age, and expression in detail." },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    };

    console.log(`Attempting to use model: ${MODEL_NAME}...`);
    
    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!googleResponse.ok) {
      const errorData = await googleResponse.json();
      console.error("Generointi epäonnistui:", JSON.stringify(errorData, null, 2));

      // --- DIAGNOSTIIKKA: Listataan saatavilla olevat mallit ---
      // Jos saamme 404, katsotaan mihin malleihin avaimella ON oikeus.
      if (googleResponse.status === 404) {
        console.log("Malli ei löytynyt. Haetaan lista saatavilla olevista malleista...");
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        const listResponse = await fetch(listUrl);
        const listData = await listResponse.json();
        
        console.log("------------------------------------------------");
        console.log("TÄSSÄ OVAT MALLIT, JOITA AVAIMESI VOI KÄYTTÄÄ:");
        console.log(listData.models?.map((m: any) => m.name) || "Ei malleja");
        console.log("------------------------------------------------");
        
        return new Response(JSON.stringify({ 
          error: `Malli '${MODEL_NAME}' puuttuu. Katso Vercelin lokit (Logs) nähdäksesi toimivat mallit.` 
        }), { status: 404 });
      }

      return new Response(JSON.stringify({ error: `Google Error: ${errorData.error?.message}` }), { status: googleResponse.status });
    }

    const data = await googleResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No description.";

    return new Response(JSON.stringify({ image: base64Data, message: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fatal Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};