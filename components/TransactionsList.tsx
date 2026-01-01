"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";
import { getDatePresetRange, getDatePresetLabel, type DatePreset } from "@/lib/utils/date-presets";
import AutocompleteDropdown from "./AutocompleteDropdown";

interface Transaction {
  id: string;
  amount: number;
  description: string | null;
  category: string | null;
  category_id: string | null;
  merchant: string | null;
  merchant_id: string | null;
  transaction_date: string;
  source: string;
  transaction_type?: "income" | "expense" | "transfer";
  payment_methods: {
    name: string;
    type: string;
    currency?: string;
  };
}

interface Category {
  id: string;
  name: string;
  color?: string;
  is_default?: boolean;
}

interface Merchant {
  id: string;
  name: string;
  is_default?: boolean;
}

export default function TransactionsList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [transactionType, setTransactionType] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [categories, setCategories] = useState<Category[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [updatingTransaction, setUpdatingTransaction] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
      }
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

  const fetchMerchants = useCallback(async () => {
    try {
      const response = await fetch("/api/merchants");
      if (response.ok) {
        const data = await response.json();
        setMerchants(data.merchants || []);
      }
    } catch (err) {
      console.error("Error fetching merchants:", err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (filterPaymentMethod) {
        params.append("payment_method_id", filterPaymentMethod);
      }
      
      if (transactionType) {
        params.append("transaction_type", transactionType);
      }
      
      // Handle date range
      let finalStartDate = startDate;
      let finalEndDate = endDate;
      
      if (datePreset && datePreset !== "custom") {
        const range = getDatePresetRange(datePreset);
        finalStartDate = range.startDate;
        finalEndDate = range.endDate;
      }
      
      if (finalStartDate) {
        params.append("start_date", finalStartDate);
      }
      
      if (finalEndDate) {
        params.append("end_date", finalEndDate);
      }

      const url = `/api/transactions?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
      setPrimaryCurrency(data.primaryCurrency || "USD");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterPaymentMethod, datePreset, startDate, endDate, transactionType]);

  useEffect(() => {
    fetchPaymentMethods();
    fetchCategories();
    fetchMerchants();
  }, [fetchPaymentMethods, fetchCategories, fetchMerchants]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Update date inputs when preset changes
  useEffect(() => {
    if (datePreset && datePreset !== "custom") {
      const range = getDatePresetRange(datePreset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, [datePreset]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
      return;
    }

    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete transaction");
      }

      setTransactions(transactions.filter((t) => t.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCategoryChange = async (transactionId: string, categoryId: string | null) => {
    setUpdatingTransaction(transactionId);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category_id: categoryId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update category");
      }

      const data = await response.json();
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, category_id: categoryId, category: data.transaction.category || null }
            : t
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingTransaction(null);
    }
  };

  const handleMerchantChange = async (transactionId: string, merchantId: string | null) => {
    setUpdatingTransaction(transactionId);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ merchant_id: merchantId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update merchant");
      }

      const data = await response.json();
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, merchant_id: merchantId, merchant: data.transaction.merchant || null }
            : t
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingTransaction(null);
    }
  };

  const handleCreateCategory = async (name: string): Promise<Category | null> => {
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to create category");
      }

      const data = await response.json();
      const newCategory = data.category;
      setCategories((prev) => [...prev, newCategory]);
      return newCategory;
    } catch (err) {
      console.error("Error creating category:", err);
      return null;
    }
  };

  const handleCreateMerchant = async (name: string): Promise<Merchant | null> => {
    try {
      const response = await fetch("/api/merchants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to create merchant");
      }

      const data = await response.json();
      const newMerchant = data.merchant;
      setMerchants((prev) => [...prev, newMerchant]);
      return newMerchant;
    } catch (err) {
      console.error("Error creating merchant:", err);
      return null;
    }
  };


  if (loading) {
    return <div className="text-center py-8">Loading transactions...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account
              </label>
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All Accounts</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Range
              </label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset | "")}
                className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week_to_date">Week to Date</option>
                <option value="last_week">Last Week</option>
                <option value="month_to_date">Month to Date</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expenses</option>
                <option value="transfer">Transfers</option>
              </select>
            </div>
          </div>

          {datePreset === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total Income</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalIncome, primaryCurrency)}</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalExpenses, primaryCurrency)}</p>
          </div>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">No transactions found.</p>
          <Link
            href="/transactions/new"
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Create your first transaction
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Merchant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {transaction.description || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <AutocompleteDropdown
                      items={categories}
                      value={transaction.category_id}
                      onChange={(categoryId) => handleCategoryChange(transaction.id, categoryId)}
                      onCreateNew={handleCreateCategory}
                      placeholder="Select category..."
                      className="min-w-[150px]"
                      disabled={updatingTransaction === transaction.id}
                    />
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <AutocompleteDropdown
                      items={merchants}
                      value={transaction.merchant_id}
                      onChange={(merchantId) => handleMerchantChange(transaction.id, merchantId)}
                      onCreateNew={handleCreateMerchant}
                      placeholder="Select merchant..."
                      className="min-w-[150px]"
                      disabled={updatingTransaction === transaction.id}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {transaction.payment_methods?.name || "-"}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(transaction.amount, primaryCurrency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link
                      href={`/transactions/${transaction.id}`}
                      className="text-blue-600 hover:text-blue-500 mr-4"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className="text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
