import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Pysytään tässä mallissa, kuten pyysit
  const MODEL_NAME = "models/gemini-3-pro-image-preview";

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    console.log(`Sending request to ${MODEL_NAME} with SAFETY OVERRIDES...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: `
            Task: Transform the input image into a professional studio headshot.
            
            CRITICAL INSTRUCTION: You MUST PRESERVE the facial identity of the person in the image. 
            Do not change their features, age, or expression. Only change the environment and clothing.
            
            Style:
            - Outfit: Dark grey smart casual blazer.
            - Background: Solid dark neutral grey #141414.
            - Lighting: Soft cinematic studio lighting.
            - Output: High-resolution image.
            ` 
          },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }],
      // TÄMÄ ON UUSI OSIO: Poistetaan turvaestot, jotka estävät ihmisten generoinnin
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
    
    // --- DEBUGGAUS: Katsotaan mitä sieltä oikeasti tulee ---
    // Jos vastaus on tyhjä, tulostetaan syy (finishReason) Vercelin lokiin.
    if (!data.candidates || data.candidates.length === 0) {
        console.log("FULL RESPONSE (EMPTY):", JSON.stringify(data, null, 2));
        throw new Error("Malli ei palauttanut mitään (todennäköisesti turvasuodatin esti kuvan).");
    }

    const candidate = data.candidates[0];
    const part = candidate.content?.parts?.[0];

    // Tarkistetaan miksi generointi lopetettiin
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
        console.warn("Generointi keskeytyi syystä:", candidate.finishReason);
    }
    
    if (part?.inline_data?.data) {
        return new Response(JSON.stringify({ 
          image: part.inline_data.data, 
          message: `Luotu onnistuneesti mallilla: ${MODEL_NAME}` 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    } else if (part?.text) {
        console.log("Malli vastasi tekstillä:", part.text);
        throw new Error(`Malli vastasi tekstillä (ei kuvalla): "${part.text}"`);
    } else {
        console.log("TUNTEMATON DATA:", JSON.stringify(candidate, null, 2));
        throw new Error(`Malli vastasi, mutta data oli tunnistamatonta. FinishReason: ${candidate.finishReason}`);
    }

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};