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

  const { data: transaction, error } = await supabase
    .from("transactions")
    .select("*, payment_methods(name, type)")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction });
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

  const { payment_method_id, amount, description, category, transaction_date, merchant } =
    await request.json();

  const updateData: any = {};
  if (payment_method_id !== undefined) updateData.payment_method_id = payment_method_id;
  if (amount !== undefined) updateData.amount = parseFloat(amount);
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (category !== undefined) updateData.category = category?.trim() || null;
  if (merchant !== undefined) updateData.merchant = merchant?.trim() || null;
  if (transaction_date !== undefined) updateData.transaction_date = transaction_date;

  // Verify payment method belongs to workspace if updating
  if (payment_method_id) {
    const { data: paymentMethod, error: paymentMethodError } = await supabase
      .from("payment_methods")
      .select("id")
      .eq("id", payment_method_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (paymentMethodError) {
      return NextResponse.json(
        { error: "Error checking payment method" },
        { status: 500 }
      );
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method not found" },
        { status: 404 }
      );
    }
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select("*, payment_methods(name, type)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction });
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

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
