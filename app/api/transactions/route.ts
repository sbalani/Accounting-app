import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { getExchangeRateForDate, convertAmount } from "@/lib/utils/currency";

export async function GET(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const paymentMethodId = searchParams.get("payment_method_id");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  let query = supabase
    .from("transactions")
    .select("*, payment_methods(name, type)")
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (paymentMethodId) {
    query = query.eq("payment_method_id", paymentMethodId);
  }

  if (startDate) {
    query = query.gte("transaction_date", startDate);
  }

  if (endDate) {
    query = query.lte("transaction_date", endDate);
  }

  const { data: transactions, error } = await query;

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
    transactions,
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

  const {
    payment_method_id,
    amount,
    description,
    category,
    transaction_date,
    source,
    merchant,
    currency,
    exchange_rate,
  } = await request.json();

  if (!payment_method_id || !amount || !transaction_date) {
    return NextResponse.json(
      { error: "Payment method, amount, and transaction date are required" },
      { status: 400 }
    );
  }

  // Get workspace to find primary currency
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("primary_currency")
    .eq("id", workspaceId)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  // Get payment method to find default currency
  const { data: paymentMethod, error: paymentMethodError } = await supabase
    .from("payment_methods")
    .select("id, currency")
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

  // Determine transaction currency (use provided or default to payment method currency)
  const transactionCurrency = currency || paymentMethod.currency || "USD";
  const baseAmount = parseFloat(amount);
  const primaryCurrency = workspace.primary_currency || "USD";

  // Calculate exchange rate and converted amount
  let exchangeRate = 1;
  let convertedAmount = baseAmount;

  if (transactionCurrency !== primaryCurrency) {
    // Use provided exchange rate if available, otherwise fetch it
    if (exchange_rate !== undefined && exchange_rate !== null) {
      exchangeRate = parseFloat(exchange_rate);
      convertedAmount = convertAmount(baseAmount, exchangeRate);
    } else {
      try {
        exchangeRate = await getExchangeRateForDate(
          transactionCurrency,
          primaryCurrency,
          transaction_date
        );
        convertedAmount = convertAmount(baseAmount, exchangeRate);
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to fetch exchange rate: ${error.message}` },
          { status: 500 }
        );
      }
    }
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .insert({
      workspace_id: workspaceId,
      payment_method_id,
      amount: convertedAmount, // Store converted amount in primary currency
      base_amount: baseAmount, // Store original amount in transaction currency
      currency: transactionCurrency,
      exchange_rate: exchangeRate,
      description: description?.trim() || null,
      category: category?.trim() || null,
      merchant: merchant?.trim() || null,
      transaction_date,
      source: source || "manual",
      created_by: user.id,
    })
    .select("*, payment_methods(name, type, currency)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}
