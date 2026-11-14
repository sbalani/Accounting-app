import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { parseRevolutBankStatement } from "@/lib/utils/revolut-bank-statement";

export async function POST(request: Request) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized workspace" }, { status: 401 });
  let body: { action?: string; payment_method_id?: string; file_path?: string; digest?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body?.action !== "preview" && body?.action !== "import") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (typeof body.payment_method_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.payment_method_id)) {
    return NextResponse.json({ error: "Invalid bank account" }, { status: 400 });
  }
  const path = typeof body.file_path === "string"
    ? body.file_path.replace(/^statements\//, "") : "";
  const segments = path.split("/");
  if (segments.length !== 4 ||
      !/^[0-9a-f-]{36}$/i.test(segments[0]) ||
      segments[1] !== workspaceId || segments[2] !== "statement" ||
      !/^\d+\.csv$/i.test(segments[3])) {
    return NextResponse.json({ error: "Invalid workspace statement path" }, { status: 400 });
  }

  const { data: account, error: accountError } = await supabase.from("payment_methods")
    .select("id, type, currency, initial_balance, current_balance, last_statement_imported_through")
    .eq("id", body.payment_method_id).eq("workspace_id", workspaceId).maybeSingle();
  const { data: workspace } = await supabase.from("workspaces").select("primary_currency")
    .eq("id", workspaceId).maybeSingle();
  if (accountError || !account || !workspace) {
    return NextResponse.json({ error: "Account not found in workspace" }, { status: 404 });
  }
  if (account.type !== "bank_account" || Number(account.initial_balance) !== 0 ||
      Number(account.current_balance) !== 0 || account.last_statement_imported_through !== null ||
      account.currency !== workspace.primary_currency) {
    return NextResponse.json({ error: "Choose an empty bank account with zero balances and matching workspace currency" }, { status: 409 });
  }
  const { count, error: countError } = await supabase.from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).eq("payment_method_id", account.id);
  if (countError || count !== 0) {
    return NextResponse.json({ error: "Account has transaction history or cannot be verified" }, { status: 409 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from("statements").download(path);
  if (downloadError || !file || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Statement unavailable or too large" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  let statement;
  try {
    statement = parseRevolutBankStatement(bytes.toString("utf8"));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  if (statement.currency !== account.currency) {
    return NextResponse.json({ error: "Statement currency does not match bank account" }, { status: 400 });
  }

  if (body.action === "preview") {
    return NextResponse.json({
      currency: statement.currency, openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance, netMovement: statement.netMovement,
      movements: statement.movements.length, feeRows: statement.feeRows,
      lastDate: statement.lastDate, digest,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (typeof body.digest !== "string" || body.digest !== digest) {
    return NextResponse.json({ error: "Statement changed after preview; preview again" }, { status: 409 });
  }
  // One database transaction: eligibility, opening balance, every movement,
  // statement tracking and final balance all commit or all roll back together.
  const { data: imported, error: importError } = await supabase.rpc("import_revolut_initial_statement", {
    p_workspace_id: workspaceId,
    p_payment_method_id: account.id,
    p_currency: statement.currency,
    p_opening_balance: statement.openingBalance,
    p_expected_closing: statement.closingBalance,
    p_last_date: statement.lastDate,
    p_rows: statement.movements,
  });
  if (importError || imported !== statement.movements.length) {
    console.error("Revolut initial import failed");
    return NextResponse.json({ error: "Initial import could not be completed. Check the account and statement before retrying." }, { status: 409 });
  }
  return NextResponse.json({ imported, closingBalance: statement.closingBalance, currency: statement.currency },
    { headers: { "Cache-Control": "no-store" } });
}
