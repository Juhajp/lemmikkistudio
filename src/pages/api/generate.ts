import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Tämä malli todistetusti toimii nyt!
  const MODEL_NAME = "models/gemini-2.0-flash-exp-image-generation";

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
          { text: `
            Task: Edit the input image to look like a professional studio portrait.
            
            STRICT REQUIREMENT: Keep the person's face and identity EXACTLY as they are. This is an editing task.
            
            Changes to apply:
            - Outfit: Dark grey smart casual blazer.
            - Background: Solid dark neutral grey #141414.
            - Lighting: Soft cinematic studio lighting.
            - Output: Generate the image.
            ` 
          },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("API Error:", err);
      throw new Error(`API Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    // --- KORJATTU LOGIIKKA ---
    // Gemini voi vastata moniosaisella viestillä (Parts).
    // Osa 1 voi olla tekstiä ("Here is the image") ja Osa 2 voi olla itse kuva.
    // Meidän pitää etsiä KAIKKI osat läpi.

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Etsitään se osa, jossa on kuva (inline_data)
    const imagePart = parts.find((p: any) => p.inline_data && p.inline_data.data);
    
    // Etsitään myös teksti, jos sellaista tuli (kiva näyttää käyttäjälle)
    const textPart = parts.find((p: any) => p.text);
    const aiMessage = textPart ? textPart.text : "Kuva luotu onnistuneesti.";

    if (imagePart) {
        // LÖYTYI!
        console.log("Kuva löytyi vastauksesta!");
        return new Response(JSON.stringify({ 
          image: imagePart.inline_data.data, 
          message: aiMessage
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    } else {
        // Jos loopattiin kaikki läpi eikä kuvaa löytynyt, sitten se on virhe.
        console.warn("Vastaus ei sisältänyt kuvaa. Teksti oli:", aiMessage);
        throw new Error(`Malli vastasi vain tekstillä: "${aiMessage}"`);
    }

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};