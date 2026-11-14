import test from "node:test";
import assert from "node:assert/strict";
import { parseRevolutBankStatement } from "../lib/utils/revolut-bank-statement";

const header = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";
const rows = [
  'Transfer,Current,2026-01-01 08:00:00,2026-01-01 08:00:01,"Deposit, sample",40.00,0.00,EUR,COMPLETED,65.00',
  "Charge,Current,2026-01-02 08:00:00,2026-01-02 08:00:00,Plan fee,0.00,5.99,EUR,COMPLETED,59.01",
  "Card Payment,Current,2026-01-03 08:00:00,2026-01-03 08:00:01,Synthetic purchase,-9.01,0.00,EUR,COMPLETED,50.00",
];
const statement = (entries = rows) => `${header}\n${entries.join("\n")}\n`;

test("opening is first post-movement balance minus net; fee-only rows are imported exactly", () => {
  const parsed = parseRevolutBankStatement(statement());
  assert.equal(parsed.openingBalance, "25.00");
  assert.equal(parsed.closingBalance, "50.00");
  assert.equal(parsed.netMovement, "25.00");
  assert.equal(parsed.currency, "EUR");
  assert.equal(parsed.movements.length, 3);
  assert.equal(parsed.feeRows, 1);
  assert.equal(parsed.movements[0].description, "Deposit, sample");
  assert.equal(parsed.movements[1].amount, "-5.99");
  assert.equal(parsed.lastDate, "2026-01-03");
});

test("fees are subtracted from nonzero amounts; invalid balance or incomplete rows fail closed", () => {
  const withFee = rows[0].replace("40.00,0.00,EUR,COMPLETED,65.00", "40.00,1.00,EUR,COMPLETED,64.00");
  const following = rows[1].replace("59.01", "58.01");
  const final = rows[2].replace("50.00", "49.00");
  assert.equal(parseRevolutBankStatement(statement([withFee, following, final])).movements[0].amount, "39.00");
  assert.throws(() => parseRevolutBankStatement(statement([rows[0], rows[1].replace("59.01", "59.02"), rows[2]])), /does not reconcile/);
  assert.throws(() => parseRevolutBankStatement(statement([rows[0], rows[1].replace("COMPLETED", "PENDING")])), /Unsupported/);
  assert.throws(() => parseRevolutBankStatement(statement([rows[0], rows[1].replace("EUR", "USD")])), /Mixed/);
  assert.throws(() => parseRevolutBankStatement(statement([rows[1], rows[0]])), /not ordered/);
});

test("unrecognized statement shape cannot silently use the general amount-only importer", () => {
  assert.throws(() => parseRevolutBankStatement("Date,Description,Amount,Balance\n2026-01-01,Test,10,10"), /Revolut Current-account/);
});
