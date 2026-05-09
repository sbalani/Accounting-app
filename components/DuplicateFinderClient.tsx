"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

type DuplicateTx = {
  id: string;
  amount: number;
  transaction_date: string;
  payment_method_id: string;
  payment_method_name: string;
  description: string | null;
  category: string | null;
  merchant: string | null;
  transaction_type: string | null;
};

type Group = DuplicateTx[];

export default function DuplicateFinderClient() {
  const [crossAccount, setCrossAccount] = useState(false);
  const [dayWindow, setDayWindow] = useState<1 | 2>(2);
  const [groups, setGroups] = useState<Group[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState("USD");
  const [scannedCount, setScannedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cross_account: crossAccount ? "true" : "false",
        day_window: String(dayWindow),
      });
      const res = await fetch(`/api/transactions/duplicate-groups?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }
      setGroups(data.groups || []);
      setScannedCount(data.scanned_count ?? null);
      const pmRes = await fetch("/api/payment-methods");
      if (pmRes.ok) {
        const pmData = await pmRes.json();
        if (pmData.primaryCurrency) {
          setPrimaryCurrency(pmData.primaryCurrency);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setGroups([]);
      setScannedCount(null);
    } finally {
      setLoading(false);
    }
  }, [crossAccount, dayWindow]);

  const removeTransactionFromGroups = (id: string) => {
    setGroups((prev) => {
      const next = prev
        .map((g) => g.filter((t) => t.id !== id))
        .filter((g) => g.length >= 2);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }
      removeTransactionFromGroups(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Finds sets of transactions with the <strong>same amount</strong> (expense and income with the
          same absolute value count as the same) and dates within{" "}
          <strong>{dayWindow} day{dayWindow === 2 ? "s" : ""}</strong> of each other.
        </p>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 items-start sm:items-center">
          <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={crossAccount}
              onChange={(e) => setCrossAccount(e.target.checked)}
              disabled={loading}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Include all accounts (match duplicates across different accounts)</span>
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="dup-day-window" className="text-sm text-gray-700">
              Date proximity
            </label>
            <select
              id="dup-day-window"
              value={dayWindow}
              onChange={(e) => setDayWindow(e.target.value === "1" ? 1 : 2)}
              disabled={loading}
              className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md text-sm"
            >
              <option value={1}>Within 1 day</option>
              <option value={2}>Within 2 days</option>
            </select>
          </div>

          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Scan for duplicates"}
          </button>
        </div>

        {scannedCount != null && !loading && (
          <p className="text-xs text-gray-500">
            Scanned {scannedCount} transaction{scannedCount === 1 ? "" : "s"}.
            {groups.length === 0 ? " No duplicate groups found." : ` Found ${groups.length} group${groups.length === 1 ? "" : "s"}.`}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {groups.length > 0 && (
        <div className="space-y-6">
          {groups.map((group, gi) => (
            <div
              key={`${group.map((t) => t.id).join("-")}-${gi}`}
              className="bg-white shadow rounded-lg overflow-hidden border border-amber-100"
            >
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
                <h2 className="text-sm font-semibold text-amber-900">
                  Possible duplicate set ({group.length} transactions) — same magnitude{" "}
                  {formatCurrency(Math.abs(group[0].amount), primaryCurrency)}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Description
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Category / Merchant
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(`${t.transaction_date}T12:00:00`).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{t.payment_method_name}</td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                            t.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(t.amount, primaryCurrency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">
                          {t.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>{t.category || "—"}</div>
                          {t.merchant && <div className="text-gray-500">{t.merchant}</div>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                          <Link
                            href={`/transactions/${t.id}`}
                            className="text-blue-600 hover:text-blue-500 mr-3"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="text-red-600 hover:text-red-500 disabled:opacity-50"
                          >
                            {deletingId === t.id ? "…" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
