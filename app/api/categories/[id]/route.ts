import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  const { data: category, error } = await supabase
    .from("transaction_categories")
    .select("*")
    .eq("id", params.id)
    .or(`is_default.eq.true,workspace_id.eq.${workspaceId || "null"}`)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ category });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("transaction_categories")
    .select("id, workspace_id, is_default")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  if (existing.is_default || existing.workspace_id !== workspaceId) {
    return NextResponse.json(
      { error: "Can only edit workspace-defined categories" },
      { status: 403 }
    );
  }

  const { name, color } = await request.json();
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (color !== undefined) updateData.color = color == null ? null : String(color);

  const { data: category, error } = await supabase
    .from("transaction_categories")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ category });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("transaction_categories")
    .select("id, workspace_id, is_default")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  if (existing.is_default || existing.workspace_id !== workspaceId) {
    return NextResponse.json(
      { error: "Can only delete workspace-defined categories" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("transaction_categories")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
