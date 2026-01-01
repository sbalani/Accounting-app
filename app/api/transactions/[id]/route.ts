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
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data separately to avoid foreign key ambiguity
  if (transaction) {
    // Fetch payment method
    if (transaction.payment_method_id) {
      const { data: paymentMethod } = await supabase
        .from("payment_methods")
        .select("name, type, currency")
        .eq("id", transaction.payment_method_id)
        .maybeSingle();
      if (paymentMethod) {
        transaction.payment_methods = paymentMethod;
      }
    }

    // Fetch category
    if (transaction.category_id) {
      const { data: category } = await supabase
        .from("transaction_categories")
        .select("id, name, color, is_default")
        .eq("id", transaction.category_id)
        .maybeSingle();
      if (category) {
        transaction.transaction_categories = category;
        transaction.category = category.name;
      }
    }

    // Fetch merchant
    if (transaction.merchant_id) {
      const { data: merchant } = await supabase
        .from("merchants")
        .select("id, name, is_default")
        .eq("id", transaction.merchant_id)
        .maybeSingle();
      if (merchant) {
        transaction.merchants = merchant;
        transaction.merchant = merchant.name;
      }
    }
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
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching transaction:", fetchError);
    return NextResponse.json(
      { error: fetchError.message || "Failed to fetch transaction" },
      { status: 500 }
    );
  }

  if (!existingTransaction) {
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
    category_id,
    transaction_date,
    merchant,
    merchant_id,
    currency,
    exchange_rate,
  } = await request.json();

  const updateData: any = {};
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (transaction_date !== undefined) updateData.transaction_date = transaction_date;
  
  // Handle category_id (preferred) or category (backward compatibility)
  if (category_id !== undefined) {
    updateData.category_id = category_id || null;
    // Also update category text field for backward compatibility
    if (category_id) {
      const { data: categoryData, error: categoryError } = await supabase
        .from("transaction_categories")
        .select("name")
        .eq("id", category_id)
        .maybeSingle();
      if (categoryError) {
        console.error("Error fetching category:", categoryError);
      } else if (categoryData) {
        updateData.category = categoryData.name;
      }
    } else {
      updateData.category = null;
    }
  } else if (category !== undefined) {
    // Backward compatibility: if category text is provided, try to find or create category
    updateData.category = category?.trim() || null;
    if (category?.trim()) {
      const { data: categoryData } = await supabase
        .from("transaction_categories")
        .select("id, name")
        .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
        .ilike("name", category.trim())
        .maybeSingle();
      
      if (categoryData) {
        updateData.category_id = categoryData.id;
      }
    } else {
      updateData.category_id = null;
    }
  }
  
  // Handle merchant_id (preferred) or merchant (backward compatibility)
  if (merchant_id !== undefined) {
    updateData.merchant_id = merchant_id || null;
    // Also update merchant text field for backward compatibility
    if (merchant_id) {
      const { data: merchantData, error: merchantError } = await supabase
        .from("merchants")
        .select("name")
        .eq("id", merchant_id)
        .maybeSingle();
      if (merchantError) {
        console.error("Error fetching merchant:", merchantError);
      } else if (merchantData) {
        updateData.merchant = merchantData.name;
      }
    } else {
      updateData.merchant = null;
    }
  } else if (merchant !== undefined) {
    // Backward compatibility: if merchant text is provided, try to find or create merchant
    updateData.merchant = merchant?.trim() || null;
    if (merchant?.trim()) {
      const { data: merchantData } = await supabase
        .from("merchants")
        .select("id, name")
        .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
        .ilike("name", merchant.trim())
        .maybeSingle();
      
      if (merchantData) {
        updateData.merchant_id = merchantData.id;
      }
    } else {
      updateData.merchant_id = null;
    }
  }

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

  // Update the transaction
  const { error: updateError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error("Error updating transaction:", updateError);
    return NextResponse.json({ error: updateError.message || "Failed to update transaction" }, { status: 500 });
  }

  // Fetch the updated transaction (without payment_methods to avoid foreign key ambiguity)
  const { data: transaction, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching updated transaction:", fetchError);
    return NextResponse.json({ error: fetchError.message || "Failed to fetch updated transaction" }, { status: 500 });
  }

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found or could not be updated" }, { status: 404 });
  }

  // Fetch related data separately to avoid foreign key ambiguity
  if (transaction) {
    // Fetch payment method
    if (transaction.payment_method_id) {
      const { data: paymentMethod } = await supabase
        .from("payment_methods")
        .select("name, type, currency")
        .eq("id", transaction.payment_method_id)
        .maybeSingle();
      if (paymentMethod) {
        transaction.payment_methods = paymentMethod;
      }
    }

    // Fetch category
    if (transaction.category_id) {
      const { data: category } = await supabase
        .from("transaction_categories")
        .select("id, name, color, is_default")
        .eq("id", transaction.category_id)
        .maybeSingle();
      if (category) {
        transaction.transaction_categories = category;
        transaction.category = category.name;
      }
    }

    // Fetch merchant
    if (transaction.merchant_id) {
      const { data: merchant } = await supabase
        .from("merchants")
        .select("id, name, is_default")
        .eq("id", transaction.merchant_id)
        .maybeSingle();
      if (merchant) {
        transaction.merchants = merchant;
        transaction.merchant = merchant.name;
      }
    }
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
