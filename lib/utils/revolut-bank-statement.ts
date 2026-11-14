import * as XLSX from "xlsx";

const HEADERS = [
  "Type", "Product", "Started Date", "Completed Date", "Description",
  "Amount", "Fee", "Currency", "State", "Balance",
];

export interface RevolutMovement {
  description: string;
  transaction_date: string;
  amount: string; // Decimal string for PostgreSQL NUMERIC(15,2), not JS float.
}

export interface RevolutBankStatement {
  currency: string;
  openingBalance: string;
  closingBalance: string;
  netMovement: string;
  feeRows: number;
  movements: RevolutMovement[];
  lastDate: string;
}

function cents(value: string, label: string, row: number): bigint {
  const cleaned = value.trim();
  if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid ${label} in statement row ${row}`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace(/^-/, "").split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
}

function decimal(value: bigint): string {
  const positive = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${positive / 100n}.${String(positive % 100n).padStart(2, "0")}`;
}

function completedDate(value: string, row: number): string {
  const match = /^(\d{4}-\d\d-\d\d) \d\d:\d\d:\d\d$/.exec(value.trim());
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ||
      new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) {
    throw new Error(`Invalid completion date in statement row ${row}`);
  }
  return match[1];
}

// Server-only parser. Running balances are checked in the bank's export order;
// no transaction, account balance or file is changed by this function.
export function parseRevolutBankStatement(csv: string): RevolutBankStatement {
  if (!csv || Buffer.byteLength(csv, "utf8") > 10 * 1024 * 1024) {
    throw new Error("Statement is empty or too large");
  }
  const workbook = XLSX.read(Buffer.from(csv, "utf8"), { type: "buffer", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Statement has no rows");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (rows.length < 2 || rows.length > 5001) throw new Error("Statement row count unsupported");
  const header = rows[0].map(value => String(value).replace(/^\uFEFF/, "").trim());
  if (header.length !== HEADERS.length || !HEADERS.every((name, index) => header[index] === name)) {
    throw new Error("Expected a Revolut Current-account CSV with Amount, Fee and Balance columns");
  }

  let previousBalance: bigint | null = null;
  let opening: bigint | null = null;
  let total = 0n;
  let feeRows = 0;
  let currency: string | null = null;
  let lastCompleted = "";
  const movements: RevolutMovement[] = [];
  for (const [index, cells] of rows.slice(1).entries()) {
    const row = index + 2;
    const [type, product, , completed, description, amount, fee, code, state, balance] = cells.map(value => String(value).trim());
    if (String(type).trim() === "" || product !== "Current" || state !== "COMPLETED") {
      throw new Error(`Unsupported product, state or type in statement row ${row}`);
    }
    if (!/^[A-Z]{3}$/.test(code) || (currency && code !== currency)) {
      throw new Error(`Mixed or invalid currency in statement row ${row}`);
    }
    currency = code;
    const completedTimestamp = String(completed).trim();
    const date = completedDate(completedTimestamp, row);
    if (lastCompleted && completedTimestamp < lastCompleted) {
      throw new Error(`Statement is not ordered by completion date at row ${row}`);
    }
    lastCompleted = completedTimestamp;
    if (!description) throw new Error(`Missing description in statement row ${row}`);
    const movement = cents(amount, "Amount", row);
    const charge = cents(fee, "Fee", row);
    if (charge < 0n) throw new Error(`Negative fee in statement row ${row}`);
    const net = movement - charge;
    if (net === 0n) throw new Error(`Zero net movement in statement row ${row}`);
    if (charge !== 0n) feeRows++;
    const current = cents(balance, "Balance", row);
    if (previousBalance === null) opening = current - net;
    else if (previousBalance + net !== current) {
      throw new Error(`Running balance does not reconcile at statement row ${row}`);
    }
    previousBalance = current;
    total += net;
    movements.push({ description, transaction_date: date, amount: decimal(net) });
  }
  if (opening === null || previousBalance === null || !currency || opening + total !== previousBalance) {
    throw new Error("Statement opening and closing balances do not reconcile");
  }
  return {
    currency, openingBalance: decimal(opening), closingBalance: decimal(previousBalance),
    netMovement: decimal(total), feeRows, movements,
    lastDate: movements[movements.length - 1].transaction_date,
  };
}
