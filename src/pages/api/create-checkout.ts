import type { APIRoute } from "astro";
import Stripe from 'stripe';
import * as fal from "@fal-ai/serverless-client";
import { put } from "@vercel/blob";
import { kv } from "@vercel/kv";
import sharp from "sharp";
import { randomUUID } from "crypto";

const PURCHASE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

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

    // Taaksepäin yhteensopivuus: vanhat result-linkit voivat lähettää URL:n suoraan.
    const looksLikeUrl = typeof imageUrl === "string" && /^https?:\/\//.test(imageUrl);
    let originalImageUrl = looksLikeUrl ? imageUrl : "";
    let purchaseData: { imageUrl?: string; upscaledImageUrl?: string; createdAt?: number } | null = null;

    if (!originalImageUrl) {
      purchaseData = await kv.get<{ imageUrl?: string; upscaledImageUrl?: string; createdAt?: number }>(`purchase:${imageUrl}`);
      originalImageUrl = purchaseData?.imageUrl ?? "";
    }

    if (!originalImageUrl) {
      return new Response(JSON.stringify({ error: "Image not found or purchase token expired" }), { status: 404 });
    }

    // Kassalla näytetään edelleen thumbnail (sama resoluutio kuin nyt)
    const displayImage = thumbnailUrl || originalImageUrl;

    // Upscale 3x ennen ostoa: Fal SeedVR → Blob (tiedostonimi alkuun "upscale")
    let upscaledImageUrl: string = purchaseData?.upscaledImageUrl || originalImageUrl;
    if (!looksLikeUrl && purchaseData?.upscaledImageUrl) {
      console.log("Using cached upscale from KV:", purchaseData.upscaledImageUrl);
    } else if (FAL_KEY && BLOB_READ_WRITE_TOKEN) {
      try {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const datePrefix = `lem-${dd}${mm}${yy}`;

        fal.config({ credentials: FAL_KEY });
        const upscaleResult: any = await fal.subscribe("fal-ai/seedvr/upscale/image", {
          input: {
            image_url: originalImageUrl,
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
          requestOptions: {
            headers: {
              "X-Fal-Store-IO": "0",
            },
          },
        } as any);
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

            if (!looksLikeUrl) {
              await kv.set(
                `purchase:${imageUrl}`,
                {
                  imageUrl: originalImageUrl,
                  upscaledImageUrl,
                  createdAt: purchaseData?.createdAt ?? Date.now(),
                },
                { ex: PURCHASE_TOKEN_TTL_SECONDS }
              );
            }
          }
        }
      } catch (upscaleErr: any) {
        console.error("Upscale failed, using original image:", upscaleErr?.message ?? upscaleErr);
        // Käytetään alkuperäistä kuvaa, jotta ostovirta ei katkea
      }
    } else {
      console.warn("FAL_KEY or BLOB_READ_WRITE_TOKEN missing, skipping upscale");
    }

    // Määritetään paluu-URL:t (ensisijaisesti PUBLIC_SITE_URL muuttujasta)
    const siteUrl = import.meta.env.PUBLIC_SITE_URL || new URL(request.url).origin;
    const success_url = `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${siteUrl}/`;

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
              description: 'Täysikokoinen, vesileimaton studiokuva koirastasi (3072 x 4608 px)',
              images: [displayImage],
            },
            unit_amount: 790,
            tax_behavior: 'inclusive',
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url,
      cancel_url,
      payment_intent_data: {
        statement_descriptor: 'LEMMIKKISTUDIO',
      },
      metadata: {
        project: 'lemmikkistudio',
        original_image_url: originalImageUrl,
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
