import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET() {
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

  const { data: rules, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
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

  const {
    name,
    rule_type,
    match_field,
    match_value,
    category,
    ai_context,
    priority,
    is_active,
  } = await request.json();

  // Validation
  if (!name || !rule_type || !match_field || !match_value || !category) {
    return NextResponse.json(
      { error: "Name, rule type, match field, match value, and category are required" },
      { status: 400 }
    );
  }

  if (!["exact_match", "contains", "ai_context"].includes(rule_type)) {
    return NextResponse.json({ error: "Invalid rule type" }, { status: 400 });
  }

  if (!["description", "merchant"].includes(match_field)) {
    return NextResponse.json({ error: "Invalid match field" }, { status: 400 });
  }

  // For AI context rules, ai_context is required
  if (rule_type === "ai_context" && !ai_context) {
    return NextResponse.json(
      { error: "AI context is required for ai_context rule type" },
      { status: 400 }
    );
  }

  const { data: rule, error } = await supabase
    .from("categorization_rules")
    .insert({
      workspace_id: workspaceId,
      name,
      rule_type,
      match_field,
      match_value,
      category,
      ai_context: ai_context || null,
      priority: priority || 0,
      is_active: is_active !== undefined ? is_active : true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
}

