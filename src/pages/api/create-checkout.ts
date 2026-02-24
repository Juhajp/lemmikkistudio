import type { APIRoute } from "astro";
import Stripe from 'stripe';

export const POST: APIRoute = async ({ request }) => {
  const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Server Config Error: STRIPE_SECRET_KEY missing" }), { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    const { imageUrl, thumbnailUrl } = await request.json();

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "Image URL missing" }), { status: 400 });
    }

    // Pikkukuva tai fallback isoon kuvaan
    const displayImage = thumbnailUrl || imageUrl;

    // Luodaan Stripe Checkout -sessio
    const session = await stripe.checkout.sessions.create({
      automatic_tax: {
        enabled: true,
      },
      allow_promotion_codes: true, // Salli alennuskoodien käyttö kassalla
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Ammattimainen muotokuva lemmikistäsi',
              description: 'Täysikokoinen, vesileimaton studiokuva koirastasi (1024x1536px)',
              images: [displayImage], // Stripe näyttää tämän pikkukuvan kassalla (jos URL on julkinen)
            },
            unit_amount: 490, // Hinta sentteinä (4.90€)
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
