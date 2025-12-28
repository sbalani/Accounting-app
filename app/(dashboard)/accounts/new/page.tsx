"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewPaymentMethodPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"cash" | "bank_account" | "credit_card">("bank_account");
  const [initialBalance, setInitialBalance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/payment-methods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          type,
          initial_balance: parseFloat(initialBalance) || 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create payment method");
      }

      router.push("/accounts");
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
          <Link href="/accounts" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Payment Methods
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Add Payment Method</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create a new payment method to track your finances
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
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., Chase Checking, Wallet, Credit Card"
                required
              />
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                Type
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                <option value="cash" className="text-gray-900">Cash</option>
                <option value="bank_account" className="text-gray-900">Bank Account</option>
                <option value="credit_card" className="text-gray-900">Credit Card</option>
              </select>
            </div>

            <div>
              <label htmlFor="initialBalance" className="block text-sm font-medium text-gray-700">
                Initial Balance
              </label>
              <input
                id="initialBalance"
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="0.00"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                For credit cards, enter the current balance (negative value means debt)
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <Link
                href="/accounts"
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Payment Method"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
