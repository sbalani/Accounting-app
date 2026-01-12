"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DuplicateDetection from "@/components/DuplicateDetection";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
}

interface Category {
  id: string;
  name: string;
  is_default: boolean;
}

export default function NewTransactionPage() {
  const router = useRouter();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
    fetchCategories();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
        if (data.paymentMethods?.length > 0) {
          setPaymentMethodId(data.paymentMethods[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue === 0) {
        throw new Error("Amount must be a non-zero number");
      }

      const finalAmount = transactionType === "expense" ? -Math.abs(amountValue) : Math.abs(amountValue);

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          amount: finalAmount,
          description: description.trim() || null,
          merchant: merchant.trim() || null,
          category: category || null,
          transaction_date: transactionDate,
          source: "manual",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create transaction");
      }

      router.push("/transactions");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/transactions" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Transactions
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Add Transaction</h1>
          <p className="mt-2 text-sm text-gray-600">
            Record a new expense or income
          </p>
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
                    onChange={(e) => setTransactionType(e.target.value as any)}
                    className="mr-2"
                  />
                  Expense
                </label>
                <label className="flex items-center text-gray-900">
                  <input
                    type="radio"
                    value="income"
                    checked={transactionType === "income"}
                    onChange={(e) => setTransactionType(e.target.value as any)}
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
              {paymentMethods.length === 0 ? (
                <div className="mt-1">
                  <p className="text-sm text-gray-500 mb-2">
                    No payment methods yet.{" "}
                    <Link href="/accounts/new" className="text-blue-600 hover:text-blue-500">
                      Create one first
                    </Link>
                  </p>
                  <select
                    id="paymentMethod"
                    disabled
                    className="block w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-md shadow-sm text-gray-500 sm:text-sm cursor-not-allowed"
                  >
                    <option>No payment methods available</option>
                  </select>
                </div>
              ) : (
                <select
                  id="paymentMethod"
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                >
                  <option value="">Select a payment method</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              )}
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
                placeholder="0.00"
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
                placeholder="What is this transaction for?"
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
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select a category (optional)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
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

            {paymentMethodId && amount && transactionDate && (
              <DuplicateDetection
                amount={parseFloat(amount) || 0}
                transactionDate={transactionDate}
                paymentMethodId={paymentMethodId}
              />
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
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Transaction"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
