import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { isAppleBillingEntry, matchingSubscriptions, suggestionForSubscriptions } from "@/lib/utils/subscription-matching";

export async function POST(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No workspace found" }, { status: 404 });

  const { transaction_id } = await request.json();
  if (!transaction_id) return NextResponse.json({ error: "transaction_id is required" }, { status: 400 });

  const { data: transaction, error: transactionError } = await supabase.from("transactions")
    .select("id, amount, transaction_date, description, payment_method_id, merchant_id, subscription_id")
    .eq("id", transaction_id).eq("workspace_id", workspaceId).maybeSingle();
  if (transactionError || !transaction) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (transaction.subscription_id || transaction.amount >= 0) return NextResponse.json({ suggestions: [] });

  // A single Apple statement descriptor can represent several distinct services.
  // Account, amount and billing date narrow candidates; the user always chooses.
  const { data: subscriptions, error: subscriptionError } = await supabase.from("subscriptions")
    .select("id, name, amount, due_day, payment_method_id, merchant_id, statement_match_text, billing_provider, billing_interval, billing_month, is_active")
    .eq("workspace_id", workspaceId).eq("payment_method_id", transaction.payment_method_id)
    .eq("is_active", true).is("archived_at", null);
  if (subscriptionError) return NextResponse.json({ error: "Failed to find subscriptions" }, { status: 500 });

  const candidates = matchingSubscriptions(transaction, subscriptions || []).sort((a, b) => a.name.localeCompare(b.name));
  const suggestion = suggestionForSubscriptions(candidates);
  if (suggestion) return NextResponse.json({ suggestions: [suggestion] });

  // A generic Apple charge with no configured match is not enough evidence to
  // create a named subscription. It can be created manually from the UI.
  if (isAppleBillingEntry(transaction.description)) return NextResponse.json({ suggestions: [] });

  // Preserve recurring-transaction discovery for direct merchants. A missing
  // merchant requires the same nonempty statement text, not amount/date alone.
  if (!transaction.merchant_id && !transaction.description?.trim()) return NextResponse.json({ suggestions: [] });
  let query = supabase.from("transactions")
    .select("id, amount, transaction_date")
    .eq("workspace_id", workspaceId).eq("payment_method_id", transaction.payment_method_id)
    .neq("id", transaction.id).is("subscription_id", null).lt("amount", 0);
  if (transaction.merchant_id) query = query.eq("merchant_id", transaction.merchant_id);
  else query = query.eq("description", transaction.description);
  const { data: matches, error: matchesError } = await query;
  if (matchesError) {
    console.error("Subscription suggestions fetch failed");
    return NextResponse.json({ error: "Failed to find recurring transactions" }, { status: 500 });
  }
  const referenceDate = new Date(`${transaction.transaction_date}T00:00:00.000Z`);
  const amount = Math.abs(transaction.amount);
  const recurring = (matches || []).filter(match => {
    const date = new Date(`${match.transaction_date}T00:00:00.000Z`);
    const dayDiff = Math.abs(date.getUTCDate() - referenceDate.getUTCDate());
    return Math.abs(Math.abs(match.amount) - amount) <= Math.max(0.01, amount * 0.01) &&
      (dayDiff <= 2 || dayDiff >= 28);
  });
  const future = recurring.filter(match => match.transaction_date > transaction.transaction_date);
  if (future.length === 0) return NextResponse.json({ suggestions: [] });
  return NextResponse.json({ suggestions: [{
    type: "create_new", match_count: recurring.length, future_match_count: future.length,
    suggested_amount: amount, suggested_due_day: referenceDate.getUTCDate(),
    matching_transactions: future.slice(0, 5).map(match => ({
      id: match.id, date: match.transaction_date, amount: match.amount,
    })),
    confidence: "medium",
  }] });
}
