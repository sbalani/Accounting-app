import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { getExchangeRateForDate, convertAmount } from "@/lib/utils/currency";

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

  // Get existing transaction first
  const { data: existingTransaction, error: fetchError } = await supabase
    .from("transactions")
    .select("*, payment_methods(id, currency)")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !existingTransaction) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 }
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

  const {
    payment_method_id,
    amount,
    description,
    category,
    transaction_date,
    merchant,
    currency,
    exchange_rate,
  } = await request.json();

  const updateData: any = {};
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (category !== undefined) updateData.category = category?.trim() || null;
  if (merchant !== undefined) updateData.merchant = merchant?.trim() || null;
  if (transaction_date !== undefined) updateData.transaction_date = transaction_date;

  // Handle payment method change
  let paymentMethodCurrency = existingTransaction.payment_methods?.currency;
  if (payment_method_id !== undefined) {
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

    updateData.payment_method_id = payment_method_id;
    paymentMethodCurrency = paymentMethod.currency;
  }

  // Handle currency and amount updates
  const transactionCurrency = currency || existingTransaction.currency || paymentMethodCurrency || "USD";
  const primaryCurrency = workspace.primary_currency || "USD";
  const transactionDate = transaction_date || existingTransaction.transaction_date;

  if (amount !== undefined || currency !== undefined || exchange_rate !== undefined) {
    // Determine base amount
    let baseAmount: number;
    if (amount !== undefined) {
      // New amount provided - this is the base amount in transaction currency
      baseAmount = parseFloat(amount);
    } else {
      // Use existing base_amount if available, otherwise use amount (for backwards compatibility)
      baseAmount = existingTransaction.base_amount || existingTransaction.amount;
    }

    updateData.base_amount = baseAmount;
    updateData.currency = transactionCurrency;

    // Calculate exchange rate and converted amount
    let exchangeRate = 1;
    let convertedAmount = baseAmount;

    if (transactionCurrency !== primaryCurrency) {
      // Use provided exchange rate if available, otherwise fetch it
      if (exchange_rate !== undefined && exchange_rate !== null) {
        exchangeRate = parseFloat(exchange_rate);
        convertedAmount = convertAmount(baseAmount, exchangeRate);
      } else {
        // Try to use existing exchange rate if currency hasn't changed
        if (currency === undefined && existingTransaction.exchange_rate) {
          exchangeRate = existingTransaction.exchange_rate;
          convertedAmount = convertAmount(baseAmount, exchangeRate);
        } else {
          // Fetch new exchange rate
          try {
            exchangeRate = await getExchangeRateForDate(
              transactionCurrency,
              primaryCurrency,
              transactionDate
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
    }

    updateData.exchange_rate = exchangeRate;
    updateData.amount = convertedAmount; // Store converted amount in primary currency
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select("*, payment_methods(name, type, currency)")
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
