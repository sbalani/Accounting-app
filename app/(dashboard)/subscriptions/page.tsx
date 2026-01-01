"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

interface Subscription {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  payment_method_id: string;
  merchant_id: string | null;
  category_id: string | null;
  is_active: boolean;
  total_expense?: number;
  transaction_count?: number;
  payment_methods?: {
    name: string;
    type: string;
    currency?: string;
  };
  merchants?: {
    id: string;
    name: string;
  };
  transaction_categories?: {
    id: string;
    name: string;
    color?: string;
  };
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions");
      if (!response.ok) {
        throw new Error("Failed to fetch subscriptions");
      }
      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update subscription");
      }

      setSubscriptions((prev) =>
        prev.map((sub) =>
          sub.id === id ? { ...sub, is_active: !currentStatus } : sub
        )
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subscription? This will unlink it from all transactions.")) {
      return;
    }

    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete subscription");
      }

      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="text-center py-8">Loading subscriptions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  const activeSubscriptions = subscriptions.filter((s) => s.is_active);
  const totalMonthlyCost = activeSubscriptions.reduce((sum, s) => sum + Math.abs(s.amount), 0);
  const totalYearlyCost = totalMonthlyCost * 12;

  // Calculate next billing dates
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const getNextBillingDate = (dueDay: number): Date => {
    let nextDate = new Date(currentYear, currentMonth, dueDay);
    if (nextDate < today) {
      nextDate = new Date(currentYear, currentMonth + 1, dueDay);
    }
    return nextDate;
  };

  // Sort subscriptions by next billing date
  const subscriptionsWithDates = subscriptions.map((sub) => ({
    ...sub,
    nextBillingDate: getNextBillingDate(sub.due_day),
  }));

  subscriptionsWithDates.sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return a.nextBillingDate.getTime() - b.nextBillingDate.getTime();
  });

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subscriptions</h1>
              <p className="mt-2 text-sm text-gray-600">
                Track and manage your recurring subscriptions
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-1">Total Active Subscriptions</p>
            <p className="text-2xl font-bold text-gray-900">{activeSubscriptions.length}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-1">Monthly Cost</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalMonthlyCost, primaryCurrency)}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-1">Yearly Cost</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalYearlyCost, primaryCurrency)}</p>
          </div>
        </div>

        {/* Subscriptions List */}
        {subscriptions.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">No subscriptions found.</p>
            <p className="text-sm text-gray-500">
              Mark a transaction as a subscription from the{" "}
              <Link href="/transactions" className="text-blue-600 hover:text-blue-500 font-medium">
                Transactions page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monthly Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Spent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Day
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Billing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Merchant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {subscriptionsWithDates.map((subscription) => {
                  const daysUntil = Math.ceil(
                    (subscription.nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUpcoming = daysUntil <= 7 && subscription.is_active;

                  return (
                    <tr key={subscription.id} className={isUpcoming ? "bg-yellow-50" : ""}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{subscription.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                        {formatCurrency(Math.abs(subscription.amount), primaryCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(subscription.total_expense || 0, primaryCurrency)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {subscription.transaction_count || 0} {subscription.transaction_count === 1 ? "payment" : "payments"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.due_day}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          {subscription.nextBillingDate.toLocaleDateString()}
                          {isUpcoming && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {daysUntil} {daysUntil === 1 ? "day" : "days"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.payment_methods?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.merchants?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.transaction_categories?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            subscription.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {subscription.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleActive(subscription.id, subscription.is_active)}
                            className={`${
                              subscription.is_active
                                ? "text-gray-600 hover:text-gray-900"
                                : "text-green-600 hover:text-green-900"
                            }`}
                          >
                            {subscription.is_active ? "Pause" : "Activate"}
                          </button>
                          <button
                            onClick={() => handleDelete(subscription.id)}
                            className="text-red-600 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

