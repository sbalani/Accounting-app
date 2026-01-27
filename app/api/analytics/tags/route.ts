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
    // Base query joining transactions with tags
    let query = supabase
      .from("transactions")
      .select(
        `
        id,
        amount,
        transaction_date,
        transaction_type,
        transaction_tag_assignments:transaction_tag_assignments (
          tag:transaction_tags (
            id,
            name,
            color,
            exclude_from_analytics
          )
        )
      `
      )
      .eq("workspace_id", workspaceId);

    if (startDate) {
      query = query.gte("transaction_date", startDate);
    }

    if (endDate) {
      query = query.lte("transaction_date", endDate);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("Error fetching tag analytics:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const transactions = rows || [];

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

    const mainTotals: Totals = {
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };

    const perTag: Record<
      string,
      Totals & { id: string; name: string; color: string | null; exclude_from_analytics: boolean }
    > = {};

    for (const tx of transactions as any[]) {
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

      const tags =
        (tx.transaction_tag_assignments || [])
          .map((tta: any) => tta.tag)
          .filter(Boolean) || [];

      const hasExcludedTag = tags.some((t: any) => t.exclude_from_analytics);

      if (!hasExcludedTag) {
        mainTotals.count += 1;
        mainTotals.net += amount;
        if (isIncome) {
          mainTotals.income += absAmount;
        } else {
          mainTotals.expense += absAmount;
        }
      }

      for (const tag of tags) {
        if (!perTag[tag.id]) {
          perTag[tag.id] = {
            id: tag.id,
            name: tag.name,
            color: tag.color || null,
            exclude_from_analytics: !!tag.exclude_from_analytics,
            income: 0,
            expense: 0,
            net: 0,
            count: 0,
          };
        }

        const bucket = perTag[tag.id];
        bucket.count += 1;
        bucket.net += amount;
        if (isIncome) {
          bucket.income += absAmount;
        } else {
          bucket.expense += absAmount;
        }
      }
    }

    const tags = Object.values(perTag).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({
      allTotals,
      mainTotals,
      tags,
    });
  } catch (error: any) {
    console.error("Unexpected error in GET /api/analytics/tags:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

