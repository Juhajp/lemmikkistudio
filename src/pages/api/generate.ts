import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  const MODEL_NAME = "models/gemini-2.0-flash-exp-image-generation";

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    console.log(`Sending STRICT request to ${MODEL_NAME}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: `
            SYSTEM INSTRUCTION: You are an image processing engine, NOT a chatbot.
            
            Task: Transform the input image into a professional studio portrait.
            
            RULES:
            1. Keep the person's face/identity EXACTLY as is.
            2. Change outfit to a dark grey blazer.
            3. Change background to solid #141414.
            4. OUTPUT REQUIREMENT: Return ONLY the image data. DO NOT output any text, do not say "Here is the image". Just the image.
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
      ],
      generationConfig: {
        // Yritetään pakottaa yksi vastaus
        candidateCount: 1
      }
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
    
    // --- DEBUG: TULOSTETAAN KOKO VASTAUS LOKIIN ---
    // Jos tämä epäonnistuu, mene Vercelin Logs-välilehdelle. 
    // Näet siellä kohdan "FULL GOOGLE RESPONSE", josta näemme mitä ihmettä malli oikein lähetti.
    console.log("FULL GOOGLE RESPONSE:", JSON.stringify(data, null, 2));

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Etsitään kuva
    const imagePart = parts.find((p: any) => p.inline_data && p.inline_data.data);
    const textPart = parts.find((p: any) => p.text);

    if (imagePart) {
        return new Response(JSON.stringify({ 
          image: imagePart.inline_data.data, 
          message: "Kuva luotu onnistuneesti." 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    } else {
        // Jos kuvaa ei ole, heitetään virhe, mutta kerrotaan myös mitä malli sanoi.
        const msg = textPart ? textPart.text : "Tyhjä vastaus";
        throw new Error(`Malli ei tuottanut kuvaa. Se vastasi: "${msg}" (Katso Vercel Logs nähdäksesi raakadatan)`);
    }

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};