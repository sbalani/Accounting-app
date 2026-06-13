import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: paymentMethod, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentMethod });
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

  const { name, type, csv_import_config, currency, bank_account_number, initial_balance } =
    await request.json();

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (type !== undefined) {
    if (!["cash", "bank_account", "credit_card"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid payment method type" },
        { status: 400 }
      );
    }
    updateData.type = type;
  }
  if (csv_import_config !== undefined) {
    updateData.csv_import_config = csv_import_config;
  }
  if (currency !== undefined) {
    updateData.currency = currency;
  }
  if (bank_account_number !== undefined) {
    updateData.bank_account_number = bank_account_number === null || String(bank_account_number).trim() === ""
      ? null
      : String(bank_account_number).trim();
  }

  if (initial_balance !== undefined) {
    const newInitial = parseFloat(initial_balance) || 0;
    updateData.initial_balance = newInitial;

    const { data: transactions } = await supabase
      .from("transactions")
      .select("amount")
      .eq("payment_method_id", params.id)
      .eq("workspace_id", workspaceId);

    const transactionSum = (transactions || []).reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    updateData.current_balance = newInitial + transactionSum;
  }

  const { data: paymentMethod, error } = await supabase
    .from("payment_methods")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentMethod });
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

  const blockers: string[] = [];

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .or(
      `payment_method_id.eq.${params.id},transfer_from_id.eq.${params.id},transfer_to_id.eq.${params.id}`
    )
    .limit(1);

  if (transactions && transactions.length > 0) {
    blockers.push("transactions");
  }

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("payment_method_id", params.id)
    .limit(1);

  if (subscriptions && subscriptions.length > 0) {
    blockers.push("subscriptions");
  }

  const { data: transferRules } = await supabase
    .from("transfer_rules")
    .select("id")
    .eq("target_payment_method_id", params.id)
    .limit(1);

  if (transferRules && transferRules.length > 0) {
    blockers.push("transfer rules");
  }

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete this account while it is linked to ${blockers.join(", ")}. Remove those first.`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
