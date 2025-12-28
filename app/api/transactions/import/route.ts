import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { parseCSVStatement } from "@/lib/utils/transaction-parser";
import { parseCSVWithConfig, CSVImportConfig } from "@/lib/utils/csv-parser";

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

  // Verify payment method belongs to workspace
  const { data: paymentMethod, error: paymentMethodError } = await supabase
    .from("payment_methods")
    .select("id")
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
    // Check for duplicates using the database function
    const { data: duplicates } = await supabase.rpc("find_duplicate_transactions", {
      workspace_id_param: workspaceId,
      amount_param: parseFloat(transaction.amount),
      transaction_date_param: transaction.transaction_date,
      payment_method_id_param: payment_method_id,
    });

    if (duplicates && duplicates.length > 0) {
      duplicateTransactions.push({
        ...transaction,
        duplicate_of: duplicates[0].id,
      });
    } else {
      importedTransactions.push({
        workspace_id: workspaceId,
        payment_method_id,
        amount: parseFloat(transaction.amount),
        description: transaction.description?.trim() || null,
        merchant: transaction.merchant?.trim() || null,
        category: transaction.category?.trim() || null,
        transaction_date: transaction.transaction_date,
        source: transaction.source || "csv",
        created_by: user.id,
      });
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
    if (fileType === "csv") {
      // Check if we have CSV config in query params
      const configParam = searchParams.get("csv_config");
      
      if (configParam) {
        // Use new config-based parsing
        const config: CSVImportConfig = JSON.parse(decodeURIComponent(configParam));
        
        // Fetch CSV content
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch CSV file");
        }
        const csvContent = await response.text();

        // Parse CSV with config
        const transactions = parseCSVWithConfig(csvContent, config);

        return NextResponse.json({ transactions });
      } else {
        // Fallback to old parsing method for backward compatibility
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
