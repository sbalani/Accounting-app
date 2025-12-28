import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await request.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Check if user is owner of the workspace
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: "Error checking workspace membership" }, { status: 500 });
  }

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Only owners can invite members" }, { status: 403 });
  }

  // Generate secure token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

  // Create invitation
  const { data: invitation, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: params.id,
      email: email.toLowerCase().trim(),
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // In production, send email with invitation link
  // For now, return the invitation with the token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${appUrl}/workspace/invite/${token}`;

  return NextResponse.json({
    invitation,
    inviteLink,
    message: "Invitation created. Send this link to the user.",
  });
}
