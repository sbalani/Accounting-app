import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseXLSXToArray, getXLSXPreview, parseXLSXWithConfig } from "../lib/utils/csv-parser";

for (const format of ["biff8", "xlsx"] as const) {
  test(`${format}: first sheet, Excel date, empty cell, numeric amount and column mapping`, () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Blank", "Amount"],
      [new Date("2024-06-15T00:00:00Z"), "Synthetic shop", null, -12.34],
      [new Date("2024-06-16T00:00:00Z"), "Synthetic salary", "", 1000.5],
    ], { cellDates: true });
    sheet.D3.z = "#,##0.00";
    XLSX.utils.book_append_sheet(book, sheet, "First");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Wrong", "Sheet"]]), "Second");
    const data = XLSX.write(book, { type: "array", bookType: format }) as ArrayBuffer;
    const rows = parseXLSXToArray(data);
    assert.equal(rows[0][0], "Date");
    assert.equal(rows[1][0], "2024-06-15");
    assert.equal(rows[1][2], "");
    assert.equal(rows[1][3], "-12.34");
    assert.equal(rows[2][3], "1000.5"); // Display format must not alter exact numeric input.
    assert.deepEqual(getXLSXPreview(data, 1), [rows[0]]);
    const transactions = parseXLSXWithConfig(data, {
      headerRow: 0, amountFormat: "unified", numberFormat: "us",
      columnMapping: { date: 0, description: 1, amount: 3, debit: null, credit: null, merchant: null, category: null },
    });
    assert.deepEqual(transactions.map(({ amount, transaction_date }) => ({ amount, transaction_date })), [
      { amount: -12.34, transaction_date: "2024-06-15" },
      { amount: 1000.5, transaction_date: "2024-06-16" },
    ]);
  });
}
