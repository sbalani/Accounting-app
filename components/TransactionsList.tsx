"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";
import { getDatePresetRange, getDatePresetLabel, type DatePreset } from "@/lib/utils/date-presets";
import AutocompleteDropdown from "./AutocompleteDropdown";
import SubscriptionSuggestion from "./SubscriptionSuggestion";

interface Transaction {
  id: string;
  amount: number;
  description: string | null;
  category: string | null;
  category_id: string | null;
  merchant: string | null;
  merchant_id: string | null;
  subscription_id: string | null;
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

interface Tag {
  id: string;
  name: string;
  color?: string | null;
  exclude_from_analytics?: boolean;
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
  const [subscriptionSuggestions, setSubscriptionSuggestions] = useState<Record<string, any>>({});
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [descriptionValue, setDescriptionValue] = useState<string>("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [transactionTags, setTransactionTags] = useState<Record<string, Tag[]>>({});
  const [openTagPickerFor, setOpenTagPickerFor] = useState<string | null>(null);
  const originalDescriptionRef = useRef<string>("");
  const isCancelingRef = useRef<boolean>(false);

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

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch("/api/tags");
      if (response.ok) {
        const data = await response.json();
        setTags(data.tags || []);
      }
    } catch (err) {
      console.error("Error fetching tags:", err);
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
      // Map tags per transaction for quick lookup
      if (data.transactions) {
        const tagMap: Record<string, Tag[]> = {};
        for (const tx of data.transactions) {
          const txTags = (tx.tags || []) as Tag[];
          if (txTags.length > 0) {
            tagMap[tx.id] = txTags;
          }
        }
        setTransactionTags(tagMap);
      }
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
    fetchTags();
  }, [fetchPaymentMethods, fetchCategories, fetchMerchants, fetchTags]);

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

  const handleDescriptionChange = async (transactionId: string, newDescription: string) => {
    setUpdatingTransaction(transactionId);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: newDescription }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update description");
      }

      const data = await response.json();
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, description: data.transaction.description || null }
            : t
        )
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingTransaction(null);
      setEditingDescription(null);
    }
  };

  const startEditingDescription = (transactionId: string, currentDescription: string | null) => {
    setEditingDescription(transactionId);
    const originalValue = currentDescription || "";
    originalDescriptionRef.current = originalValue;
    setDescriptionValue(originalValue);
    isCancelingRef.current = false;
  };

  const cancelEditingDescription = () => {
    isCancelingRef.current = true;
    setEditingDescription(null);
    setDescriptionValue(originalDescriptionRef.current);
  };

  const saveDescription = (transactionId: string) => {
    // Don't save if we're canceling (Escape was pressed)
    if (isCancelingRef.current) {
      isCancelingRef.current = false;
      return;
    }
    handleDescriptionChange(transactionId, descriptionValue);
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

  const handleMarkAsSubscription = async (transactionId: string) => {
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transaction_id: transactionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create subscription");
      }

      const data = await response.json();
      
      // Update the transaction in the list
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, subscription_id: data.subscription.id }
            : t
        )
      );

      // Remove suggestion if it exists
      setSubscriptionSuggestions((prev) => {
        const updated = { ...prev };
        delete updated[transactionId];
        return updated;
      });
    } catch (err: any) {
      alert(err.message || "Failed to mark as subscription");
    }
  };

  const fetchSubscriptionSuggestions = useCallback(async () => {
    // Check suggestions for transactions that don't have subscriptions
    const transactionsToCheck = transactions.filter((t) => !t.subscription_id && t.amount < 0);
    
    for (const transaction of transactionsToCheck) {
      try {
        const response = await fetch("/api/subscriptions/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transaction_id: transaction.id }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSubscriptionSuggestions((prev) => ({
              ...prev,
              [transaction.id]: data.suggestions[0],
            }));
          }
        }
      } catch (err) {
        // Silently fail - suggestions are not critical
        console.error("Error fetching suggestion:", err);
      }
    }
  }, [transactions]);

  useEffect(() => {
    if (transactions.length > 0) {
      // Debounce suggestion fetching
      const timeoutId = setTimeout(() => {
        fetchSubscriptionSuggestions();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [transactions, fetchSubscriptionSuggestions]);

  const toggleTagForTransaction = async (transactionId: string, tag: Tag) => {
    setUpdatingTransaction(transactionId);
    try {
      const currentTags = transactionTags[transactionId] || [];
      const hasTag = currentTags.some((t) => t.id === tag.id);
      const nextTags = hasTag
        ? currentTags.filter((t) => t.id !== tag.id)
        : [...currentTags, tag];

      const tagIds = nextTags.map((t) => t.id);

      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tag_ids: tagIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update tags");
      }

      setTransactionTags((prev) => ({
        ...prev,
        [transactionId]: nextTags,
      }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingTransaction(null);
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
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
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
                  Tags
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
                    <div>
                      {editingDescription === transaction.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={descriptionValue}
                            onChange={(e) => setDescriptionValue(e.target.value)}
                            onBlur={() => saveDescription(transaction.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                // Set cancel flag BEFORE calling cancelEditingDescription
                                // This ensures onBlur (if it fires) will skip saving
                                isCancelingRef.current = true;
                                cancelEditingDescription();
                              }
                            }}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                            autoFocus
                            disabled={updatingTransaction === transaction.id}
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditingDescription(transaction.id, transaction.description)}
                          className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded -mx-2 -my-1 min-h-[1.5rem] flex items-center"
                          title="Click to edit description"
                        >
                          {transaction.description || <span className="text-gray-400 italic">Click to add description</span>}
                        </div>
                      )}
                      {subscriptionSuggestions[transaction.id] && (
                        <SubscriptionSuggestion
                          transactionId={transaction.id}
                          suggestion={subscriptionSuggestions[transaction.id]}
                          primaryCurrency={primaryCurrency}
                          onLinked={() => {
                            fetchTransactions();
                            setSubscriptionSuggestions((prev) => {
                              const updated = { ...prev };
                              delete updated[transaction.id];
                              return updated;
                            });
                          }}
                        />
                      )}
                    </div>
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
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-1">
                      {(transactionTags[transaction.id] || []).map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTagForTransaction(transaction.id, tag)}
                          className="px-2 py-0.5 rounded-full text-xs font-medium border border-transparent"
                          style={{
                            backgroundColor: tag.color || "#EEF2FF",
                            color: "#111827",
                          }}
                          title={tag.exclude_from_analytics ? "Excluded from main analytics" : undefined}
                          disabled={updatingTransaction === transaction.id}
                        >
                          {tag.name}
                        </button>
                      ))}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenTagPickerFor(
                              openTagPickerFor === transaction.id ? null : transaction.id
                            )
                          }
                          className="px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
                          disabled={updatingTransaction === transaction.id}
                        >
                          + Tag
                        </button>
                        {openTagPickerFor === transaction.id && (
                          <div className="absolute z-10 mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                            <div className="max-h-64 overflow-y-auto py-1">
                              {tags.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-500">
                                  No tags yet. Create some on the Tag Analytics page.
                                </div>
                              ) : (
                                tags.map((tag) => {
                                  const selected =
                                    (transactionTags[transaction.id] || []).some(
                                      (t) => t.id === tag.id
                                    );
                                  return (
                                    <button
                                      key={tag.id}
                                      type="button"
                                      onClick={() => toggleTagForTransaction(transaction.id, tag)}
                                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs ${
                                        selected
                                          ? "bg-indigo-50 text-indigo-700"
                                          : "text-gray-700 hover:bg-gray-50"
                                      }`}
                                      disabled={updatingTransaction === transaction.id}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span
                                          className="inline-block w-2 h-2 rounded-full"
                                          style={{ backgroundColor: tag.color || "#6366F1" }}
                                        />
                                        {tag.name}
                                      </span>
                                      {tag.exclude_from_analytics && (
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                                          Excluded
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
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
                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/transactions/${transaction.id}`}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        Edit
                      </Link>
                      {!transaction.subscription_id && (
                        <button
                          onClick={() => handleMarkAsSubscription(transaction.id)}
                          className="text-purple-600 hover:text-purple-500"
                          title="Mark as subscription"
                        >
                          Subscribe
                        </button>
                      )}
                      {transaction.subscription_id && (
                        <span className="text-purple-600 text-xs" title="Already a subscription">
                          ✓ Sub
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(transaction.id)}
                        className="text-red-600 hover:text-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
