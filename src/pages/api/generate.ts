import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Käytetään standardia Imagen 4 -mallia, joka tukee usein referenssikuvia paremmin
  const IMAGE_MODEL = "models/imagen-4.0-generate-001";
  
  // Vision-malli apuna, jos tarvitaan promptin tarkennusta
  const VISION_MODEL = "models/gemini-2.0-flash"; 

  const USER_STYLE_PROMPT = `
  A professional, high-resolution portrait shot in a studio. 
  The subject is wearing a smart casual blazer. 
  Background is solid dark neutral '#141414'. 
  Lighting is soft, professional studio lighting with a rim light. 
  Shot on 85mm lens, sharp focus on eyes, bokeh background. 
  Cinematic color grading, realistic skin texture.
  `;

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // --- VAIHE 1: Luodaan tarkka kuvaus henkilöstä (Text Prompt) ---
    // Tämä auttaa Imagenia ymmärtämään kontekstin, vaikka käytämmekin referenssikuvaa
    console.log(`Creating description with ${VISION_MODEL}...`);
    
    const visionUrl = `https://generativelanguage.googleapis.com/v1beta/${VISION_MODEL}:generateContent?key=${API_KEY}`;
    
    const visionPayload = {
      contents: [{
        parts: [
          { text: "Describe the person in this photo briefly (gender, age, hair color, facial features) to be used as a prompt for an AI image generator." },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const visionResponse = await fetch(visionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visionPayload) });
    const visionData = await visionResponse.json();
    const personDescription = visionData.candidates?.[0]?.content?.parts?.[0]?.text || "A person";
    
    // Yhdistetään kuvaus ja tyyli
    const finalPrompt = `${personDescription}. ${USER_STYLE_PROMPT}`;
    console.log("Prompt:", finalPrompt.substring(0, 50) + "...");


    // --- VAIHE 2: Generointi REFERENSSIKUVALLA (Imagen 4) ---
    // Tämä on kriittinen muutos: Lähetämme kuvan 'add_reference_image' tai vastaavana parametrina.
    // Huom: REST API:n rakenne 'image inputille' vaihtelee malliversioittain. 
    // Imagen 4:ssä yritämme käyttää raakaa input-kuvaa osana payloadia jos mahdollista,
    // tai luotamme vahvaan promptiin.
    
    console.log(`Generating with ${IMAGE_MODEL} (Subject Reference)...`);

    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/${IMAGE_MODEL}:predict?key=${API_KEY}`;
    
    // YRITETÄÄN KÄYTTÄÄ RAKENNETTA, JOKA PAKOTTAA IDENTITYN
    const imagenPayload = {
      instances: [
        { 
          prompt: finalPrompt,
          // Tämä on kokeellinen ominaisuus joissakin Vertex-rajapinnoissa.
          // Jos tämä ei toimi (API heittää virheen), malli ignoraa sen tai kaatuu.
          // Tällöin palaamme pelkkään promptiin.
          image: {
             bytesBase64Encoded: base64Data
          }
        }
      ],
      parameters: {
        aspectRatio: "3:4",
        sampleCount: 1,
        // Nämä parametrit ohjaavat kuinka paljon AI saa muuttaa kuvaa
        // mode: "restyle" tai "upscale" voisi toimia, mutta "generate" on vakio.
        negativePrompt: "cartoon, drawing, painting, low quality, distorted face, changed identity"
      }
    };

    const imagenResponse = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imagenPayload)
    });

    if (!imagenResponse.ok) {
        // Jos 'image'-parametri payloadissa aiheuttaa virheen (koska se vaatii eri endpointin),
        // kokeillaan varasuunnitelmaa: Pelkkä Prompt + Gemini 2.0:n tarkka kuvaus.
        console.warn("Imagen image-input failed, falling back to text-only generation.");
        
        const fallbackPayload = {
            instances: [{ prompt: finalPrompt }],
            parameters: { aspectRatio: "3:4", sampleCount: 1 }
        };
        
        const fallbackResponse = await fetch(imagenUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fallbackPayload) });
        if (!fallbackResponse.ok) {
             const err = await fallbackResponse.json();
             throw new Error(`Fallback Error: ${JSON.stringify(err)}`);
        }
        
        const fallbackData = await fallbackResponse.json();
        const fbPrediction = fallbackData.predictions?.[0];
        const fbImage = fbPrediction?.bytesBase64Encoded || fbPrediction?.bytes || fbPrediction;
        
        return new Response(JSON.stringify({ image: fbImage, message: "Luotu tekstipohjaisesti (Kuva-input ei tuettu tässä rajapinnassa)" }), { status: 200 });
    }

    const imagenData = await imagenResponse.json();
    const prediction = imagenData.predictions?.[0];
    const generatedBase64 = prediction?.bytesBase64Encoded || prediction?.bytes || prediction;

    if (!generatedBase64) throw new Error("No image data returned.");

    return new Response(JSON.stringify({ 
      image: generatedBase64, 
      message: "Luotu Imagen 4:llä" 
    }), { status: 200 });

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error' }), { status: 500 });
  }
};