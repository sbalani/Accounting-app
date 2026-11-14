import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { parseSubscriptionFields } from "@/lib/utils/subscription-input";
import { subscriptionReferencesValid } from "@/lib/utils/subscription-references";
import { isAppleBillingEntry } from "@/lib/utils/subscription-matching";

export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: subscriptions, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("due_day", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Subscriptions fetch failed");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch payment methods separately to avoid foreign key ambiguity
  const subscriptionsWithData = await Promise.all(
    (subscriptions || []).map(async (sub: any) => {
      // Fetch payment method
      if (sub.payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from("payment_methods")
          .select("name, type, currency")
          .eq("id", sub.payment_method_id)
          .maybeSingle();
        if (paymentMethod) {
          sub.payment_methods = paymentMethod;
        }
      }

      // Fetch merchant
      if (sub.merchant_id) {
        const { data: merchant } = await supabase
          .from("merchants")
          .select("id, name")
          .eq("id", sub.merchant_id)
          .maybeSingle();
        if (merchant) {
          sub.merchants = merchant;
        }
      }

      // Fetch category
      if (sub.category_id) {
        const { data: category } = await supabase
          .from("transaction_categories")
          .select("id, name, color")
          .eq("id", sub.category_id)
          .maybeSingle();
        if (category) {
          sub.transaction_categories = category;
        }
      }

      // Fetch linked transactions and calculate total expense
      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount")
        .eq("subscription_id", sub.id)
        .eq("workspace_id", workspaceId);

      const totalExpense = transactions
        ? transactions.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)
        : 0;
      
      sub.total_expense = totalExpense;
      sub.transaction_count = transactions?.length || 0;

      return sub;
    })
  );

  return NextResponse.json({ subscriptions: subscriptionsWithData });
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

  const input = await request.json();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const { transaction_id, ...draft } = input;

  // If transaction_id is provided, extract data from the transaction
  if (transaction_id) {
    const { data: transaction } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transaction_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found in workspace" }, { status: 404 });
    }
    if (transaction.subscription_id) {
      return NextResponse.json({ error: "Transaction already linked to a subscription" }, { status: 409 });
    }
    // Extract due_day from transaction date
    if (draft.due_day === undefined && transaction.transaction_date) draft.due_day = Number(transaction.transaction_date.slice(8, 10));

    // Use transaction amount if not provided
    if (draft.amount === undefined) draft.amount = Math.abs(transaction.amount);

    // Use transaction payment_method_id if not provided
    if (draft.payment_method_id === undefined) draft.payment_method_id = transaction.payment_method_id;
    if (draft.payment_method_id !== transaction.payment_method_id) {
      return NextResponse.json({ error: "Subscription must use the transaction's payment account" }, { status: 400 });
    }

    // Use transaction merchant_id if not provided
    if (draft.merchant_id === undefined) draft.merchant_id = transaction.merchant_id;

    // Use transaction category_id if not provided
    if (draft.category_id === undefined) draft.category_id = transaction.category_id;
    if (draft.statement_match_text === undefined) draft.statement_match_text = transaction.description?.trim() || null;
    if (draft.billing_provider === undefined) draft.billing_provider = isAppleBillingEntry(transaction.description) ? "apple" : "direct";

    // Generate name if not provided
    if (!draft.name) {
      // Get merchant name if available
      let merchantName = null;
      if (transaction.merchant_id) {
        const { data: merchant } = await supabase
          .from("merchants")
          .select("name")
          .eq("id", transaction.merchant_id)
          .maybeSingle();
        merchantName = merchant?.name;
      } else if (transaction.merchant) {
        merchantName = transaction.merchant;
      }

      if (merchantName) {
        // Check if a subscription with this merchant name already exists
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("name", merchantName.trim())
          .is("archived_at", null)
          .maybeSingle();

        if (existingSub) {
          // Use merchant name + description
          const description = transaction.description?.trim() || "";
          draft.name = description ? `${merchantName} - ${description}` : merchantName;
        } else {
          draft.name = merchantName;
        }
      } else {
        // Fallback to description or default name
        draft.name = transaction.description?.trim() || "Unnamed Subscription";
      }
    }
  }

  if (!draft.name || draft.amount === undefined || draft.due_day === undefined || !draft.payment_method_id) {
    return NextResponse.json(
      { error: "Name, amount, due_day, and payment_method_id are required" },
      { status: 400 }
    );
  }

  let fields;
  try {
    fields = parseSubscriptionFields(draft);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  if (!await subscriptionReferencesValid(supabase, workspaceId, fields)) {
    return NextResponse.json({ error: "Account, merchant or category not in workspace" }, { status: 400 });
  }

  // Create subscription
  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      workspace_id: workspaceId,
      ...fields,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Subscription create failed");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If transaction_id is provided, link the transaction to this subscription
  if (transaction_id) {
    const { data: linked, error: updateError } = await supabase
      .from("transactions")
      .update({ subscription_id: subscription.id })
      .eq("id", transaction_id)
      .eq("workspace_id", workspaceId)
      .is("subscription_id", null)
      .select("id")
      .maybeSingle();

    if (updateError || !linked) {
      console.error("Subscription transaction link failed");
      // Do not present an unlinked subscription as a successful operation.
      await supabase.from("subscriptions").update({ archived_at: new Date().toISOString(), is_active: false })
        .eq("id", subscription.id).eq("workspace_id", workspaceId);
      return NextResponse.json({ error: "Could not link transaction to subscription" }, { status: 500 });
    }
  }

  return NextResponse.json({ subscription });
}
