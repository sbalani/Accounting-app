import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE_NAME } from "@/lib/utils/workspace-cookie";

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const memberIds = (memberships || []).map((m) => m.workspace_id);
  if (memberIds.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;
  if (preferredId && memberIds.includes(preferredId)) {
    return preferredId;
  }

  return memberIds[0];
}
