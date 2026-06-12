import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { getExchangeRateForDate, convertAmount } from "@/lib/utils/currency";
import { buildIlikeOrFilter } from "@/lib/utils/postgrest-filters";

function applyTransactionFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: {
    workspaceId: string;
    paymentMethodId: string | null;
    startDate: string | null;
    endDate: string | null;
    transactionType: string | null;
    search: string | null;
  }
) {
  let q = query.eq("workspace_id", filters.workspaceId);

  if (filters.paymentMethodId) {
    q = q.eq("payment_method_id", filters.paymentMethodId);
  }
  if (filters.startDate) {
    q = q.gte("transaction_date", filters.startDate);
  }
  if (filters.endDate) {
    q = q.lte("transaction_date", filters.endDate);
  }
  if (filters.transactionType) {
    q = q.eq("transaction_type", filters.transactionType);
  }
  if (filters.search) {
    q = q.or(
      buildIlikeOrFilter(["description", "merchant", "category"], filters.search)
    );
  }
  return q;
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const paymentMethodId = searchParams.get("payment_method_id");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const transactionType = searchParams.get("transaction_type");
  const search = searchParams.get("search")?.trim() || null;
  const limitParam = searchParams.get("limit");
  const pageParam = searchParams.get("page");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : null;
  const page = pageParam ? Math.max(parseInt(pageParam, 10) || 1, 1) : 1;

  const filters = {
    workspaceId,
    paymentMethodId,
    startDate,
    endDate,
    transactionType,
    search,
  };

  let query = applyTransactionFilters(
    supabase.from("transactions").select(
      `
      *,
      transaction_tag_assignments:transaction_tag_assignments (
        tag:transaction_tags (
          id,
          name,
          color,
          exclude_from_analytics
        )
      )
    `,
      { count: limit !== null ? "exact" : undefined }
    ),
    filters
  )
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (limit !== null) {
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);
  }

  try {
    const { data: transactions, error, count } = await query;

    if (error) {
      console.error("Error fetching transactions:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return NextResponse.json({ 
        error: error.message || "Failed to fetch transactions",
        details: error 
      }, { status: 500 });
    }

    // Get workspace primary currency
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("primary_currency")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      console.error("Error fetching workspace:", workspaceError);
    }

    let openingBalance: number | null = null;
    if (paymentMethodId) {
      const { data: pm } = await supabase
        .from("payment_methods")
        .select("initial_balance")
        .eq("id", paymentMethodId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const initial = pm?.initial_balance != null ? Number(pm.initial_balance) : 0;
      if (startDate) {
        const { data: prior } = await supabase
          .from("transactions")
          .select("amount")
          .eq("workspace_id", workspaceId)
          .eq("payment_method_id", paymentMethodId)
          .lt("transaction_date", startDate);
        const sumPrior = (prior || []).reduce((s, t) => s + Number(t.amount), 0);
        openingBalance = initial + sumPrior;
      } else {
        openingBalance = initial;
      }
    }

    // Fetch related data for all transactions
    const transactionsWithRelations = await Promise.all(
      (transactions || []).map(async (tx: any) => {
        // Fetch payment method
        if (tx.payment_method_id) {
          const { data: paymentMethod } = await supabase
            .from("payment_methods")
            .select("name, type, currency")
            .eq("id", tx.payment_method_id)
            .maybeSingle();
          if (paymentMethod) {
            tx.payment_methods = paymentMethod;
          }
        }

        // Fetch category
        if (tx.category_id) {
          const { data: category } = await supabase
            .from("transaction_categories")
            .select("id, name, color, is_default")
            .eq("id", tx.category_id)
            .maybeSingle();
          if (category) {
            tx.transaction_categories = category;
            tx.category = category.name;
          }
        }

        // Fetch merchant
        if (tx.merchant_id) {
          const { data: merchant } = await supabase
            .from("merchants")
            .select("id, name, is_default")
            .eq("id", tx.merchant_id)
            .maybeSingle();
          if (merchant) {
            tx.merchants = merchant;
            tx.merchant = merchant.name;
          }
        }

        // Normalize tags array for frontend
        const tags =
          (tx.transaction_tag_assignments || [])
            .map((tta: any) => tta.tag)
            .filter(Boolean) || [];

        return {
          ...tx,
          category: tx.category || null,
          merchant: tx.merchant || null,
          category_id: tx.category_id || null,
          merchant_id: tx.merchant_id || null,
          tags,
        };
      })
    );

    let summary = { income: 0, expense: 0 };
    if (limit !== null) {
      let summaryQuery = applyTransactionFilters(
        supabase.from("transactions").select("amount, transaction_type"),
        filters
      );
      const { data: summaryRows } = await summaryQuery;
      for (const tx of summaryRows || []) {
        if (tx.transaction_type === "transfer") continue;
        const amount = Number(tx.amount) || 0;
        if (amount > 0) summary.income += amount;
        else if (amount < 0) summary.expense += amount;
      }
    }

    const res: {
      transactions: typeof transactionsWithRelations;
      primaryCurrency: string;
      openingBalance?: number;
      total?: number;
      page?: number;
      limit?: number;
      summary?: typeof summary;
    } = {
      transactions: transactionsWithRelations,
      primaryCurrency: workspace?.primary_currency || "USD",
    };
    if (openingBalance != null) res.openingBalance = openingBalance;
    if (limit !== null) {
      res.total = count ?? 0;
      res.page = page;
      res.limit = limit;
      res.summary = summary;
    }
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("Unexpected error in GET /api/transactions:", error);
    return NextResponse.json({ 
      error: error.message || "An unexpected error occurred",
      details: error.stack 
    }, { status: 500 });
  }
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
    category_id,
    transaction_date,
    source,
    merchant,
    merchant_id,
    currency,
    exchange_rate,
    transaction_type,
    transfer_from_id,
    transfer_to_id,
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

  // Helper function to resolve category_id from category text or use provided category_id
  let resolvedCategoryId: string | null = null;
  let resolvedCategoryName: string | null = null;
  if (category_id !== undefined) {
    resolvedCategoryId = category_id || null;
    if (resolvedCategoryId) {
      const { data: catData } = await supabase
        .from("transaction_categories")
        .select("name")
        .eq("id", resolvedCategoryId)
        .single();
      if (catData) {
        resolvedCategoryName = catData.name;
      }
    }
  } else if (category?.trim()) {
    // Try to find existing category
    const { data: catData } = await supabase
      .from("transaction_categories")
      .select("id, name")
      .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
      .ilike("name", category.trim())
      .maybeSingle();
    
    if (catData) {
      resolvedCategoryId = catData.id;
      resolvedCategoryName = catData.name;
    } else {
      resolvedCategoryName = category.trim();
    }
  }

  // Helper function to resolve merchant_id from merchant text or use provided merchant_id
  let resolvedMerchantId: string | null = null;
  let resolvedMerchantName: string | null = null;
  if (merchant_id !== undefined) {
    resolvedMerchantId = merchant_id || null;
    if (resolvedMerchantId) {
      const { data: merchData } = await supabase
        .from("merchants")
        .select("name")
        .eq("id", resolvedMerchantId)
        .single();
      if (merchData) {
        resolvedMerchantName = merchData.name;
      }
    }
  } else if (merchant?.trim()) {
    // Try to find existing merchant
    const { data: merchData } = await supabase
      .from("merchants")
      .select("id, name")
      .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
      .ilike("name", merchant.trim())
      .maybeSingle();
    
    if (merchData) {
      resolvedMerchantId = merchData.id;
      resolvedMerchantName = merchData.name;
    } else {
      resolvedMerchantName = merchant.trim();
    }
  }

  // Determine transaction type
  let finalTransactionType: "expense" | "income" | "transfer" = transaction_type || (baseAmount >= 0 ? "income" : "expense");
  const isTransfer = finalTransactionType === "transfer";

  // For transfers, validate transfer accounts
  if (isTransfer) {
    if (!transfer_from_id || !transfer_to_id) {
      return NextResponse.json(
        { error: "Transfer from and to accounts are required for transfers" },
        { status: 400 }
      );
    }

    // Verify both accounts belong to workspace
    const { data: transferAccounts, error: transferAccountsError } = await supabase
      .from("payment_methods")
      .select("id, currency")
      .eq("workspace_id", workspaceId)
      .in("id", [transfer_from_id, transfer_to_id]);

    if (transferAccountsError || !transferAccounts || transferAccounts.length !== 2) {
      return NextResponse.json(
        { error: "Transfer accounts not found or invalid" },
        { status: 400 }
      );
    }
  }

  // For transfers, create two transactions (one for each account)
  if (isTransfer) {
    const transferAmount = Math.abs(baseAmount);
    
    // Get currencies for both accounts
    const fromAccount = await supabase
      .from("payment_methods")
      .select("currency")
      .eq("id", transfer_from_id)
      .single();
    
    const toAccount = await supabase
      .from("payment_methods")
      .select("currency")
      .eq("id", transfer_to_id)
      .single();

    const fromCurrency = fromAccount.data?.currency || "USD";
    const toCurrency = toAccount.data?.currency || "USD";

    // Calculate exchange rates for both sides
    let fromExchangeRate = 1;
    let toExchangeRate = 1;
    let fromConvertedAmount = transferAmount;
    let toConvertedAmount = transferAmount;

    if (fromCurrency !== primaryCurrency) {
      if (exchange_rate !== undefined && exchange_rate !== null) {
        fromExchangeRate = parseFloat(exchange_rate);
        fromConvertedAmount = convertAmount(transferAmount, fromExchangeRate);
      } else {
        try {
          fromExchangeRate = await getExchangeRateForDate(
            fromCurrency,
            primaryCurrency,
            transaction_date
          );
          fromConvertedAmount = convertAmount(transferAmount, fromExchangeRate);
        } catch (error: any) {
          return NextResponse.json(
            { error: `Failed to fetch exchange rate for source account: ${error.message}` },
            { status: 500 }
          );
        }
      }
    }

    if (toCurrency !== primaryCurrency) {
      try {
        toExchangeRate = await getExchangeRateForDate(
          toCurrency,
          primaryCurrency,
          transaction_date
        );
        toConvertedAmount = convertAmount(transferAmount, toExchangeRate);
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to fetch exchange rate for destination account: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Insert both transactions
    const { data: transactions, error: insertError } = await supabase
      .from("transactions")
      .insert([
        {
          workspace_id: workspaceId,
          payment_method_id: transfer_from_id,
          amount: -fromConvertedAmount, // Negative for source account
          base_amount: transferAmount,
          currency: fromCurrency,
          exchange_rate: fromExchangeRate,
          description: description?.trim() || null,
          category: resolvedCategoryName,
          category_id: resolvedCategoryId,
          merchant: resolvedMerchantName,
          merchant_id: resolvedMerchantId,
          transaction_date,
          source: source || "manual",
          transaction_type: "transfer",
          transfer_from_id,
          transfer_to_id,
          created_by: user.id,
        },
        {
          workspace_id: workspaceId,
          payment_method_id: transfer_to_id,
          amount: toConvertedAmount, // Positive for destination account
          base_amount: transferAmount,
          currency: toCurrency,
          exchange_rate: toExchangeRate,
          description: description?.trim() || null,
          category: resolvedCategoryName,
          category_id: resolvedCategoryId,
          merchant: resolvedMerchantName,
          merchant_id: resolvedMerchantId,
          transaction_date,
          source: source || "manual",
          transaction_type: "transfer",
          transfer_from_id,
          transfer_to_id,
          created_by: user.id,
        },
      ])
      .select("*");

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ transaction: transactions?.[0], transactions });
  }

  // Regular transaction (expense or income)
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
      category: resolvedCategoryName,
      category_id: resolvedCategoryId,
      merchant: resolvedMerchantName,
      merchant_id: resolvedMerchantId,
      transaction_date,
      source: source || "manual",
      transaction_type: finalTransactionType,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data separately
  if (transaction) {
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
  }

  return NextResponse.json({ transaction });
}
