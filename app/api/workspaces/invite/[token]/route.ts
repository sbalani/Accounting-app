import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const supabase = await createClient();

  // Get invitation details
  const { data: invitation, error } = await supabase
    .from("workspace_invitations")
    .select("*, workspaces(*)")
    .eq("token", params.token)
    .is("accepted_at", null)
    .single();

  if (error || !invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  // Check if invitation has expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
  }

  return NextResponse.json({ invitation });
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get invitation
  const { data: invitation, error: inviteError } = await supabase
    .from("workspace_invitations")
    .select("*, workspaces(*)")
    .eq("token", params.token)
    .is("accepted_at", null)
    .single();

  if (inviteError || !invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  // Check if invitation has expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
  }

  // Check if email matches (optional, but recommended)
  if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // Check if user is already a member
  const { data: existingMember, error: memberCheckError } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invitation.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberCheckError) {
    return NextResponse.json({ error: "Error checking membership" }, { status: 500 });
  }

  if (existingMember) {
    return NextResponse.json({ error: "You are already a member of this workspace" }, { status: 400 });
  }

  // Add user as member
  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: invitation.workspace_id,
    user_id: user.id,
    role: "member",
    joined_at: new Date().toISOString(),
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from("workspace_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspace: invitation.workspaces });
}
