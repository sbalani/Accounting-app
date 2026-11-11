import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Readiness checks the auth service the application requires for every request.
// Do not include upstream bodies, URLs, keys, or errors in the response.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let ready = false;

  if (url && key) {
    try {
      const response = await fetch(new URL("/auth/v1/health", url), {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      ready = response.ok;
    } catch {
      // Unavailable or invalid upstream configuration.
    }
  }

  return NextResponse.json({ status: ready ? "ready" : "unavailable" }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
