import type { APIRoute } from "astro";
import Stripe from "stripe";
import { Resend } from "resend";
import { kv } from "@vercel/kv";

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
const RESEND_API_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY puuttuu!");
    return new Response("Server configuration error", { status: 500 });
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET puuttuu!");
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // 1. Lue raw body (Stripe tarvitsee sen signaturin tarkistukseen)
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  console.log("🔔 Webhook received. Signature present:", !!signature);

  if (!signature) {
    console.error("Stripe-Signature header puuttuu");
    return new Response("No signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // 2. Validoi Stripe-signatuuri (KRIITTINEN TIETOTURVATARKISTUS)
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    console.log("✅ Webhook event validated:", event.type);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // 3. Käsittele vain checkout.session.completed -tapahtuma
  if (event.type === "checkout.session.completed") {
    // Hae sessio uudelleen expand:lla jotta saadaan tieto käytetyistä alennuksista
    const session = await stripe.checkout.sessions.retrieve(
      (event.data.object as Stripe.Checkout.Session).id,
      { expand: ["total_details.breakdown.discounts"] }
    );

    console.log("📦 Stripe Session Metadata:", JSON.stringify(session.metadata, null, 2));
    console.log("📧 Customer Email:", session.customer_details?.email);

    // 4. Hae kuvan URL metadatasta (käyttäjälle tarjotaan upscalattu)
    const imageUrl = session.metadata?.upscaled_image_url ?? session.metadata?.original_image_url;
    const customerEmail = session.customer_details?.email;

    if (!imageUrl) {
      console.error("❌ Image URL puuttuu session metadatasta. Metadata keys:", Object.keys(session.metadata || {}));
      // Ei palauteta virhettä Stripelle, jotta webhook ei yritä uudelleen
      return new Response("OK (no image)", { status: 200 });
    }

    if (!customerEmail) {
      console.error("❌ Customer email puuttuu sessiosta.");
      return new Response("OK (no email)", { status: 200 });
    }

    // 4.5. Luo yksilöllinen alennuskoodi (-50%) — ei luoda jos ostossa käytettiin alennuskoodia
    const hasUsedDiscount = ((session.total_details as any)?.breakdown?.discounts?.length ?? 0) > 0;
    let couponCode: string | null = null;
    if (hasUsedDiscount) {
      console.log('ℹ️ Ostolle käytetty alennuskoodi — uutta koodia ei luoda.');
    } else {
      try {
        console.log('✨ Creating custom discount coupon...');
        // Luo coupon jossa ID on itse alennuskoodi
        const coupon = await stripe.coupons.create({
          id: `KIITOS${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          percent_off: 50,
          duration: 'once',
          name: 'Kiitos tilauksesta! -50%',
          max_redemptions: 1,
          redeem_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        });

        // Luo promotion code (tarjouskoodi) jotta asiakas voi syöttää koodin kassalla (Anna tarjouskoodi)
        await stripe.promotionCodes.create({
          promotion: { type: "coupon", coupon: coupon.id },
          code: coupon.id,
        });

        couponCode = coupon.id;
        await kv.set(`coupon:${session.id}`, couponCode, { ex: 30 * 24 * 60 * 60 });
        console.log('✅ Alennuskoodi ja tarjouskoodi luotu, tallennettu KV:hen:', couponCode);
      } catch (couponErr) {
        console.error('❌ Alennuskoodin luonti epäonnistui:', couponErr);
      }
    }

    // 5. Lähetä tilausvahvistusviesti (jos Resend on käytössä)
    console.log("📧 Resend API Key present:", !!RESEND_API_KEY);
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        console.log("🚀 Sending email via Resend to:", customerEmail);

        // Hae kuva Vercel Blobista liitteeksi
        let attachmentData: { filename: string; path: string } | undefined;
        try {
          console.log("📎 Preparing attachment from URL:", imageUrl);
          attachmentData = {
            filename: "muotokuva-pro.jpg",
            path: imageUrl,
          };
        } catch (fetchErr) {
          console.error("❌ Kuvan haku liitteeksi epäonnistui:", fetchErr);
        }

        const resendResponse = await resend.emails.send({
          from: "noreply@lemmikkistudio.fi",
          to: customerEmail,
          subject: "Tilausvahvistus – lemmikkistudio.fi",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .image-container { text-align: center; margin: 20px 0; }
                  .image-container img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                  .button { display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>Kiitos tilauksestasi! 🎉</h1>
                  <p>Hei,</p>
                  <p>Maksusi on vastaanotettu onnistuneesti. Tässä on valmis ammattimainen muotokuvasi.</p>
                  
                  <div class="image-container">
                    <img src="${imageUrl}" alt="Muotokuva" />
                  </div>
                  
                  <p style="text-align: center;">
                    <a href="${imageUrl}" class="button" download style="color: white !important; text-decoration: none;">Lataa kuva</a>
                  </p>
                  
                  <p><strong>Tilausnumero:</strong> ${session.id}</p>
                  <p><strong>Summa:</strong> ${((session.amount_total || 0) / 100).toFixed(2)} €</p>
                  
                  ${couponCode ? `
                  <!-- Alennuskoodi-osio -->
                  <div style="background: linear-gradient(to right, #f3e8ff, #fae8ff); padding: 24px; border-radius: 12px; margin: 24px 0; border: 2px solid #c084fc;">
                    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #7c3aed;">🎁 Kiitos tilauksestasi!</h2>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #4b5563;">
                      Tässä alennuskoodi jolla saat seuraavan muotokuvan <strong>-50% alennuksella!</strong> Alennuskoodi syötetään kassasivulla.<br>
                      Anna kaverille tai käytä itse!
                    </p>
                    <div style="background: white; padding: 16px; border-radius: 8px; border: 2px dashed #c084fc; text-align: center; margin: 16px 0;">
                      <code style="font-size: 24px; font-weight: bold; color: #7c3aed; letter-spacing: 2px;">
                        ${couponCode}
                      </code>
                    </div>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280; text-align: center;">
                      Koodi on voimassa 30 päivää ja käytettävissä vain kerran.
                    </p>
                  </div>
                  ` : ''}
                  
                  <p style="font-size: 12px; color: #666;">
                    <strong>Huomio:</strong> Kuva on saatavilla 7 päivää maksun jälkeen. Lataa se talteen tämän ajan kuluessa.
                  </p>
                  
                  <div class="footer">
                    <p>Ystävällisin terveisin,<br>lemmikkistudio.fi -tiimi</p>
                    <p><a href="https://lemmikkistudio.fi">lemmikkistudio.fi</a> | <a href="mailto:asiakaspalvelu@lemmikkistudio.fi">asiakaspalvelu@lemmikkistudio.fi</a></p>
                  </div>
                </div>
              </body>
            </html>
          `,
          ...(attachmentData ? { attachments: [attachmentData] } : {}),
        });

        if (resendResponse.error) {
          console.error("❌ Resend API Error:", JSON.stringify(resendResponse.error, null, 2));
        } else {
          console.log("✅ Resend success! ID:", resendResponse.data?.id);
        }
      } catch (emailErr: any) {
        console.error("❌ Email sending failed (exception):", emailErr.message);
      }
    } else {
      console.warn("⚠️ RESEND_API_KEY puuttuu, sähköpostia ei lähetetä");
    }
  }

  // 4. Palauta aina 200 OK Stripelle (muuten webhook yrittää uudelleen)
  return new Response("OK", { status: 200 });
};
