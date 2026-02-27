import type { APIRoute } from "astro";
import Stripe from 'stripe';
import * as fal from "@fal-ai/serverless-client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { randomUUID } from "crypto";

export const POST: APIRoute = async ({ request }) => {
  const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const FAL_KEY = import.meta.env.FAL_KEY ?? process.env.FAL_KEY;
  const BLOB_READ_WRITE_TOKEN = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Server Config Error: STRIPE_SECRET_KEY missing" }), { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    const { imageUrl, thumbnailUrl } = await request.json();

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "Image URL missing" }), { status: 400 });
    }

    // Kassalla näytetään edelleen thumbnail (sama resoluutio kuin nyt)
    const displayImage = thumbnailUrl || imageUrl;

    // Upscale 3x ennen ostoa: Fal SeedVR → Blob (tiedostonimi alkuun "upscale")
    let upscaledImageUrl: string = imageUrl;
    if (FAL_KEY && BLOB_READ_WRITE_TOKEN) {
      try {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const datePrefix = `lem-${dd}${mm}${yy}`;

        fal.config({ credentials: FAL_KEY });
        const upscaleResult: any = await fal.subscribe("fal-ai/seedvr/upscale/image", {
          input: {
            image_url: imageUrl,
            upscale_mode: "factor",
            upscale_factor: 3,
            noise_scale: 0.1,
            output_format: "jpg",
          },
          logs: true,
          onQueueUpdate: (update: any) => {
            if (update.status === "IN_PROGRESS") {
              (update.logs ?? []).map((l: any) => l.message).forEach(console.log);
            }
          },
        });
        const outUrl = upscaleResult?.data?.image?.url ?? upscaleResult?.image?.url;
        if (outUrl) {
          const imageRes = await fetch(outUrl);
          if (imageRes.ok) {
            const buffer = Buffer.from(await imageRes.arrayBuffer());
            const jpegBuffer = await sharp(buffer)
              .jpeg({ quality: 95 })
              .toBuffer();
            const blob = await put(`portraits/${datePrefix}-upscale-${randomUUID()}.jpg`, jpegBuffer, {
              access: "public",
              contentType: "image/jpeg",
              token: BLOB_READ_WRITE_TOKEN,
            });
            upscaledImageUrl = blob.url;
            console.log("Upscale saved to Blob:", upscaledImageUrl);
          }
        }
      } catch (upscaleErr: any) {
        console.error("Upscale failed, using original image:", upscaleErr?.message ?? upscaleErr);
        // Käytetään alkuperäistä kuvaa, jotta ostovirta ei katkea
      }
    } else {
      console.warn("FAL_KEY or BLOB_READ_WRITE_TOKEN missing, skipping upscale");
    }

    // Luodaan Stripe Checkout -sessio (metadata: molemmat kuvat; käyttäjälle tarjotaan vain upscalattu)
    const session = await stripe.checkout.sessions.create({
      automatic_tax: {
        enabled: true,
      },
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Ammattimainen muotokuva lemmikistäsi',
              description: 'Täysikokoinen, vesileimaton studiokuva koirastasi (1024x1536px)',
              images: [displayImage],
            },
            unit_amount: 790,
            tax_behavior: 'inclusive',
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${new URL(request.url).origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${new URL(request.url).origin}/`,
      payment_intent_data: {
        statement_descriptor: 'LEMMIKKISTUDIO',
      },
      metadata: {
        project: 'lemmikkistudio',
        original_image_url: imageUrl,
        upscaled_image_url: upscaledImageUrl,
      },
      branding_settings: {
        display_name: 'Lemmikkistudio',
      },
    });

    return new Response(JSON.stringify({ url: session.url }));
  } catch (error: any) {
    console.error("Stripe Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
