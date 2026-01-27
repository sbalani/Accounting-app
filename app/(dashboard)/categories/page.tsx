"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getDatePresetRange,
  getDatePresetLabel,
  type DatePreset,
} from "@/lib/utils/date-presets";
import { formatCurrency } from "@/lib/utils/currency";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface Category {
  id: string;
  name: string;
  color: string | null;
  is_default: boolean;
  workspace_id: string | null;
}

interface CategoryBalance {
  id: string;
  name: string;
  color: string | null;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<CategoryBalance[]>([]);
  const [allTotals, setAllTotals] = useState<{
    income: number;
    expense: number;
    net: number;
    count: number;
  } | null>(null);
  const mtd = getDatePresetRange("month_to_date");
  const [startDate, setStartDate] = useState(mtd.startDate);
  const [endDate, setEndDate] = useState(mtd.endDate);
  const [datePreset, setDatePreset] = useState<DatePreset | "">("month_to_date");
  const [primaryCurrency, setPrimaryCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#95A5A6");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const r = await fetch("/api/categories");
      if (!r.ok) throw new Error("Failed to fetch categories");
      const d = await r.json();
      setCategories(d.categories || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const r = await fetch(`/api/analytics/categories?${params}`);
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Failed to fetch analytics");
      }
      const d = await r.json();
      setBalances(d.categories || []);
      setAllTotals(d.allTotals || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchPrimaryCurrency = useCallback(async () => {
    try {
      const r = await fetch("/api/payment-methods");
      if (r.ok) {
        const d = await r.json();
        if (d.primaryCurrency) setPrimaryCurrency(d.primaryCurrency);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchPrimaryCurrency();
  }, [fetchCategories, fetchPrimaryCurrency]);

  useEffect(() => {
    if (datePreset && datePreset !== "custom") {
      const range = getDatePresetRange(datePreset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, [datePreset]);

  useEffect(() => {
    if (datePreset === "custom" && !startDate && !endDate) return;
    if (datePreset !== "custom" && !startDate) return;
    fetchAnalytics();
  }, [startDate, endDate, datePreset, fetchAnalytics]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to create");
      setCategories((prev) => [...prev, d.category]);
      setNewName("");
      setNewColor("#95A5A6");
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color || "#95A5A6");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/categories/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to update");
      setCategories((prev) =>
        prev.map((x) => (x.id === editingId ? d.category : x))
      );
      setBalances((prev) =>
        prev.map((x) =>
          x.id === editingId
            ? { ...x, name: d.category.name, color: d.category.color }
            : x
        )
      );
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category? Transactions will become uncategorized."))
      return;
    setError(null);
    try {
      const r = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to delete");
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setBalances((prev) => prev.filter((b) => b.id !== id));
      if (editingId === id) setEditingId(null);
      fetchAnalytics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const formatAmount = (n: number) => formatCurrency(n, primaryCurrency);

  const canEdit = (c: Category) => !c.is_default && c.workspace_id != null;

  const pieData = balances
    .filter((b) => b.expense > 0)
    .map((b) => ({
      name: b.name,
      value: b.expense,
      color: b.color || "#95A5A6",
    }));

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage categories and view spending by category. Create categories
              here or on the fly when adding transactions.
            </p>
          </div>
          <Link
            href="/transactions"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            ← Back to Transactions
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Time period</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preset
              </label>
              <select
                value={datePreset}
                onChange={(e) =>
                  setDatePreset((e.target.value || "") as DatePreset | "")
                }
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="month_to_date">Month to date</option>
                <option value="last_month">Last month</option>
                <option value="week_to_date">Week to date</option>
                <option value="last_week">Last week</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            {datePreset === "custom" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </>
            )}
            <div>
              <button
                type="button"
                onClick={() => fetchAnalytics()}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Loading…" : "Update"}
              </button>
            </div>
          </div>
          {datePreset && datePreset !== "custom" && (
            <p className="text-sm text-gray-500">
              {getDatePresetLabel(datePreset)}: {startDate}
              {endDate && endDate !== startDate ? ` – ${endDate}` : ""}
            </p>
          )}
        </div>

        {allTotals != null && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Income</p>
              <p className="text-xl font-bold text-green-700">
                {formatAmount(allTotals.income)}
              </p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Expenses</p>
              <p className="text-xl font-bold text-red-700">
                {formatAmount(allTotals.expense)}
              </p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Net</p>
              <p
                className={`text-xl font-bold ${
                  allTotals.net >= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {formatAmount(allTotals.net)}
              </p>
            </div>
          </div>
        )}

        {pieData.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Expense breakdown
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => typeof value === 'number' ? formatAmount(value) : ''}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              Category balances
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              + Add category
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleCreate}
              className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-end gap-3"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Food & Dining"
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setNewName("");
                    setNewColor("#95A5A6");
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Income
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expenses
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : (
                  <>
                    {balances.length === 0 && !loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No transactions in this period. Adjust the time range or
                          add transactions.
                        </td>
                      </tr>
                    ) : (
                      balances.map((b) => {
                        const cat = categories.find((c) => c.id === b.id);
                        const isEditing = editingId === b.id;
                        return (
                          <tr key={b.id}>
                            <td className="px-4 py-3">
                              {isEditing && cat && canEdit(cat) ? (
                                <form
                                  onSubmit={handleUpdate}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm w-40"
                                    required
                                  />
                                  <input
                                    type="color"
                                    value={editColor}
                                    onChange={(e) => setEditColor(e.target.value)}
                                    className="h-8 w-10 rounded border cursor-pointer"
                                  />
                                  <button
                                    type="submit"
                                    disabled={saving}
                                    className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="text-sm text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <span className="flex items-center gap-2">
                                  {b.color && (
                                    <span
                                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: b.color }}
                                    />
                                  )}
                                  {b.name}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums text-green-700">
                              {formatAmount(b.income)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums text-red-700">
                              {formatAmount(b.expense)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right text-sm tabular-nums font-medium ${
                                b.net >= 0 ? "text-green-700" : "text-red-700"
                              }`}
                            >
                              {formatAmount(b.net)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {b.count}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {cat && canEdit(cat) && !isEditing && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(cat)}
                                    className="text-blue-600 hover:text-blue-700 text-sm mr-3"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(b.id)}
                                    className="text-red-600 hover:text-red-700 text-sm"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            All categories
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Default categories (Food & Dining, etc.) are built-in. You can add
            your own above. Use categories when adding or editing transactions;
            you can also create them on the fly from the category dropdown.
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
              >
                {c.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                {c.name}
                {c.is_default && (
                  <span className="text-xs text-gray-400">(default)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
