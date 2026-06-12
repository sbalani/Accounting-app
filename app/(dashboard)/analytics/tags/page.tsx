"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

interface TagSummary {
  id: string;
  name: string;
  color?: string | null;
  exclude_from_analytics: boolean;
  income: number;
  expense: number;
  net: number;
  count: number;
}

interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export default function TagAnalyticsPage() {
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [allTotals, setAllTotals] = useState<Totals | null>(null);
  const [mainTotals, setMainTotals] = useState<Totals | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366F1");
  const [newTagExclude, setNewTagExclude] = useState(false);

  const fetchPrimaryCurrency = async () => {
    try {
      const response = await fetch("/api/workspaces/current");
      if (response.ok) {
        const data = await response.json();
        if (data.workspace?.primary_currency) {
          setPrimaryCurrency(data.workspace.primary_currency);
        }
      }
    } catch {
      // Ignore, fall back to default
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const response = await fetch(`/api/analytics/tags?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load tag analytics");
      }
      const data = await response.json();
      setTags(data.tags || []);
      setAllTotals(data.allTotals || null);
      setMainTotals(data.mainTotals || null);
    } catch (err: any) {
      setError(err.message || "Failed to load tag analytics");
    } finally {
      setLoading(false);
    }
  };

  const fetchAll = async () => {
    await Promise.all([fetchPrimaryCurrency(), fetchAnalytics()]);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    setError(null);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
          exclude_from_analytics: newTagExclude,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create tag");
      }
      const data = await response.json();
      const tag = data.tag;
      setTags((prev) => [
        {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          exclude_from_analytics: !!tag.exclude_from_analytics,
          income: 0,
          expense: 0,
          net: 0,
          count: 0,
        },
        ...prev,
      ]);
      setNewTagName("");
      setNewTagExclude(false);
    } catch (err: any) {
      setError(err.message || "Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  };

  const toggleExclude = async (tag: TagSummary) => {
    try {
      const response = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exclude_from_analytics: !tag.exclude_from_analytics,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update tag");
      }
      setTags((prev) =>
        prev.map((t) =>
          t.id === tag.id
            ? { ...t, exclude_from_analytics: !t.exclude_from_analytics }
            : t
        )
      );
      // Refresh analytics so mainTotals reflect exclusion
      fetchAnalytics();
    } catch (err: any) {
      setError(err.message || "Failed to update tag");
    }
  };

  const formatAmount = (value: number) =>
    formatCurrency(value, primaryCurrency);

  return (
    <div className="max-w-5xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Tag Analytics
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Create tags to group transactions, and optionally exclude
              extraordinary items from your main analytics.
            </p>
          </div>
          <Link
            href="/settings"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            ← Back to Settings
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Date Range
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
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
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={fetchAnalytics}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto"
                disabled={loading}
              >
                {loading ? "Loading..." : "Update"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">
              Total Income (all)
            </p>
            <p className="text-2xl font-bold text-green-700">
              {formatAmount(allTotals?.income || 0)}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">
              Total Expenses (all)
            </p>
            <p className="text-2xl font-bold text-red-700">
              {formatAmount(allTotals?.expense || 0)}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">
              Net (excluding tags marked as excluded)
            </p>
            <p
              className={`text-2xl font-bold ${
                (mainTotals?.net || 0) >= 0
                  ? "text-green-700"
                  : "text-red-700"
              }`}
            >
              {formatAmount(mainTotals?.net || 0)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white shadow rounded-lg p-6 space-y-4 md:col-span-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Manage Tags
            </h2>
            <form onSubmit={handleCreateTag} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., One-off, Tax, Reimbursable"
                />
              </div>
              <div className="flex items-center space-x-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="h-9 w-16 p-1 border border-gray-300 rounded-md"
                  />
                </div>
                <label className="flex items-center space-x-2 mt-5">
                  <input
                    type="checkbox"
                    checked={newTagExclude}
                    onChange={(e) => setNewTagExclude(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-700">
                    Exclude from main analytics
                  </span>
                </label>
              </div>
              <button
                type="submit"
                disabled={creatingTag || !newTagName.trim()}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {creatingTag ? "Creating..." : "Create Tag"}
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Tags can be applied to transactions from the Transactions
              page using the Tags column.
            </p>
          </div>

          <div className="bg-white shadow rounded-lg p-6 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Tag Breakdown
              </h2>
            </div>
            {tags.length === 0 ? (
              <p className="text-sm text-gray-500">
                No tag activity yet. Create a tag and apply it to some
                transactions to see analytics here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tag
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Transactions
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Income
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expenses
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Exclude
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tags.map((tag) => (
                      <tr key={tag.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: tag.color || "#6366F1",
                              }}
                            />
                            <span>{tag.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500">
                          {tag.count}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-700">
                          {formatAmount(tag.income)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-red-700">
                          {formatAmount(tag.expense)}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm text-right ${
                            tag.net >= 0 ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {formatAmount(tag.net)}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <button
                            type="button"
                            onClick={() => toggleExclude(tag)}
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                              tag.exclude_from_analytics
                                ? "bg-gray-800 text-white border-gray-800"
                                : "bg-gray-100 text-gray-700 border-gray-300"
                            }`}
                          >
                            {tag.exclude_from_analytics
                              ? "Excluded"
                              : "Included"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

