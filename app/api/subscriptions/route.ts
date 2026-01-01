import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

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
    .order("due_day", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching subscriptions:", error);
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

  let { name, amount, due_day, payment_method_id, merchant_id, category_id, transaction_id } = await request.json();

  // If transaction_id is provided, extract data from the transaction
  if (transaction_id) {
    const { data: transaction } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transaction_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (transaction) {
      // Extract due_day from transaction date
      if (!due_day && transaction.transaction_date) {
        const date = new Date(transaction.transaction_date);
        due_day = date.getDate();
      }

      // Use transaction amount if not provided
      if (!amount) {
        amount = Math.abs(transaction.amount);
      }

      // Use transaction payment_method_id if not provided
      if (!payment_method_id) {
        payment_method_id = transaction.payment_method_id;
      }

      // Use transaction merchant_id if not provided
      if (!merchant_id && transaction.merchant_id) {
        merchant_id = transaction.merchant_id;
      }

      // Use transaction category_id if not provided
      if (!category_id && transaction.category_id) {
        category_id = transaction.category_id;
      }

      // Generate name if not provided
      if (!name) {
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
            .maybeSingle();

          if (existingSub) {
            // Use merchant name + description
            const description = transaction.description?.trim() || "";
            name = description ? `${merchantName} - ${description}` : merchantName;
          } else {
            name = merchantName;
          }
        } else {
          // Fallback to description or default name
          name = transaction.description?.trim() || "Unnamed Subscription";
        }
      }
    }
  }

  if (!name || !amount || !due_day || !payment_method_id) {
    return NextResponse.json(
      { error: "Name, amount, due_day, and payment_method_id are required" },
      { status: 400 }
    );
  }

  if (due_day < 1 || due_day > 31) {
    return NextResponse.json(
      { error: "due_day must be between 1 and 31" },
      { status: 400 }
    );
  }

  // Create subscription
  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      amount: parseFloat(amount),
      due_day: parseInt(due_day),
      payment_method_id,
      merchant_id: merchant_id || null,
      category_id: category_id || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If transaction_id is provided, link the transaction to this subscription
  if (transaction_id) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ subscription_id: subscription.id })
      .eq("id", transaction_id)
      .eq("workspace_id", workspaceId);

    if (updateError) {
      console.error("Error linking transaction to subscription:", updateError);
      // Don't fail the request, just log the error
    }
  }

  return NextResponse.json({ subscription });
}

