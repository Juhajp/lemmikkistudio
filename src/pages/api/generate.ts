import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const API_KEY = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Config Error: API Key missing' }), { status: 500 });
  }

  // Käytetään parhaita malleja listaltasi
  const VISION_MODEL = "models/gemini-2.0-flash"; 
  const IMAGE_MODEL = "models/imagen-4.0-ultra-generate-preview-06-06";

  // SINUN MÄÄRITTELEMÄ VAKIO-PROMPTI
  const USER_STYLE_PROMPT = `
  A professional, high-resolution, profile photo, maintaining the exact facial structure, identity, and key features of the person. 
  The subject is framed from the chest up, with ample headroom and negative space above their head, ensuring the top of their head is not cropped. 
  The person looks directly at the camera, and the subject’s body is also directly facing the camera. 
  They are styled for a professional photo studio shoot, wearing a smart casual blazer. 
  The background is a solid ‘#141414’ neutral studio. 
  Shot from a high angle with bright and airy soft, diffused studio lighting, gently illuminating the face and creating a subtle catchlight in the eyes, conveying a sense of clarity. 
  Captured on an 85mm f/1.8 lens with a shallow depth of field, exquisite focus on the eyes, and beautiful, soft bokeh. 
  Observe crisp detail on the fabric texture of the blazer, individual strands of hair, and natural, realistic skin texture. 
  The atmosphere exudes confidence, professionalism, and approachability. 
  Clean and bright cinematic color grading with subtle warmth and balanced tones, ensuring a polished and contemporary feel.
  `;

  try {
    const body = await request.json();
    const base64Image = body.image;

    if (!base64Image) {
      return new Response(JSON.stringify({ error: 'No image data' }), { status: 400 });
    }

    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // --- VAIHE 1: Gemini 2.0 analysoi kuvan ja yhdistää sen sinun promptiisi ---
    console.log(`Analyzing image with ${VISION_MODEL}...`);
    
    const visionUrl = `https://generativelanguage.googleapis.com/v1beta/${VISION_MODEL}:generateContent?key=${API_KEY}`;
    
    const visionPayload = {
      contents: [{
        parts: [
          { text: `
            Analyze the person in this image (facial features, age, gender, ethnicity, hair style, glasses if any). 
            
            Your task is to create a final image generation prompt for Imagen 4.0.
            
            COMBINE the physical description of this person INTO the following mandatory style template. 
            Replace "the person" in the template with the specific physical description you see.
            
            STYLE TEMPLATE:
            "${USER_STYLE_PROMPT}"
            
            Output ONLY the final merged prompt text.
            ` 
          },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const visionResponse = await fetch(visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visionPayload)
    });

    if (!visionResponse.ok) {
      const err = await visionResponse.json();
      throw new Error(`Vision Error (${VISION_MODEL}): ${JSON.stringify(err)}`);
    }

    const visionData = await visionResponse.json();
    const finalPrompt = visionData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!finalPrompt) throw new Error("Vision model failed to create the prompt.");
    
    // Logataan lopullinen prompti, jotta näet Vercelin logeista miten Gemini yhdisti asiat
    console.log("FINAL MERGED PROMPT:", finalPrompt);


    // --- VAIHE 2: Imagen 4.0 Ultra generoi kuvan ---
    console.log(`Generating image with ${IMAGE_MODEL}...`);

    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/${IMAGE_MODEL}:predict?key=${API_KEY}`;
    
    const imagenPayload = {
      instances: [
        { prompt: finalPrompt }
      ],
      parameters: {
        aspectRatio: "3:4", // Muotokuva
        sampleCount: 1,
        // Negatiivinen prompti varmistamaan laatua
        negativePrompt: "low quality, distorted face, bad anatomy, cropped head, close up, text, watermark, colorful background, bright background"
      }
    };

    const imagenResponse = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imagenPayload)
    });

    if (!imagenResponse.ok) {
      const err = await imagenResponse.json();
      throw new Error(`Imagen Error: ${JSON.stringify(err)}`);
    }

    const imagenData = await imagenResponse.json();
    
    // Tarkistetaan data
    const prediction = imagenData.predictions?.[0];
    const generatedBase64 = prediction?.bytesBase64Encoded || prediction?.bytes || prediction;

    if (!generatedBase64) {
      throw new Error("Imagen generation successful but no image data found.");
    }

    return new Response(JSON.stringify({ 
      image: generatedBase64, 
      message: "Kuva luotu onnistuneesti." 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Process Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown processing