import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function POST(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { amount, transaction_date, payment_method_id, exclude_transaction_id } =
    await request.json();

  if (!amount || !transaction_date || !payment_method_id) {
    return NextResponse.json(
      { error: "Amount, transaction date, and payment method ID are required" },
      { status: 400 }
    );
  }

  // Call the duplicate detection function
  const { data: duplicates, error } = await supabase.rpc("find_duplicate_transactions", {
    workspace_id_param: workspaceId,
    amount_param: parseFloat(amount),
    transaction_date_param: transaction_date,
    payment_method_id_param: payment_method_id,
    exclude_transaction_id: exclude_transaction_id || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ duplicates: duplicates || [] });
}
