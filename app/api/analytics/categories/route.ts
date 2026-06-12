import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  try {
    let query = supabase
      .from("transactions")
      .select("id, amount, transaction_date, category_id")
      .eq("workspace_id", workspaceId)
      .neq("transaction_type", "transfer");

    if (startDate) {
      query = query.gte("transaction_date", startDate);
    }
    if (endDate) {
      query = query.lte("transaction_date", endDate);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const transactions = (rows || []) as {
      id: string;
      amount: number;
      transaction_date: string;
      category_id: string | null;
    }[];

    const { data: categories } = await supabase
      .from("transaction_categories")
      .select("id, name, color, is_default")
      .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
      .order("name", { ascending: true });

    const categoryMap = new Map(
      (categories || []).map((c) => [c.id, { id: c.id, name: c.name, color: c.color || null }])
    );

    type Totals = {
      income: number;
      expense: number;
      net: number;
      count: number;
    };

    const allTotals: Totals = {
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };

    const perCategory: Record<
      string,
      Totals & { id: string; name: string; color: string | null }
    > = {};

    const uncatKey = "__uncategorized__";
    const uncat = {
      id: uncatKey,
      name: "Uncategorized",
      color: "#95A5A6",
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };
    perCategory[uncatKey] = uncat;

    for (const tx of transactions) {
      const amount = Number(tx.amount) || 0;
      if (amount === 0) continue;

      const isIncome = amount > 0;
      const absAmount = Math.abs(amount);

      allTotals.count += 1;
      allTotals.net += amount;
      if (isIncome) {
        allTotals.income += absAmount;
      } else {
        allTotals.expense += absAmount;
      }

      const cid = tx.category_id;
      const useUncat = !cid || !categoryMap.has(cid);
      const key = useUncat ? uncatKey : cid!;
      let rec = perCategory[key];

      if (!rec && !useUncat) {
        const cat = categoryMap.get(key)!;
        rec = {
          ...cat,
          income: 0,
          expense: 0,
          net: 0,
          count: 0,
        };
        perCategory[key] = rec;
      }
      if (!rec) {
        rec = uncat;
      }

      rec.count += 1;
      rec.net += amount;
      if (isIncome) {
        rec.income += absAmount;
      } else {
        rec.expense += absAmount;
      }
    }

    const list = Object.values(perCategory)
      .filter((c) => c.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      allTotals,
      categories: list,
    });
  } catch (err: unknown) {
    console.error("Category analytics error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
