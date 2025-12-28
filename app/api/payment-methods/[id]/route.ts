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

  const { name, type, csv_import_config, currency } = await request.json();

  const updateData: any = {};
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

  // Check if there are any transactions using this payment method
  const { data: transactions } = await supabase
    .from("transactions")
    .select("id")
    .eq("payment_method_id", params.id)
    .limit(1);

  if (transactions && transactions.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete payment method with existing transactions" },
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
