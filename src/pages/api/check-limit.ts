import type { APIRoute } from "astro";
import { kv } from "@vercel/kv";

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const MAX_GENERATIONS = Number(import.meta.env.RATE_LIMIT_MAX ?? 5);
  
  // IP resolution (same logic as in generate.ts)
  const ip = request.headers.get("x-forwarded-for") || clientAddress || "unknown";
  const rateLimitKey = `ratelimit:${ip}`;

  try {
    const used = await kv.get<number>(rateLimitKey);
    const usedCount = Number(used) || 0;
    const remaining = Math.max(0, MAX_GENERATIONS - usedCount);

    return new Response(JSON.stringify({ remaining, max: MAX_GENERATIONS }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error checking rate limit:", error);
    // In case of error, return a safe default (e.g. assume some remaining to avoid blocking UI unnecessarily, or 0 if strict)
    // Let's return MAX so we don't block the UI if Redis is down, but the actual generate call might still fail or succeed depending on how we handle it there.
    // Actually, returning null or error might be better handled by frontend. Let's return max for now.
    return new Response(JSON.stringify({ remaining: MAX_GENERATIONS, max: MAX_GENERATIONS }), {
        status: 200, 
        headers: { "Content-Type": "application/json" }
    });
  }
};
