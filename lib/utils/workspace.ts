import { createClient } from "@/lib/supabase/server";

export async function getCurrentWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Get user's workspaces
  const { data: workspaceMembers, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !workspaceMembers) {
    return null;
  }

  return workspaceMembers.workspaces;
}

export async function getUserWorkspaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: workspaceMembers, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error || !workspaceMembers) {
    return [];
  }

  return workspaceMembers.map((wm: any) => ({
    ...wm.workspaces,
    role: wm.role,
  }));
}
