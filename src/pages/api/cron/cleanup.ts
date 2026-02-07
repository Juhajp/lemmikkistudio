import type { APIRoute } from "astro";
import { list, del } from "@vercel/blob";

export const GET: APIRoute = async ({ request }) => {
  // 1. Tietoturvatarkistus: Varmistetaan että kutsu tulee Vercelin Cronista
  // Vercel lisää automaattisesti Authorization-headerin
  const authHeader = request.headers.get('authorization');
  
  // Tuotannossa ja preview-ympäristössä: vaadi CRON_SECRET
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  
  if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt:', { authHeader: authHeader ? 'present' : 'missing' });
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Lokaalisti (dev) sallitaan testaus ilman CRON_SECRET:ia
  if (!isProduction) {
    console.log('⚠️ Dev environment: Cron running without authentication check');
  }

  // 2. Määritetään aikarajat
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h sitten
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 päivää sitten
  
  try {
    // 3. Listataan kaikki tiedostot
    const { blobs } = await list();

    // 4. Erotellaan tiedostot kansioittain ja poistetaan vanhat
    const blobsToDelete: string[] = [];

    for (const blob of blobs) {
      const path = blob.pathname || blob.url.split('/').pop() || '';
      
      // portraits/ ja thumbnails/ kansiot: poista 24h vanhat
      if (path.startsWith('portraits/') || path.startsWith('thumbnails/')) {
        if (blob.uploadedAt < oneDayAgo) {
          blobsToDelete.push(blob.url);
        }
      }
      // shared/ kansio: poista 7 päivän vanhat
      else if (path.startsWith('shared/')) {
        if (blob.uploadedAt < sevenDaysAgo) {
          blobsToDelete.push(blob.url);
        }
      }
      // Muut tiedostot: poista 24h vanhat (fallback)
      else {
        if (blob.uploadedAt < oneDayAgo) {
          blobsToDelete.push(blob.url);
        }
      }
    }

    // 5. Poistetaan vanhat tiedostot
    let deletedCount = 0;
    if (blobsToDelete.length > 0) {
      await del(blobsToDelete);
      deletedCount = blobsToDelete.length;
      console.log(`Deleted ${deletedCount} old images.`);
    }

    // 6. Palautetaan raportti
    const report = {
      deleted: deletedCount,
      portraits_thumbnails_24h: blobs.filter(b => {
        const path = b.pathname || b.url.split('/').pop() || '';
        return (path.startsWith('portraits/') || path.startsWith('thumbnails/')) && b.uploadedAt < oneDayAgo;
      }).length,
      shared_7d: blobs.filter(b => {
        const path = b.pathname || b.url.split('/').pop() || '';
        return path.startsWith('shared/') && b.uploadedAt < sevenDaysAgo;
      }).length,
      message: "Cleanup complete"
    };

    return new Response(JSON.stringify(report), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error("Cleanup failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
