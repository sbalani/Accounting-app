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

interface TransactionsListProps {
  /** When set, scope the list to this account and hide the account filter. */
  paymentMethodId?: string;
}

export default function TransactionsList({ paymentMethodId }: TransactionsListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [transactionType, setTransactionType] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ income: number; expense: number } | null>(null);
  const PAGE_SIZE = 50;
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [categories, setCategories] = useState<Category[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [subscriptionSuggestions, setSubscriptionSuggestions] = useState<Record<string, any>>({});
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [descriptionValue, setDescriptionValue] = useState<string>("");
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState<string>("");
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<string>("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [transactionTags, setTransactionTags] = useState<Record<string, Tag[]>>({});
  const [openTagPickerFor, setOpenTagPickerFor] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState<number | null>(null);
  const originalDescriptionRef = useRef<string>("");
  const isCancelingRef = useRef<boolean>(false);
  const isCancelingAmountRef = useRef<boolean>(false);
  const isCancelingDateRef = useRef<boolean>(false);
  /** AbortControllers for in-flight PATCH requests, keyed by "field:transactionId". Cancel previous when user edits same field again. */
  const pendingPatchRef = useRef<Record<string, AbortController>>({});

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
      const effectivePaymentMethod = paymentMethodId || filterPaymentMethod;
      if (effectivePaymentMethod) {
        params.append("payment_method_id", effectivePaymentMethod);
      }

      if (transactionType) {
        params.append("transaction_type", transactionType);
      }

      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }

      params.append("limit", String(PAGE_SIZE));
      params.append("page", String(page));

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
      setTotal(data.total ?? 0);
      setSummary(data.summary ?? null);
      setOpeningBalance(
        data.openingBalance != null ? Number(data.openingBalance) : null
      );
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
  }, [paymentMethodId, filterPaymentMethod, datePreset, startDate, endDate, transactionType, debouncedSearch, page]);

  useEffect(() => {
    fetchPaymentMethods();
    fetchCategories();
    fetchMerchants();
    fetchTags();
  }, [fetchPaymentMethods, fetchCategories, fetchMerchants, fetchTags]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterPaymentMethod, datePreset, startDate, endDate, transactionType, paymentMethodId]);

  // Update date inputs when preset changes
  useEffect(() => {
    if (datePreset && datePreset !== "custom") {
      const range = getDatePresetRange(datePreset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, [datePreset]);

  /** Abort any in-flight PATCH for this key, create new controller, run fetch. On AbortError: no revert, no alert. */
  const patchWithAbort = useCallback(
    async (
      key: string,
      body: Record<string, unknown>,
      opts: {
        onSuccess?: (data: { transaction: Transaction }) => void;
        onRevert: () => void;
      }
    ): Promise<void> => {
      const prev = pendingPatchRef.current[key];
      if (prev) {
        prev.abort();
        delete pendingPatchRef.current[key];
      }
      const ac = new AbortController();
      pendingPatchRef.current[key] = ac;
      try {
        const txId = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
        const response = await fetch(`/api/transactions/${txId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Request failed");
        }
        const data = await response.json();
        opts.onSuccess?.(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        opts.onRevert();
        alert(err instanceof Error ? err.message : "Update failed");
      } finally {
        delete pendingPatchRef.current[key];
      }
    },
    []
  );

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

      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleCategoryChange = useCallback(
    (transactionId: string, categoryId: string | null, categoryName: string | null) => {
      const key = `cat:${transactionId}`;
      const prev = { category_id: null as string | null, category: null as string | null };
      setTransactions((p) => {
        const t = p.find((x) => x.id === transactionId);
        if (t) {
          prev.category_id = t.category_id;
          prev.category = t.category;
        }
        return p.map((t) =>
          t.id === transactionId
            ? { ...t, category_id: categoryId, category: categoryName }
            : t
        );
      });
      patchWithAbort(key, { category_id: categoryId }, {
        onSuccess: (d) => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId
                ? { ...t, category_id: d.transaction.category_id ?? categoryId, category: d.transaction.category ?? categoryName }
                : t
            )
          );
        },
        onRevert: () => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId ? { ...t, category_id: prev.category_id, category: prev.category } : t
            )
          );
        },
      });
    },
    [patchWithAbort]
  );

  const handleMerchantChange = useCallback(
    (transactionId: string, merchantId: string | null, merchantName: string | null) => {
      const key = `merch:${transactionId}`;
      const prev = { merchant_id: null as string | null, merchant: null as string | null };
      setTransactions((p) => {
        const t = p.find((x) => x.id === transactionId);
        if (t) {
          prev.merchant_id = t.merchant_id;
          prev.merchant = t.merchant;
        }
        return p.map((t) =>
          t.id === transactionId
            ? { ...t, merchant_id: merchantId, merchant: merchantName }
            : t
        );
      });
      patchWithAbort(key, { merchant_id: merchantId }, {
        onSuccess: (d) => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId
                ? { ...t, merchant_id: d.transaction.merchant_id ?? merchantId, merchant: d.transaction.merchant ?? merchantName }
                : t
            )
          );
        },
        onRevert: () => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId ? { ...t, merchant_id: prev.merchant_id, merchant: prev.merchant } : t
            )
          );
        },
      });
    },
    [patchWithAbort]
  );

  const handleDescriptionChange = useCallback(
    (transactionId: string, newDescription: string) => {
      const key = `desc:${transactionId}`;
      let previousDescription: string | null = null;
      setTransactions((p) => {
        const t = p.find((x) => x.id === transactionId);
        if (t) previousDescription = t.description;
        return p.map((t) =>
          t.id === transactionId ? { ...t, description: newDescription || null } : t
        );
      });
      const prev = previousDescription ?? null;
      patchWithAbort(key, { description: newDescription || null }, {
        onSuccess: (d) => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId
                ? { ...t, description: (d.transaction.description ?? newDescription) ?? null }
                : t
            )
          );
        },
        onRevert: () => {
          setTransactions((p) =>
            p.map((t) =>
              t.id === transactionId ? { ...t, description: prev } : t
            )
          );
        },
      });
    },
    [patchWithAbort]
  );

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
    if (isCancelingRef.current) {
      isCancelingRef.current = false;
      return;
    }
    const value = descriptionValue;
    setEditingDescription(null);
    handleDescriptionChange(transactionId, value);
  };

  const startEditingAmount = (transaction: Transaction) => {
    if (transaction.transaction_type === "transfer") return;
    setEditingAmountId(transaction.id);
    setAmountDraft(String(transaction.amount));
    isCancelingAmountRef.current = false;
  };

  const cancelEditingAmount = () => {
    isCancelingAmountRef.current = true;
    setEditingAmountId(null);
    setAmountDraft("");
  };

  const saveAmountEdit = (transactionId: string) => {
    if (isCancelingAmountRef.current) {
      isCancelingAmountRef.current = false;
      return;
    }
    const raw = amountDraft.trim().replace(/,/g, "");
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed === 0) {
      alert("Enter a non-zero number (use negative for expenses, positive for income).");
      return;
    }
    setEditingAmountId(null);
    setAmountDraft("");

    const key = `amount:${transactionId}`;
    let previousAmount = 0;
    setTransactions((p) => {
      const t = p.find((x) => x.id === transactionId);
      if (t) previousAmount = t.amount;
      return p.map((t) =>
        t.id === transactionId ? { ...t, amount: parsed } : t
      );
    });

    patchWithAbort(key, { amount: parsed }, {
      onSuccess: (d) => {
        const u = d.transaction;
        setTransactions((p) =>
          p.map((t) =>
            t.id === transactionId
              ? {
                  ...t,
                  amount: Number(u.amount),
                }
              : t
          )
        );
      },
      onRevert: () => {
        setTransactions((p) =>
          p.map((t) =>
            t.id === transactionId ? { ...t, amount: previousAmount } : t
          )
        );
      },
    });
  };

  const startEditingDate = (transaction: Transaction) => {
    setEditingDateId(transaction.id);
    const d = transaction.transaction_date;
    setDateDraft(d.length >= 10 ? d.slice(0, 10) : d);
    isCancelingDateRef.current = false;
  };

  const cancelEditingDate = () => {
    isCancelingDateRef.current = true;
    setEditingDateId(null);
    setDateDraft("");
  };

  const saveDateEdit = (transactionId: string) => {
    if (isCancelingDateRef.current) {
      isCancelingDateRef.current = false;
      return;
    }
    const next = dateDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      alert("Use a valid date (YYYY-MM-DD).");
      return;
    }
    setEditingDateId(null);
    setDateDraft("");

    const key = `date:${transactionId}`;
    let previousDate = "";
    setTransactions((p) => {
      const t = p.find((x) => x.id === transactionId);
      if (t) previousDate = t.transaction_date;
      return p.map((t) =>
        t.id === transactionId ? { ...t, transaction_date: next } : t
      );
    });

    patchWithAbort(key, { transaction_date: next }, {
      onSuccess: (d) => {
        const u = d.transaction;
        setTransactions((p) =>
          p.map((t) =>
            t.id === transactionId
              ? { ...t, transaction_date: u.transaction_date ?? next }
              : t
          )
        );
      },
      onRevert: () => {
        setTransactions((p) =>
          p.map((t) =>
            t.id === transactionId ? { ...t, transaction_date: previousDate } : t
          )
        );
      },
    });
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

  const toggleTagForTransaction = useCallback(
    (transactionId: string, tag: Tag) => {
      const key = `tags:${transactionId}`;
      const currentTags = transactionTags[transactionId] || [];
      const hasTag = currentTags.some((t) => t.id === tag.id);
      const nextTags = hasTag
        ? currentTags.filter((t) => t.id !== tag.id)
        : [...currentTags, tag];
      const tagIds = nextTags.map((t) => t.id);
      const prevTags = [...currentTags];

      setTransactionTags((p) => ({ ...p, [transactionId]: nextTags }));

      patchWithAbort(key, { tag_ids: tagIds }, {
        onRevert: () => {
          setTransactionTags((p) => ({ ...p, [transactionId]: prevTags }));
        },
      });
    },
    [transactionTags, patchWithAbort]
  );


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

  const totalExpenses =
    summary?.expense ??
    transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const totalIncome =
    summary?.income ??
    transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const effectiveAccount = paymentMethodId || filterPaymentMethod;
  const showBalance = !!effectiveAccount && openingBalance != null;
  const balanceAfterMap = (() => {
    if (!showBalance || openingBalance == null) return new Map<string, number>();
    const byDateAsc = [...transactions].sort((a, b) => {
      const d = a.transaction_date.localeCompare(b.transaction_date);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
    const m = new Map<string, number>();
    let running = openingBalance;
    for (const t of byDateAsc) {
      running += t.amount;
      m.set(t.id, running);
    }
    return m;
  })();

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        {paymentMethodId && (
          <p className="mb-4 text-sm text-gray-600">
            <Link href="/transactions" className="text-blue-600 hover:text-blue-500">
              View all transactions
            </Link>
          </p>
        )}
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Description, merchant, or category..."
              className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div className={`grid grid-cols-1 gap-4 ${paymentMethodId ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"}`}>
            {!paymentMethodId && (
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
            )}

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
        {showBalance && openingBalance != null && transactions.length > 0 && (() => {
          // Calculate closing balance using the same chronological sort as the table
          const byDateAsc = [...transactions].sort((a, b) => {
            const d = a.transaction_date.localeCompare(b.transaction_date);
            return d !== 0 ? d : a.id.localeCompare(b.id);
          });
          const closingBalance = openingBalance + byDateAsc.reduce((s, t) => s + t.amount, 0);
          return (
            <p className="mt-4 text-sm text-gray-600">
              Opening balance: {formatCurrency(openingBalance, primaryCurrency)}
              {" → "}
              Closing balance: {formatCurrency(closingBalance, primaryCurrency)}
            </p>
          );
        })()}
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
                {!paymentMethodId && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                {showBalance && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 align-top">
                    {editingDateId === transaction.id ? (
                      <input
                        type="date"
                        value={dateDraft}
                        onChange={(e) => setDateDraft(e.target.value)}
                        onBlur={() => saveDateEdit(transaction.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            isCancelingDateRef.current = true;
                            cancelEditingDate();
                          }
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingDate(transaction)}
                        className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded -mx-2 text-left w-full"
                        title="Click to change date"
                      >
                        {new Date(transaction.transaction_date + "T12:00:00").toLocaleDateString()}
                      </button>
                    )}
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
                      onChange={(categoryId, categoryName) => handleCategoryChange(transaction.id, categoryId, categoryName)}
                      onCreateNew={handleCreateCategory}
                      placeholder="Select category..."
                      className="min-w-[150px]"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <AutocompleteDropdown
                      items={merchants}
                      value={transaction.merchant_id}
                      onChange={(merchantId, merchantName) => handleMerchantChange(transaction.id, merchantId, merchantName)}
                      onCreateNew={handleCreateMerchant}
                      placeholder="Select merchant..."
                      className="min-w-[150px]"
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
                        >
                          + Tag
                        </button>
                        {openTagPickerFor === transaction.id && (
                          <div className="absolute z-10 mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                            <div className="max-h-64 overflow-y-auto py-1">
                              {tags.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-500">
                                  No tags yet.{" "}
                                  <Link href="/analytics/tags" className="text-blue-600 hover:text-blue-500">
                                    Create tags
                                  </Link>
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
                  {!paymentMethodId && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.payment_methods?.name || "-"}
                    </td>
                  )}
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm font-medium align-top ${
                      transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {transaction.transaction_type === "transfer" ? (
                      <span title="Edit transfer amounts on the transaction page">
                        {formatCurrency(transaction.amount, primaryCurrency)}
                      </span>
                    ) : editingAmountId === transaction.id ? (
                      <div className="flex items-center gap-1 min-w-[7rem]">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amountDraft}
                          onChange={(e) => setAmountDraft(e.target.value)}
                          onBlur={() => saveAmountEdit(transaction.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              isCancelingAmountRef.current = true;
                              cancelEditingAmount();
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 font-medium"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingAmount(transaction)}
                        className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded -mx-2 text-left w-full font-medium"
                        title="Click to edit amount (negative = expense, positive = income)"
                      >
                        {formatCurrency(transaction.amount, primaryCurrency)}
                      </button>
                    )}
                  </td>
                  {showBalance && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm tabular-nums text-gray-700">
                      {formatCurrency(balanceAfterMap.get(transaction.id) ?? 0, primaryCurrency)}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/transactions/${transaction.id}`}
                        className="text-blue-600 hover:text-blue-500"
                        title="Open full details (account, transfer tools, etc.)"
                      >
                        Details
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

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
