import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function PATCH(
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

  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, color, exclude_from_analytics } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name?.trim() || null;
  if (color !== undefined) updateData.color = color || null;
  if (exclude_from_analytics !== undefined) {
    updateData.exclude_from_analytics = !!exclude_from_analytics;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data: tag, error } = await supabase
    .from("transaction_tags")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  return NextResponse.json({ tag });
}

export async function DELETE(
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

  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  // Delete tag assignments first (on cascade it would also work, but this makes intent explicit)
  const { error: assignmentsError } = await supabase
    .from("transaction_tag_assignments")
    .delete()
    .eq("tag_id", params.id);

  if (assignmentsError) {
    console.error("Error deleting tag assignments:", assignmentsError);
    return NextResponse.json(
      { error: assignmentsError.message },
      { status: 500 }
    );
  }

  const { error } = await supabase
    .from("transaction_tags")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

