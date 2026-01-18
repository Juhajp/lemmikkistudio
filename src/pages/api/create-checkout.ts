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
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Ammattimainen Muotokuva',
              description: 'Täysikokoinen, vesileimaton studiokuva (1024x1536px)',
              images: [displayImage], // Stripe näyttää tämän pikkukuvan kassalla (jos URL on julkinen)
            },
            unit_amount: 190, // Hinta sentteinä (1.90€)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Mihin palataan maksun jälkeen?
      success_url: `${new URL(request.url).origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${new URL(request.url).origin}/`,
      // Tallennetaan kuvan URL metadataan, jotta voimme palauttaa sen maksun jälkeen
      metadata: {
        original_image_url: imageUrl
      },
    });

    return new Response(JSON.stringify({ url: session.url }));
  } catch (error: any) {
    console.error("Stripe Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
