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
    const { rating, message, email, orderReference } = body;

    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return new Response(
        JSON.stringify({ error: "Valitse arvosana väliltä 1–5." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Palaute on pakollinen." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Virheellinen sähköpostiosoite." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);

    const emailData = await resend.emails.send({
      from: "lemmikkistudio.fi <noreply@lemmikkistudio.fi>",
      to: "asiakaspalvelu@lemmikkistudio.fi",
      ...(email ? { replyTo: email } : {}),
      subject: `Palaute lemmikkistudio.fi: ${ratingNum}/5`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #234b4d;">Uusi asiakaspalaute</h2>

          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Arvosana:</strong> ${ratingNum}/5 ${"★".repeat(ratingNum)}${"☆".repeat(5 - ratingNum)}</p>
            ${email ? `<p><strong>Sähköposti:</strong> ${email}</p>` : ""}
            ${orderReference ? `<p><strong>Tilausviite:</strong> ${orderReference}</p>` : ""}
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #234b4d;">Palaute:</h3>
            <p style="white-space: pre-wrap;">${message.trim()}</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

          <p style="color: #666; font-size: 12px;">
            Lähetetty lemmikkistudio.fi/palaute -lomakkeelta ${new Date().toLocaleString("fi-FI")}
          </p>
        </div>
      `,
    });

    console.log("Feedback email sent:", emailData);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Kiitos palautteestasi!",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Virhe palautteen lähetyksessä:", error);
    return new Response(
      JSON.stringify({
        error: "Palautteen lähetys epäonnistui. Yritä hetken kuluttua uudelleen.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
