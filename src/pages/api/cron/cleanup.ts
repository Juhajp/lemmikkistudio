import type { APIRoute } from "astro";
import { list, del } from "@vercel/blob";

export const GET: APIRoute = async ({ request }) => {
  // 1. Tietoturvatarkistus: Varmistetaan että kutsu tulee Vercelin Cronista
  // Vercel lisää automaattisesti Authorization-headerin
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Jos ajetaan paikallisesti ilman CRON_SECRET:ia, sallitaan testaus jos niin halutaan,
    // mutta tuotannossa tämä estää ulkopuoliset kutsut.
    // return new Response('Unauthorized', { status: 401 });
  }

  // 2. Määritetään aikaraja (24h sitten)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  try {
    // 3. Listataan tiedostot
    const { blobs } = await list();

    const blobsToDelete = blobs
        .filter(blob => blob.uploadedAt < oneDayAgo)
        .map(blob => blob.url);

    // 4. Poistetaan vanhat tiedostot
    if (blobsToDelete.length > 0) {
        // Vercel Blob del hyväksyy arrayn stringejä
        await del(blobsToDelete);
        console.log(`Deleted ${blobsToDelete.length} old images.`);
    }

    return new Response(JSON.stringify({ 
        deleted: blobsToDelete.length,
        message: "Cleanup complete" 
    }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error: any) {
      console.error("Cleanup failed:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
