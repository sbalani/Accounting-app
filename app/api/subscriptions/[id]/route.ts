import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { parseSubscriptionFields } from "@/lib/utils/subscription-input";
import { subscriptionReferencesValid } from "@/lib/utils/subscription-references";
import { archiveSubscription } from "@/lib/utils/subscription-archive";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
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
    .is("archived_at", null)
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
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: existing, error: findError } = await supabase.from("subscriptions").select("billing_interval, billing_month")
    .eq("id", params.id).eq("workspace_id", workspaceId).is("archived_at", null).maybeSingle();
  if (findError) return NextResponse.json({ error: "Failed to find subscription" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  let updateData;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid subscription");
    updateData = parseSubscriptionFields(body, existing);
    if (Object.keys(updateData).length === 0) throw new Error("No fields to update");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  if (!await subscriptionReferencesValid(supabase, workspaceId, updateData)) {
    return NextResponse.json({ error: "Account, merchant or category not in workspace" }, { status: 400 });
  }

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
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
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  // Soft removal retains all linked transaction IDs and avoids firing the
  // transaction balance trigger merely to remove a subscription from the UI.
  const { archived, error } = await archiveSubscription(supabase, workspaceId, params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!archived) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
