import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function POST(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { transaction_id } = await request.json();

  if (!transaction_id) {
    return NextResponse.json({ error: "transaction_id is required" }, { status: 400 });
  }

  // Get the transaction
  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transaction_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (transactionError || !transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  // Skip if transaction is already linked to a subscription
  if (transaction.subscription_id) {
    return NextResponse.json({ suggestions: [] });
  }

  const transactionDate = new Date(transaction.transaction_date);
  const transactionDay = transactionDate.getDate();
  const transactionAmount = Math.abs(transaction.amount);
  const transactionMerchantId = transaction.merchant_id;

  // Look for potential subscription matches
  // Criteria:
  // 1. Same workspace
  // 2. Similar amount (within 1% tolerance to account for rounding differences)
  // 3. Similar day of month (±2 days)
  // 4. Not already linked to a subscription
  // 5. Optionally: same merchant (if available)
  // Check both future and past transactions to establish pattern

  const amountTolerance = 0.01; // 1% tolerance

  // Query for transactions with similar absolute amount (subscriptions are typically expenses, so negative)
  // We'll check for both positive and negative amounts, but filter by absolute value
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("id", transaction_id)
    .is("subscription_id", null);

  // If merchant_id is available, prefer matching by merchant
  if (transactionMerchantId) {
    query = query.eq("merchant_id", transactionMerchantId);
  }

  const { data: potentialMatches, error: matchesError } = await query;

  if (matchesError) {
    console.error("Error finding potential matches:", matchesError);
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  // Filter matches by amount (absolute value within tolerance) and day of month (±2 days)
  const filteredMatches = (potentialMatches || []).filter((match: any) => {
    const matchAmount = Math.abs(match.amount);
    const amountDiff = Math.abs(matchAmount - transactionAmount);
    const amountMatch = amountDiff <= transactionAmount * amountTolerance;

    if (!amountMatch) return false;

    const matchDate = new Date(match.transaction_date);
    const matchDay = matchDate.getDate();
    const dayDiff = Math.abs(matchDay - transactionDay);
    
    // Allow ±2 days or wrap around month boundaries (e.g., 1st and 30th)
    return dayDiff <= 2 || dayDiff >= 28;
  });

  // Separate matches into past and future
  const pastMatches = filteredMatches.filter((match: any) => {
    return new Date(match.transaction_date) < transactionDate;
  });

  const futureMatches = filteredMatches.filter((match: any) => {
    return new Date(match.transaction_date) > transactionDate;
  });

  // Group matches by similarity and find the best subscription candidates
  // If we have multiple matches with similar patterns, suggest creating/linking to subscription
  const suggestions: any[] = [];
  const allMatches = [...pastMatches, ...futureMatches];

  if (allMatches.length > 0) {
    // Check if there's already a subscription that matches this pattern
    const { data: existingSubscriptions } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .gte("amount", transactionAmount * 0.99)
      .lte("amount", transactionAmount * 1.01);

    // Filter subscriptions by due_day similarity
    const matchingSubscriptions = (existingSubscriptions || []).filter((sub: any) => {
      const dayDiff = Math.abs(sub.due_day - transactionDay);
      return dayDiff <= 2 || dayDiff >= 28;
    });

    // If merchant_id matches, prioritize those
    if (transactionMerchantId) {
      const merchantMatches = matchingSubscriptions.filter(
        (sub: any) => sub.merchant_id === transactionMerchantId
      );
      if (merchantMatches.length > 0) {
        matchingSubscriptions.splice(0, matchingSubscriptions.length, ...merchantMatches);
      }
    }

    if (matchingSubscriptions.length > 0) {
      // Suggest linking to existing subscription
      suggestions.push({
        type: "link_to_existing",
        subscription: matchingSubscriptions[0],
        match_count: allMatches.length,
        future_match_count: futureMatches.length,
        confidence: "high",
      });
    } else if (futureMatches.length > 0) {
      // Suggest creating a new subscription if there are future matches
      // Future matches are more indicative of a subscription pattern
      const matchCount = allMatches.length;
      suggestions.push({
        type: "create_new",
        match_count: matchCount,
        future_match_count: futureMatches.length,
        suggested_amount: transactionAmount,
        suggested_due_day: transactionDay,
        matching_transactions: futureMatches.slice(0, 5).map((t: any) => ({
          id: t.id,
          date: t.transaction_date,
          amount: t.amount,
        })),
        confidence: futureMatches.length >= 1 ? "high" : "medium",
      });
    }
  }

  return NextResponse.json({ suggestions });
}

