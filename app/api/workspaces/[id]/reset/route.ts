import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { confirmName } = await request.json();

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { error: "Error checking workspace membership" },
      { status: 500 }
    );
  }

  if (!member || member.role !== "owner") {
    return NextResponse.json(
      { error: "Only workspace owners can reset transaction data" },
      { status: 403 }
    );
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!confirmName || confirmName.trim() !== workspace.name) {
    return NextResponse.json(
      { error: "Workspace name confirmation does not match" },
      { status: 400 }
    );
  }

  const { error: deleteError, count } = await supabase
    .from("transactions")
    .delete({ count: "exact" })
    .eq("workspace_id", params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: resetImportError } = await supabase
    .from("payment_methods")
    .update({ last_statement_imported_through: null })
    .eq("workspace_id", params.id);

  if (resetImportError) {
    return NextResponse.json({ error: resetImportError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deletedCount: count ?? 0,
  });
}
