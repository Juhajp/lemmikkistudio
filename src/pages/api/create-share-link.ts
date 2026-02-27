import type { APIRoute } from "astro";
import { put } from "@vercel/blob";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image URL missing" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const BLOB_READ_WRITE_TOKEN = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
    
    // Muunna suhteellinen polku täydeksi URL:ksi
    const origin = new URL(request.url).origin;
    let fullImageUrl = imageUrl;
    if (imageUrl.startsWith('/')) {
      // Suhteellinen polku -> täysi URL
      fullImageUrl = `${origin}${imageUrl}`;
    } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      // Ei ole täysi URL -> lisää origin
      fullImageUrl = `${origin}/${imageUrl}`;
    }
    
    // Jos Blob token puuttuu lokaalisti, käytä alkuperäistä URL:ia suoraan
    // Tarkista myös tyhjä string
    if (!BLOB_READ_WRITE_TOKEN || (typeof BLOB_READ_WRITE_TOKEN === 'string' && BLOB_READ_WRITE_TOKEN.trim() === '')) {
      console.warn("BLOB_READ_WRITE_TOKEN puuttuu - käytetään alkuperäistä URL:ia");
      // Tämä on fallback - ei kopioida kuvaa, käytetään alkuperäistä
      return new Response(
        JSON.stringify({
          shareUrl: fullImageUrl, // Käytetään täyttä URL:ia
          expiresIn: "Vain testaus - kuvaa ei kopioitu",
          warning: "BLOB_READ_WRITE_TOKEN puuttuu",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Hae kuva URL:sta (käytä täyttä URL:ia)
    const imageRes = await fetch(fullImageUrl);
    if (!imageRes.ok) {
      console.error("Failed to fetch image:", imageRes.status, imageRes.statusText);
      throw new Error(`Failed to fetch image: ${imageRes.status} ${imageRes.statusText}`);
    }
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);

    // 2. Luo uniikki share-token
    const shareToken = randomUUID();
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `lem-${dd}${mm}${yy}`;

    // 3. Kopioi kuva shared/-kansioon (7 päivän säilytys)
    let sharedBlob;
    try {
      sharedBlob = await put(`shared/${datePrefix}-${shareToken}.jpg`, imageBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
        token: BLOB_READ_WRITE_TOKEN, // Varmista että token välitetään
      });
    } catch (blobError: any) {
      console.error("Blob upload error:", blobError);
      // Jos virhe johtuu puuttuvasta tokenista, palauta fallback
      if (blobError.message && blobError.message.includes('No token found')) {
        console.warn("BLOB_READ_WRITE_TOKEN puuttuu - käytetään alkuperäistä URL:ia (catch)");
        return new Response(
          JSON.stringify({
            shareUrl: fullImageUrl,
            expiresIn: "Vain testaus - kuvaa ei kopioitu",
            warning: "BLOB_READ_WRITE_TOKEN puuttuu",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Blob upload failed: ${blobError.message}`);
    }

    // 4. Tallenna metatieto Redisiin (7 päivän expiry)
    try {
      await kv.set(`share:${shareToken}`, {
        originalUrl: fullImageUrl, // Täysi URL
        sharedUrl: sharedBlob.url,
        createdAt: Date.now(),
      }, {
        ex: 7 * 24 * 60 * 60, // 7 päivää
      });
    } catch (kvError: any) {
      console.error("Redis (KV) error:", kvError);
      // Jos Redis epäonnistuu, jatketaan silti (kuva on Blobissa)
      console.warn("Redis tallennus epäonnistui, mutta kuva on Blobissa");
    }

    // Käytetään jo määriteltyä origin-muuttujaa
    const shareUrl = `${origin}/shared/${shareToken}`;

    return new Response(
      JSON.stringify({
        shareUrl,
        expiresIn: "7 päivää",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Create share link error:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to create share link",
        details: import.meta.env.DEV ? error.stack : undefined, // Näytä stack vain dev-moodissa
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
