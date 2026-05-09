import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { clusterDuplicateTransactions } from "@/lib/utils/duplicate-groups";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const crossAccount = searchParams.get("cross_account") === "true";
  const rawWindow = parseInt(searchParams.get("day_window") || "2", 10);
  const dayWindow = rawWindow === 1 ? 1 : 2;

  const { data: rows, error } = await supabase
    .from("transactions")
    .select(
      "id, amount, transaction_date, payment_method_id, description, category, merchant, category_id, merchant_id, transaction_type"
    )
    .eq("workspace_id", workspaceId)
    .is("duplicate_of", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    amount: Number(r.amount),
    transaction_date: String(r.transaction_date).slice(0, 10),
    payment_method_id: r.payment_method_id as string,
    description: (r.description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    merchant: (r.merchant as string | null) ?? null,
    category_id: (r.category_id as string | null) ?? null,
    merchant_id: (r.merchant_id as string | null) ?? null,
    transaction_type: (r.transaction_type as string | null) ?? null,
  }));

  const clusters = clusterDuplicateTransactions(list, { crossAccount, dayWindow });

  const pmIds = [...new Set(list.map((r) => r.payment_method_id).filter(Boolean))];
  let pmName = new Map<string, string>();
  if (pmIds.length > 0) {
    const { data: pms } = await supabase
      .from("payment_methods")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", pmIds);
    pmName = new Map((pms || []).map((p: { id: string; name: string }) => [p.id, p.name]));
  }

  const groups = clusters.map((cluster) =>
    cluster.map((t) => ({
      ...t,
      payment_method_name: pmName.get(t.payment_method_id) || "Account",
    }))
  );

  return NextResponse.json({
    groups,
    cross_account: crossAccount,
    day_window: dayWindow,
    scanned_count: list.length,
  });
}
