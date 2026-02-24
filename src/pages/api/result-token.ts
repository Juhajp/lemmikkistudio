import type { APIRoute } from "astro";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

const RESULT_TTL_SECONDS = 24 * 60 * 60; // 24 h

export const POST: APIRoute = async ({ request }) => {
  try {
    const { purchaseToken, thumbnailUrl } = await request.json();

    if (!purchaseToken) {
      return new Response(
        JSON.stringify({ error: "purchaseToken missing" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = randomUUID();

    await kv.set(
      `result:${token}`,
      {
        purchaseToken,
        thumbnailUrl: thumbnailUrl || null,
        createdAt: Date.now(),
      },
      { ex: RESULT_TTL_SECONDS }
    );

    return new Response(
      JSON.stringify({ token }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create result token";
    console.error("result-token error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
