import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

const AMOUNT_TOLERANCE = 0.01;

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

  const { transaction_id, other_transaction_id } = await request.json();

  if (!transaction_id || !other_transaction_id) {
    return NextResponse.json(
      { error: "transaction_id and other_transaction_id are required" },
      { status: 400 }
    );
  }

  if (transaction_id === other_transaction_id) {
    return NextResponse.json(
      { error: "Cannot link a transaction to itself" },
      { status: 400 }
    );
  }

  const { data: txA, error: errA } = await supabase
    .from("transactions")
    .select("id, workspace_id, payment_method_id, amount, transaction_type, transfer_from_id, transfer_to_id")
    .eq("id", transaction_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: txB, error: errB } = await supabase
    .from("transactions")
    .select("id, workspace_id, payment_method_id, amount, transaction_type, transfer_from_id, transfer_to_id")
    .eq("id", other_transaction_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (errA || errB) {
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }

  if (!txA || !txB) {
    return NextResponse.json(
      { error: "One or both transactions not found" },
      { status: 404 }
    );
  }

  if (txA.payment_method_id === txB.payment_method_id) {
    return NextResponse.json(
      { error: "Both transactions must be in different accounts" },
      { status: 400 }
    );
  }

  if (txA.transaction_type === "transfer" || txB.transaction_type === "transfer") {
    return NextResponse.json(
      { error: "One or both transactions are already transfers. Unlink them first if you need to change the match." },
      { status: 400 }
    );
  }

  const absA = Math.abs(txA.amount);
  const absB = Math.abs(txB.amount);
  if (Math.abs(absA - absB) > AMOUNT_TOLERANCE) {
    return NextResponse.json(
      { error: "Amounts must match (opposite signs, same absolute value). This transaction and the matching one must be +X and -X." },
      { status: 400 }
    );
  }

  const sameSign = (txA.amount >= 0 && txB.amount >= 0) || (txA.amount < 0 && txB.amount < 0);
  if (sameSign) {
    return NextResponse.json(
      { error: "One transaction must be positive and one negative (e.g. +10 and -10)." },
      { status: 400 }
    );
  }

  const fromId = txA.amount < 0 ? txA.payment_method_id : txB.payment_method_id;
  const toId = txA.amount >= 0 ? txA.payment_method_id : txB.payment_method_id;

  const update = {
    transaction_type: "transfer" as const,
    transfer_from_id: fromId,
    transfer_to_id: toId,
  };

  const { error: updateA } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", transaction_id)
    .eq("workspace_id", workspaceId);

  const { error: updateB } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", other_transaction_id)
    .eq("workspace_id", workspaceId);

  if (updateA || updateB) {
    return NextResponse.json(
      { error: "Failed to update one or both transactions" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    transfer_from_id: fromId,
    transfer_to_id: toId,
  });
}
