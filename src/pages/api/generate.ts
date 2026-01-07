import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'API Key missing' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    // 1. Puhdistetaan Base64 (poistetaan "data:image/jpeg;base64," alku)
    // Tämä on kriittinen vaihe.
    const base64Data = base64Image.includes(',') 
      ? base64Image.split(',')[1] 
      : base64Image;

    // 2. Määritellään Googlen REST API -osoite (Flash-malli)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    // 3. Rakennetaan pyyntö manuaalisesti (Raw Fetch)
    const payload = {
      contents: [{
        parts: [
          { text: "Analyze this image. Describe the person's appearance and facial features in detail." },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }]
    };

    console.log("Sending request to Google REST API...");

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // 4. Käsitellään vastaus
    if (!googleResponse.ok) {
      const errorData = await googleResponse.json();
      console.error("Google API Error:", JSON.stringify(errorData, null, 2));
      
      // Palautetaan TARKKA virhe Googlelta
      return new Response(JSON.stringify({ 
        error: `Google API Error: ${errorData.error?.message || googleResponse.statusText}` 
      }), { status: googleResponse.status });
    }

    const data = await googleResponse.json();
    
    // Kaivetaan teksti vastauksesta
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No description generated.";
    
    console.log("Success:", text.substring(0, 50) + "...");

    return new Response(JSON.stringify({ 
      image: base64Data, 
      message: text 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Server Fetch Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500 });
  }
};