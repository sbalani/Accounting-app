import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspaces
  const { data: workspaceMembers, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workspaces = workspaceMembers?.map((wm: any) => ({
    ...wm.workspaces,
    role: wm.role,
  })) || [];

  // Get current workspace (first one for now, can be improved with user preference)
  const currentWorkspace = workspaces[0] || null;

  return NextResponse.json({
    workspaces,
    currentWorkspace,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await request.json();

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  // Create workspace
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      name: name.trim(),
      created_by: user.id,
    })
    .select()
    .single();

  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  }

  // Add user as owner
  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
    joined_at: new Date().toISOString(),
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ workspace });
}