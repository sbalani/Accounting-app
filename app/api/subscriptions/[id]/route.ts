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

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Fetch related data separately
  if (subscription.payment_method_id) {
    const { data: paymentMethod } = await supabase
      .from("payment_methods")
      .select("name, type, currency")
      .eq("id", subscription.payment_method_id)
      .maybeSingle();
    if (paymentMethod) {
      subscription.payment_methods = paymentMethod;
    }
  }

  if (subscription.merchant_id) {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, name")
      .eq("id", subscription.merchant_id)
      .maybeSingle();
    if (merchant) {
      subscription.merchants = merchant;
    }
  }

  if (subscription.category_id) {
    const { data: category } = await supabase
      .from("transaction_categories")
      .select("id, name, color")
      .eq("id", subscription.category_id)
      .maybeSingle();
    if (category) {
      subscription.transaction_categories = category;
    }
  }

  // Fetch linked transactions
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("subscription_id", params.id)
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false });

  subscription.transactions = transactions || [];

  return NextResponse.json({ subscription });
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

  const { name, description, amount, due_day, payment_method_id, merchant_id, category_id, is_active } = await request.json();

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (amount !== undefined) updateData.amount = parseFloat(amount);
  if (due_day !== undefined) {
    if (due_day < 1 || due_day > 31) {
      return NextResponse.json(
        { error: "due_day must be between 1 and 31" },
        { status: 400 }
      );
    }
    updateData.due_day = parseInt(due_day);
  }
  if (payment_method_id !== undefined) updateData.payment_method_id = payment_method_id;
  if (merchant_id !== undefined) updateData.merchant_id = merchant_id || null;
  if (category_id !== undefined) updateData.category_id = category_id || null;
  if (is_active !== undefined) updateData.is_active = is_active;

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Fetch related data
  if (subscription.payment_method_id) {
    const { data: paymentMethod } = await supabase
      .from("payment_methods")
      .select("name, type, currency")
      .eq("id", subscription.payment_method_id)
      .maybeSingle();
    if (paymentMethod) {
      subscription.payment_methods = paymentMethod;
    }
  }

  return NextResponse.json({ subscription });
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

  // First, unlink all transactions from this subscription
  await supabase
    .from("transactions")
    .update({ subscription_id: null })
    .eq("subscription_id", params.id)
    .eq("workspace_id", workspaceId);

  // Then delete the subscription
  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

