import type { APIRoute } from "astro";
import { Resend } from "resend";

const RESEND_API_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY puuttuu!" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { email, imageUrl, name } = body;

    if (!email || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Sähköposti ja kuvan URL ovat pakollisia." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validoi sähköpostiosoite
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Virheellinen sähköpostiosoite." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: "noreply@muotokuvasi.fi",
      to: email,
      subject: "Muotokuvasi.fi - Valmis muotokuvasi",
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
              <p>Hei${name ? ` ${name}` : ''},</p>
              <p>Tässä on valmis muotokuvasi, jonka loit Muotokuvasi.fi -palvelussa.</p>
              
              <div class="image-container">
                <img src="${imageUrl}" alt="Muotokuva" />
              </div>
              
              <p style="text-align: center;">
                <a href="${imageUrl}" class="button" download>Lataa kuva</a>
              </p>
              
              <p>Voit myös jakaa kuvan kavereillesi tai käyttää sitä LinkedInissä, CV:ssä tai sosiaalisessa mediassa.</p>
              
              <div class="footer">
                <p>Ystävällisin terveisin,<br>Muotokuvasi.fi -tiimi</p>
                <p><a href="https://muotokuvasi.fi">muotokuvasi.fi</a></p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({ error: "Sähköpostin lähetys epäonnistui." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Sähköposti lähetetty onnistuneesti!" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Send email error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Sähköpostin lähetys epäonnistui." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
