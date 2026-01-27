"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AutocompleteDropdown from "@/components/AutocompleteDropdown";

interface Transaction {
  id: string;
  payment_method_id: string;
  amount: number;
  description: string | null;
  category: string | null;
  category_id?: string | null;
  transaction_date: string;
  transaction_type?: "expense" | "income" | "transfer";
  transfer_from_id?: string | null;
  transfer_to_id?: string | null;
  payment_methods: {
    name: string;
    type: string;
  };
}

interface PaymentMethod {
  id: string;
  name: string;
}

interface MatchableTransaction {
  id: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  transaction_type?: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

export default function EditTransactionPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transactionDate, setTransactionDate] = useState("");
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [convertOtherAccountId, setConvertOtherAccountId] = useState("");
  const [matchableTransactions, setMatchableTransactions] = useState<MatchableTransaction[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [converting, setConverting] = useState(false);

  const fetchTransaction = useCallback(async () => {
    try {
      const response = await fetch(`/api/transactions/${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch transaction");
      }
      const data = await response.json();
      setTransaction(data.transaction);
      setPaymentMethodId(data.transaction.payment_method_id);
      setAmount(Math.abs(data.transaction.amount).toString());
      setDescription(data.transaction.description || "");
      setMerchant(data.transaction.merchant || "");
      setCategoryId(data.transaction.category_id || null);
      setTransactionDate(data.transaction.transaction_date);
      // Set transaction type based on amount sign (negative = expense, positive = income)
      setTransactionType(data.transaction.amount < 0 ? "expense" : "income");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  const handleCreateCategory = useCallback(
    async (name: string): Promise<Category | null> => {
      try {
        const r = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to create category");
        setCategories((prev) => [...prev, d.category]);
        return d.category;
      } catch (err) {
        console.error("Error creating category:", err);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    fetchPaymentMethods();
    fetchCategories();
    fetchTransaction();
  }, [fetchPaymentMethods, fetchCategories, fetchTransaction]);

  useEffect(() => {
    if (!convertOtherAccountId || !transaction) {
      setMatchableTransactions([]);
      setSelectedMatchId("");
      return;
    }
    const aborter = new AbortController();
    setLoadingMatches(true);
    setSelectedMatchId("");
    fetch(
      `/api/transactions?payment_method_id=${encodeURIComponent(convertOtherAccountId)}`,
      { signal: aborter.signal }
    )
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to fetch transactions: ${r.status} ${r.statusText}`);
        }
        return r.json();
      })
      .then((data) => {
        const list: MatchableTransaction[] = data.transactions || [];
        const myAmount = transaction.amount;
        const absMe = Math.abs(myAmount);
        const oppositeSign = (t: { amount: number }) =>
          (myAmount >= 0 && t.amount < 0) || (myAmount < 0 && t.amount >= 0);
        const sameAbs = (t: { amount: number }) => Math.abs(Math.abs(t.amount) - absMe) < 0.01;
        const notTransfer = (t: MatchableTransaction) => t.transaction_type !== "transfer";
        const notSelf = (t: MatchableTransaction) => t.id !== transaction.id;
        const matchable = list.filter(
          (t) => oppositeSign(t) && sameAbs(t) && notTransfer(t) && notSelf(t)
        );
        setMatchableTransactions(matchable);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          console.error("Error fetching matchable transactions:", e);
          setMatchableTransactions([]);
          setError(e instanceof Error ? e.message : "Failed to load matching transactions");
        }
      })
      .finally(() => setLoadingMatches(false));
    return () => aborter.abort();
  }, [convertOtherAccountId, transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue === 0) {
        throw new Error("Amount must be a non-zero number");
      }

      // Calculate final amount based on transaction type
      const finalAmount = transactionType === "expense" ? -Math.abs(amountValue) : Math.abs(amountValue);

      const response = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          amount: finalAmount,
          description: description.trim() || null,
          merchant: merchant.trim() || null,
          category_id: categoryId || null,
          transaction_date: transactionDate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update transaction");
      }

      router.push("/transactions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToTransfer = async () => {
    if (!selectedMatchId) return;
    setConverting(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/convert-to-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: id,
          other_transaction_id: selectedMatchId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Convert failed");
      router.push("/transactions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Convert to transfer failed");
    } finally {
      setConverting(false);
    }
  };

  const isTransfer = transaction?.transaction_type === "transfer";

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || "Transaction not found"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/transactions" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Transactions
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Transaction</h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transaction Type
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center text-gray-900">
                  <input
                    type="radio"
                    value="expense"
                    checked={transactionType === "expense"}
                    onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                    className="mr-2"
                  />
                  Expense
                </label>
                <label className="flex items-center text-gray-900">
                  <input
                    type="radio"
                    value="income"
                    checked={transactionType === "income"}
                    onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                    className="mr-2"
                  />
                  Income
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700">
                Payment Method
              </label>
              <select
                id="paymentMethod"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                Amount
              </label>
              <input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="merchant" className="block text-sm font-medium text-gray-700">
                Merchant/Vendor
              </label>
              <input
                id="merchant"
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Store or vendor name (optional)"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <AutocompleteDropdown
                items={categories}
                value={categoryId}
                onChange={(id) => setCategoryId(id)}
                onCreateNew={handleCreateCategory}
                placeholder="Select or create category (optional)"
                className="mt-1"
              />
            </div>

            <div>
              <label htmlFor="transactionDate" className="block text-sm font-medium text-gray-700">
                Transaction Date
              </label>
              <input
                id="transactionDate"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>

            {!isTransfer && (
              <div className="border-t pt-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Convert to transfer</h3>
                <p className="text-sm text-gray-600">
                  Match this transaction with one in another account (e.g. +10 here and −10 there) to mark both as a transfer.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Other account</label>
                  <select
                    value={convertOtherAccountId}
                    onChange={(e) => {
                      setConvertOtherAccountId(e.target.value);
                      setSelectedMatchId("");
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="">Select account</option>
                    {paymentMethods
                      .filter((pm) => pm.id !== transaction.payment_method_id)
                      .map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                        </option>
                      ))}
                  </select>
                </div>
                {convertOtherAccountId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Matching transaction (same amount, opposite sign)
                    </label>
                    {loadingMatches ? (
                      <p className="text-sm text-gray-500">Loading…</p>
                    ) : matchableTransactions.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No matching transactions in that account. Need a ±{Math.abs(transaction.amount).toFixed(2)} with opposite sign.
                      </p>
                    ) : (
                      <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                        {matchableTransactions.map((tx) => (
                          <label
                            key={tx.id}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="convert-match"
                              checked={selectedMatchId === tx.id}
                              onChange={() => setSelectedMatchId(tx.id)}
                              className="rounded-full"
                            />
                            <span className="text-sm font-medium tabular-nums">
                              {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)}
                            </span>
                            <span className="text-sm text-gray-600">
                              {tx.transaction_date}
                            </span>
                            <span className="text-sm text-gray-700 truncate flex-1">
                              {tx.description || "—"}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedMatchId && (
                  <button
                    type="button"
                    onClick={handleConvertToTransfer}
                    disabled={converting}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {converting ? "Converting…" : "Convert to transfer"}
                  </button>
                )}
              </div>
            )}

            {isTransfer && (
              <div className="border-t pt-6">
                <p className="text-sm text-gray-600">
                  This is a transfer. From → To:{" "}
                  {paymentMethods.find((p) => p.id === transaction.transfer_from_id)?.name ?? "—"} →{" "}
                  {paymentMethods.find((p) => p.id === transaction.transfer_to_id)?.name ?? "—"}
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <Link
                href="/transactions"
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
