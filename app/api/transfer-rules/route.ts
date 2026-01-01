import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: transferRules, error } = await supabase
    .from("transfer_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transferRules });
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
    match_value,
    transfer_direction,
    target_payment_method_id,
    priority,
  } = await request.json();

  if (!name || !rule_type || !match_value || !transfer_direction || !target_payment_method_id) {
    return NextResponse.json(
      { error: "Name, rule_type, match_value, transfer_direction, and target_payment_method_id are required" },
      { status: 400 }
    );
  }

  if (!["contains", "starts_with", "ends_with", "exact_match"].includes(rule_type)) {
    return NextResponse.json(
      { error: "Invalid rule_type" },
      { status: 400 }
    );
  }

  if (!["to", "from"].includes(transfer_direction)) {
    return NextResponse.json(
      { error: "Invalid transfer_direction" },
      { status: 400 }
    );
  }

  // Verify payment method belongs to workspace
  const { data: paymentMethod, error: pmError } = await supabase
    .from("payment_methods")
    .select("id")
    .eq("id", target_payment_method_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (pmError || !paymentMethod) {
    return NextResponse.json(
      { error: "Payment method not found" },
      { status: 404 }
    );
  }

  const { data: transferRule, error } = await supabase
    .from("transfer_rules")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      rule_type,
      match_value: match_value.trim(),
      transfer_direction,
      target_payment_method_id,
      priority: priority || 0,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transferRule });
}


