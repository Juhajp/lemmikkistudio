import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // TÄMÄ ON SE MALLI. Nimi viittaa suoraan kuvan generointiin Gemini-rungon sisällä.
  const MODEL_NAME = "models/gemini-2.0-flash-exp-image-generation";

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    console.log(`Sending Image-to-Image request to ${MODEL_NAME}...`);

    // Gemini-mallit käyttävät generateContent-endpointtia
    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          // 1. Ohjeistus (Prompt)
          { text: `
            Edit the input image to look like a professional studio portrait.
            
            IMPORTANT:
            - Keep the person's face and identity EXACTLY as they are. This is an editing task, not a generation task.
            - Change the clothes to a dark grey smart casual blazer.
            - Change the background to a solid dark neutral grey #141414.
            - Improve lighting to soft cinematic studio lighting.
            - Output the result as an image.
            ` 
          },
          // 2. Input-kuva (Base64)
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }],
      // Varmistetaan, ettei turvasuodatin estä kuvan luomista
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ],
      // Pyydetään mallia tuottamaan yksi kandidaatti
      generationConfig: {
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
      console.error("Gemini Image Gen Error:", err);
      throw new Error(`Model Error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    
    // Tarkistetaan vastaus
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    // Debug: Jos tulee stop reason, logataan se
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
       console.warn("Finish Reason:", candidate.finishReason);
    }

    if (part?.inline_data?.data) {
        // ONNISTUI: Saimme kuvan!
        return new Response(JSON.stringify({ 
          image: part.inline_data.data, 
          message: `Luotu suoraan mallilla: ${MODEL_NAME}` 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    } else if (part?.text) {
        // Epäonnistui: Malli vastasi tekstillä
        console.log("Malli vastasi tekstillä:", part.text);
        
        // Jos malli sanoo "I cannot...", se on merkki siitä, että se kieltäytyy tehtävästä.
        // Mutta palautetaan se viestinä, jotta näet mitä se sanoo.
        throw new Error(`Malli kieltäytyi kuvasta ja vastasi: "${part.text}"`);
    } else {
        throw new Error("Malli vastasi, mutta ei antanut kuvaa eikä tekstiä.");
    }

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};