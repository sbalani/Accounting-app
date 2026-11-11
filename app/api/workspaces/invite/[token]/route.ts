import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  // Never expose an invitation's email/token/workspace details to anonymous callers.
  return NextResponse.json({ invitation: { workspaces: { name: "your workspace" } } }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The reviewed destination-only RPC atomically verifies the recipient and
  // performs both writes; missing RPC fails closed instead of bypassing RLS.
  const { data: workspaceId, error } = await supabase.rpc("accept_workspace_invitation", { invitation_token: token });
  if (error || !workspaceId) {
    return NextResponse.json({ error: "Invitation unavailable or access denied" }, { status: 403 });
  }
  return NextResponse.json({ success: true, workspace_id: workspaceId });
}
