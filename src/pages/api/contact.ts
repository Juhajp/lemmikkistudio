import type { APIRoute } from "astro";
import { Resend } from "resend";

export const POST: APIRoute = async ({ request }) => {
  const RESEND_API_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY puuttuu!");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { name, email, company, teamSize, phone, message } = body;

    // Validoi pakolliset kentät
    if (!name || !email || !company || !teamSize) {
      return new Response(
        JSON.stringify({ error: "Nimi, sähköposti, yritys ja henkilömäärä ovat pakollisia." }),
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

    // Lähetä sähköposti
    const emailData = await resend.emails.send({
      from: "Muotokuvasi.fi <noreply@muotokuvasi.fi>", 
      to: "info@muotokuvasi.fi",
      replyTo: email,
      subject: `Uusi tarjouspyyntö: ${company}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #234b4d;">Uusi yrityskuvaustarjous</h2>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Nimi:</strong> ${name}</p>
            <p><strong>Sähköposti:</strong> ${email}</p>
            <p><strong>Yritys:</strong> ${company}</p>
            <p><strong>Arvioitu henkilömäärä:</strong> ${teamSize}</p>
            ${phone ? `<p><strong>Puhelinnumero:</strong> ${phone}</p>` : ""}
          </div>

          ${message ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #234b4d;">Viesti:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
          ` : ""}

          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px;">
            Lähetetty muotokuvasi.fi -lomakkeelta ${new Date().toLocaleString("fi-FI")}
          </p>
        </div>
      `,
    });

    console.log("Email sent:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Kiitos yhteydenotostasi! Vastaamme 24 tunnin kuluessa." 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Virhe sähköpostin lähetyksessä:", error);
    return new Response(
      JSON.stringify({ 
        error: "Viestin lähetys epäonnistui. Yritä hetken kuluttua uudelleen." 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
