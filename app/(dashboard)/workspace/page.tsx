import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceSettings from "@/components/WorkspaceSettings";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's workspaces
  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const workspaces = workspaceMembers?.map((wm: any) => ({
    ...wm.workspaces,
    role: wm.role,
  })) || [];

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Workspace Settings</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your workspaces and members
          </p>
        </div>

        <WorkspaceSettings workspaces={workspaces} />
      </div>
    </div>
  );
}
