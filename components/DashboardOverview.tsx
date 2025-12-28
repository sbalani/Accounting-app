"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardOverviewProps {
  workspaceId: string | null;
}

export default function DashboardOverview({ workspaceId }: DashboardOverviewProps) {
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceId) {
      fetchData();
    }
  }, [workspaceId]);

  const fetchData = async () => {
    try {
      const [paymentMethodsRes, transactionsRes] = await Promise.all([
        fetch("/api/payment-methods"),
        fetch("/api/transactions?limit=5"),
      ]);

      if (paymentMethodsRes.ok) {
        const data = await paymentMethodsRes.json();
        setPaymentMethods(data.paymentMethods || []);
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const totalBalance = paymentMethods.reduce((sum, pm) => sum + pm.current_balance, 0);
  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-600 mb-2">Total Balance</h2>
          <p className="text-3xl font-bold text-gray-900">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(totalBalance)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-600 mb-2">Total Income</h2>
          <p className="text-3xl font-bold text-green-600">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(totalIncome)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-600 mb-2">Total Expenses</h2>
          <p className="text-3xl font-bold text-red-600">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(totalExpenses)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Payment Methods</h2>
            <Link
              href="/accounts"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              View All
            </Link>
          </div>
          {paymentMethods.length === 0 ? (
            <p className="text-gray-500 text-sm">No payment methods yet</p>
          ) : (
            <div className="space-y-2">
              {paymentMethods.slice(0, 5).map((pm) => (
                <div key={pm.id} className="flex justify-between items-center">
                  <span className="text-sm text-gray-900">{pm.name}</span>
                  <span
                    className={`text-sm font-medium ${
                      pm.type === "credit_card" && pm.current_balance < 0
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(pm.current_balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
            <Link
              href="/transactions"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              View All
            </Link>
          </div>
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
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
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(t.amount)}
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
