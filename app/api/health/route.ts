import { NextResponse } from "next/server";

// Liveness: never depends on the database or third-party services.
export function GET() {
  return NextResponse.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
