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

  if (!signature) {
    console.error("Stripe-Signature header puuttuu");
    return new Response("No signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // 2. Validoi Stripe-signatuuri (KRIITTINEN TIETOTURVATARKISTUS)
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // 3. Käsittele vain checkout.session.completed -tapahtuma
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log("✅ Payment successful:", {
      sessionId: session.id,
      customerEmail: session.customer_details?.email,
      amount: session.amount_total,
    });

    // 4. Hae kuvan URL metadatasta (käyttäjälle tarjotaan upscalattu)
    const imageUrl = session.metadata?.upscaled_image_url ?? session.metadata?.original_image_url;
    const customerEmail = session.customer_details?.email;

    if (!imageUrl) {
      console.error("Image URL puuttuu session metadatasta:", session.id);
      // Ei palauteta virhettä Stripelle, jotta webhook ei yritä uudelleen
      return new Response("OK (no image)", { status: 200 });
    }

    if (!customerEmail) {
      console.error("Customer email puuttuu:", session.id);
      return new Response("OK (no email)", { status: 200 });
    }

    // 4.5. Luo yksilöllinen alennuskoodi (-50%)
    let couponCode: string | null = null;
    try {
      // Luo coupon jossa ID on itse alennuskoodi
      // Tämä on yksinkertaisempi tapa kuin promotion code
      const coupon = await stripe.coupons.create({
        id: `KIITOS${Math.random().toString(36).substring(2, 8).toUpperCase()}`, // Esim. KIITOSAB12CD
        percent_off: 50,
        duration: 'once',
        name: 'Kiitos tilauksesta! -50%',
        max_redemptions: 1, // Vain yksi käyttökerta
        redeem_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 päivää
      });
      
      couponCode = coupon.id;
      
      // Tallenna koodi Redis/KV:hen session ID:n perusteella (30 päivää)
      await kv.set(`coupon:${session.id}`, couponCode, {
        ex: 30 * 24 * 60 * 60,
      });
      
      console.log('✅ Alennuskoodi luotu:', couponCode);
    } catch (couponErr) {
      console.error('Alennuskoodin luonti epäonnistui:', couponErr);
      // Jatka ilman koodia
    }

    // 5. Lähetä tilausvahvistusviesti (jos Resend on käytössä)
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);

        // Hae kuva Vercel Blobista liitteeksi (upscalattu PNG tai alkuperäinen JPG)
        let attachmentData: { filename: string; path: string } | undefined;
        try {
          attachmentData = {
            filename: "muotokuva-pro.jpg",
            path: imageUrl,
          };
        } catch (fetchErr) {
          console.error("Kuvan haku liitteeksi epäonnistui:", fetchErr);
          // Jatka ilman liitettä (kuva on silti viestissä inline-kuvana)
        }

        const { data, error } = await resend.emails.send({
          from: "noreply@muotokuvasi.fi",
          to: customerEmail,
          subject: "Tilausvahvistus – Muotokuvasi.fi",
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
                    <strong>Huomio:</strong> Kuva on saatavilla 24 tuntia maksun jälkeen. Lataa se nyt talteen.
                  </p>
                  
                  <div class="footer">
                    <p>Ystävällisin terveisin,<br>Muotokuvasi.fi -tiimi</p>
                    <p><a href="https://muotokuvasi.fi">muotokuvasi.fi</a> | <a href="mailto:info@muotokuvasi.fi">info@muotokuvasi.fi</a></p>
                  </div>
                </div>
              </body>
            </html>
          `,
          // Liite (jos onnistui)
          ...(attachmentData ? { attachments: [attachmentData] } : {}),
        });

        if (error) {
          console.error("Resend error:", error);
        } else {
          console.log("✅ Tilausvahvistusviesti lähetetty:", customerEmail, data);
        }
      } catch (emailErr: any) {
        console.error("Email sending failed:", emailErr);
        // Ei palauteta virhettä Stripelle, jotta webhook ei yritä uudelleen
      }
    } else {
      console.warn("RESEND_API_KEY puuttuu, sähköpostia ei lähetetä");
    }
  }

  // 4. Palauta aina 200 OK Stripelle (muuten webhook yrittää uudelleen)
  return new Response("OK", { status: 200 });
};
