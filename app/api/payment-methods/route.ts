import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: paymentMethods, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get workspace primary currency
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("primary_currency")
    .eq("id", workspaceId)
    .single();

  return NextResponse.json({
    paymentMethods,
    primaryCurrency: workspace?.primary_currency || "USD",
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

  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { name, type, initial_balance, currency } = await request.json();

  if (!name || !type) {
    return NextResponse.json(
      { error: "Name and type are required" },
      { status: 400 }
    );
  }

  if (!["cash", "bank_account", "credit_card"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid payment method type" },
      { status: 400 }
    );
  }

  const balance = parseFloat(initial_balance) || 0;

  // Get workspace primary currency as default if currency not provided
  let defaultCurrency = currency;
  if (!defaultCurrency) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("primary_currency")
      .eq("id", workspaceId)
      .single();
    defaultCurrency = workspace?.primary_currency || "USD";
  }

  const { data: paymentMethod, error } = await supabase
    .from("payment_methods")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      type,
      currency: defaultCurrency,
      initial_balance: balance,
      current_balance: balance,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentMethod });
}
