"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

interface DashboardOverviewProps {
  workspaceId: string | null;
}

interface DashboardSummary {
  primaryCurrency: string;
  mtd: { start: string; end: string; income: number; expense: number; net: number };
  netWorth: { assets: number; liabilities: number; total: number };
  monthlySubscriptions: number;
  activeSubscriptionCount: number;
  paymentMethods: Array<{ id: string; name: string; type: string; current_balance: number }>;
  recentTransactions: Array<{
    id: string;
    amount: number;
    description: string | null;
    transaction_date: string;
  }>;
}

export default function DashboardOverview({ workspaceId }: DashboardOverviewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/dashboard/summary");
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!workspaceId) {
    return (
      <p className="text-gray-500 text-center py-8">
        No workspace found. Create one in Settings.
      </p>
    );
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!summary) {
    return <div className="text-center py-8 text-gray-500">Failed to load dashboard</div>;
  }

  const { primaryCurrency, mtd, netWorth, monthlySubscriptions, activeSubscriptionCount } =
    summary;
  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">{monthLabel} overview</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-600 mb-1">Net Worth</h2>
          <p className="text-3xl font-bold text-gray-900">
            {formatCurrency(netWorth.total, primaryCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Assets {formatCurrency(netWorth.assets, primaryCurrency)} · Debt{" "}
            {formatCurrency(netWorth.liabilities, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-600 mb-1">Income (MTD)</h2>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(mtd.income, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-600 mb-1">Expenses (MTD)</h2>
          <p className="text-3xl font-bold text-red-600">
            {formatCurrency(mtd.expense, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-600 mb-1">Subscriptions</h2>
          <p className="text-3xl font-bold text-purple-700">
            {formatCurrency(monthlySubscriptions, primaryCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {activeSubscriptionCount} active ·{" "}
            <Link href="/subscriptions" className="text-blue-600 hover:text-blue-500">
              Manage
            </Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Accounts</h2>
            <Link href="/accounts" className="text-sm text-blue-600 hover:text-blue-500">
              View All
            </Link>
          </div>
          {summary.paymentMethods.length === 0 ? (
            <p className="text-gray-500 text-sm">No accounts yet</p>
          ) : (
            <div className="space-y-2">
              {summary.paymentMethods.slice(0, 5).map((pm) => (
                <div key={pm.id} className="flex justify-between items-center">
                  <span className="text-sm text-gray-900">{pm.name}</span>
                  <span
                    className={`text-sm font-medium ${
                      pm.type === "credit_card" && pm.current_balance < 0
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {formatCurrency(pm.current_balance, primaryCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
            <Link href="/transactions" className="text-sm text-blue-600 hover:text-blue-500">
              View All
            </Link>
          </div>
          {summary.recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {summary.recentTransactions.map((t) => (
                <div key={t.id} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-900">
                      {t.description || "No description"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(t.transaction_date).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      t.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(t.amount, primaryCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
