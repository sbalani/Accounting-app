import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

// List & create tags
export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: tags, error } = await supabase
    .from("transaction_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tags });
}

export async function POST(request: Request) {
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

  const { name, color, exclude_from_analytics } = await request.json();

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  // Check if tag already exists (case-insensitive) within workspace
  const { data: existingTag } = await supabase
    .from("transaction_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .ilike("name", name.trim())
    .maybeSingle();

  if (existingTag) {
    // Return existing tag instead of creating duplicate
    return NextResponse.json({ tag: existingTag });
  }

  const { data: tag, error } = await supabase
    .from("transaction_tags")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      color: color || "#6366F1", // Indigo-ish default
      exclude_from_analytics: !!exclude_from_analytics,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag });
}

