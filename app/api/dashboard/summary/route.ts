import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

function monthToDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export async function GET() {
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

  const { start: mtdStart, end: mtdEnd } = monthToDateRange();

  const [
    { data: workspace },
    { data: paymentMethods },
    { data: mtdTransactions },
    { data: recentTransactions },
    { data: subscriptions },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("primary_currency")
      .eq("id", workspaceId)
      .single(),
    supabase
      .from("payment_methods")
      .select("id, name, type, current_balance")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("transactions")
      .select("amount, transaction_type")
      .eq("workspace_id", workspaceId)
      .gte("transaction_date", mtdStart)
      .lte("transaction_date", mtdEnd)
      .neq("transaction_type", "transfer"),
    supabase
      .from("transactions")
      .select("id, amount, description, transaction_date, transaction_type")
      .eq("workspace_id", workspaceId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("subscriptions")
      .select("amount, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const primaryCurrency = workspace?.primary_currency || "USD";

  let mtdIncome = 0;
  let mtdExpense = 0;
  for (const tx of mtdTransactions || []) {
    const amount = Number(tx.amount) || 0;
    if (amount > 0) mtdIncome += amount;
    else if (amount < 0) mtdExpense += amount;
  }

  let assets = 0;
  let liabilities = 0;
  for (const pm of paymentMethods || []) {
    const balance = Number(pm.current_balance) || 0;
    if (pm.type === "credit_card") {
      if (balance < 0) liabilities += Math.abs(balance);
      else assets += balance;
    } else {
      assets += balance;
    }
  }

  const monthlySubscriptions = (subscriptions || []).reduce(
    (sum, s) => sum + Math.abs(Number(s.amount) || 0),
    0
  );

  return NextResponse.json({
    primaryCurrency,
    mtd: {
      start: mtdStart,
      end: mtdEnd,
      income: mtdIncome,
      expense: mtdExpense,
      net: mtdIncome + mtdExpense,
    },
    netWorth: {
      assets,
      liabilities,
      total: assets - liabilities,
    },
    monthlySubscriptions,
    activeSubscriptionCount: subscriptions?.length || 0,
    paymentMethods: paymentMethods || [],
    recentTransactions: recentTransactions || [],
  });
}
