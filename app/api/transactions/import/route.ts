import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { parseCSVStatement } from "@/lib/utils/transaction-parser";
import { parseCSVWithConfig, parseXLSXWithConfig, CSVImportConfig } from "@/lib/utils/csv-parser";
import { getExchangeRateForDate, convertAmount } from "@/lib/utils/currency";

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

  const { transactions, payment_method_id } = await request.json();

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json(
      { error: "Transactions array is required" },
      { status: 400 }
    );
  }

  if (!payment_method_id) {
    return NextResponse.json(
      { error: "Payment method ID is required" },
      { status: 400 }
    );
  }

  // Get workspace primary currency
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("primary_currency")
    .eq("id", workspaceId)
    .single();
  
  const primaryCurrency = workspace?.primary_currency || "USD";

  // Verify payment method belongs to workspace and get currency
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

  // Check for duplicates before importing
  const importedTransactions = [];
  const duplicateTransactions = [];

  for (const transaction of transactions) {
    const isTransfer = transaction.transaction_type === "transfer";
    const transactionAmount = Math.abs(parseFloat(transaction.amount));
    
    // For transfers, use transfer_from_id as the payment_method_id
    // For regular transactions, use the provided payment_method_id
    const sourcePaymentMethodId = isTransfer && transaction.transfer_from_id 
      ? transaction.transfer_from_id 
      : payment_method_id;

    // Check for duplicates using the database function
    const { data: duplicates } = await supabase.rpc("find_duplicate_transactions", {
      workspace_id_param: workspaceId,
      amount_param: transactionAmount,
      transaction_date_param: transaction.transaction_date,
      payment_method_id_param: sourcePaymentMethodId,
    });

    if (duplicates && duplicates.length > 0) {
      duplicateTransactions.push({
        ...transaction,
        duplicate_of: duplicates[0].id,
      });
    } else {
      // Determine transaction type
      let transactionType: "expense" | "income" | "transfer" = "expense";
      if (isTransfer) {
        transactionType = "transfer";
      } else if (transaction.amount >= 0) {
        transactionType = "income";
      }

      // Get currency from payment method
      let transactionCurrency = "USD";
      if (sourcePaymentMethodId === payment_method_id) {
        transactionCurrency = paymentMethod?.currency || "USD";
      } else {
        const { data: sourcePM } = await supabase
          .from("payment_methods")
          .select("currency")
          .eq("id", sourcePaymentMethodId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        transactionCurrency = sourcePM?.currency || "USD";
      }

      // Calculate base amount (original amount in transaction currency)
      const baseAmount = Math.abs(parseFloat(transaction.amount));
      
      // Calculate exchange rate and converted amount
      let exchangeRate = 1;
      let convertedAmount = baseAmount;
      
      if (transactionCurrency !== primaryCurrency) {
        try {
          exchangeRate = await getExchangeRateForDate(
            transactionCurrency,
            primaryCurrency,
            transaction.transaction_date
          );
          convertedAmount = convertAmount(baseAmount, exchangeRate);
        } catch (error: any) {
          // If exchange rate fetch fails, use 1:1 as fallback
          console.warn(`Failed to fetch exchange rate: ${error.message}, using 1:1`);
          exchangeRate = 1;
          convertedAmount = baseAmount;
        }
      }

      const transactionData: any = {
        workspace_id: workspaceId,
        payment_method_id: sourcePaymentMethodId,
        amount: isTransfer ? -convertedAmount : (transaction.amount >= 0 ? convertedAmount : -convertedAmount), // Converted amount in primary currency
        base_amount: baseAmount, // Original amount in transaction currency
        currency: transactionCurrency,
        exchange_rate: exchangeRate,
        description: transaction.description?.trim() || null,
        merchant: transaction.merchant?.trim() || null,
        category: transaction.category?.trim() || null,
        transaction_date: transaction.transaction_date,
        source: transaction.source || "csv",
        transaction_type: transactionType,
        created_by: user.id,
      };

      // Add transfer fields if it's a transfer
      if (isTransfer) {
        transactionData.transfer_from_id = transaction.transfer_from_id || sourcePaymentMethodId;
        transactionData.transfer_to_id = transaction.transfer_to_id;
      }

      importedTransactions.push(transactionData);

      // For transfers, also create the corresponding transaction in the destination account
      if (isTransfer && transaction.transfer_to_id) {
        // Verify destination account belongs to workspace and get currency
        const { data: destPaymentMethod } = await supabase
          .from("payment_methods")
          .select("id, currency")
          .eq("id", transaction.transfer_to_id)
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (destPaymentMethod) {
          // Check for duplicates in destination account
          const { data: destDuplicates } = await supabase.rpc("find_duplicate_transactions", {
            workspace_id_param: workspaceId,
            amount_param: transactionAmount,
            transaction_date_param: transaction.transaction_date,
            payment_method_id_param: transaction.transfer_to_id,
          });

          if (!destDuplicates || destDuplicates.length === 0) {
            importedTransactions.push({
              workspace_id: workspaceId,
              payment_method_id: transaction.transfer_to_id,
              amount: transactionAmount, // Positive for transfers to this account
              description: transaction.description?.trim() || null,
              merchant: transaction.merchant?.trim() || null,
              category: transaction.category?.trim() || null,
              transaction_date: transaction.transaction_date,
              source: transaction.source || "csv",
              transaction_type: "transfer",
              transfer_from_id: transaction.transfer_from_id || sourcePaymentMethodId,
              transfer_to_id: transaction.transfer_to_id,
              created_by: user.id,
            });
          }
        }
      }
    }
  }

  // Insert non-duplicate transactions
  let insertedCount = 0;
  if (importedTransactions.length > 0) {
    const { data, error } = await supabase
      .from("transactions")
      .insert(importedTransactions)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    insertedCount = data?.length || 0;
  }

  return NextResponse.json({
    imported: insertedCount,
    duplicates: duplicateTransactions.length,
    total: transactions.length,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get("file_url");
  const fileType = searchParams.get("file_type"); // 'csv' or 'pdf'

  if (!fileUrl || !fileType) {
    return NextResponse.json(
      { error: "File URL and type are required" },
      { status: 400 }
    );
  }

  try {
    if (fileType === "csv" || fileType === "xlsx") {
      // Check if we have CSV config in query params
      const configParam = searchParams.get("csv_config");
      
      if (configParam) {
        // Use new config-based parsing
        const config: CSVImportConfig = JSON.parse(decodeURIComponent(configParam));
        
        if (fileType === "xlsx") {
          // Handle XLSX files
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch XLSX file");
          }
          const buffer = await response.arrayBuffer();

          // Parse XLSX with config
          const transactions = parseXLSXWithConfig(buffer, config);

          return NextResponse.json({ transactions });
        } else {
          // Handle CSV files
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch CSV file");
          }
          const csvContent = await response.text();

          // Parse CSV with config
          const transactions = parseCSVWithConfig(csvContent, config);

          return NextResponse.json({ transactions });
        }
      } else {
        // Fallback to old parsing method for backward compatibility (CSV only)
        if (fileType === "xlsx") {
          return NextResponse.json(
            { error: "XLSX files require column mapping configuration" },
            { status: 400 }
          );
        }
        
        // Fetch CSV content
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch CSV file");
        }
        const csvContent = await response.text();

        // Parse CSV
        const transactions = parseCSVStatement(csvContent);

        return NextResponse.json({ transactions });
      }
    } else if (fileType === "pdf") {
      // For PDF, we'll use OpenAI Vision API
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 500 }
        );
      }

      // Use OpenAI to extract text from PDF
      // Note: This is a simplified approach. In production, you might want to convert PDF to images first
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all transactions from this bank statement. Return a JSON array of transactions, each with: amount (number, negative for debits), description (string), transaction_date (YYYY-MM-DD format).",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: fileUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "OpenAI API error");
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      // Parse JSON response
      let transactions;
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        transactions = JSON.parse(jsonString);
      } catch (parseError) {
        throw new Error("Failed to parse transaction data from PDF");
      }

      return NextResponse.json({ transactions });
    } else {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process statement" },
      { status: 500 }
    );
  }
}
