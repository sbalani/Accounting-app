"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_CURRENCIES } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";

interface PaymentMethod {
  id: string;
  name: string;
  type: "cash" | "bank_account" | "credit_card";
  current_balance: number;
  initial_balance: number;
  currency: string;
  bank_account_number?: string | null;
  created_at: string;
}

export default function EditPaymentMethodPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"cash" | "bank_account" | "credit_card">("bank_account");
  const [currency, setCurrency] = useState<string>("USD");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPaymentMethod() {
      try {
        const response = await fetch(`/api/payment-methods/${id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch payment method");
        }
        const data = await response.json();
        setPaymentMethod(data.paymentMethod);
        setName(data.paymentMethod.name);
        setType(data.paymentMethod.type);
        setCurrency(data.paymentMethod.currency || "USD");
        setBankAccountNumber(data.paymentMethod.bank_account_number || "");

        const pmResponse = await fetch("/api/payment-methods");
        if (pmResponse.ok) {
          const pmData = await pmResponse.json();
          setPrimaryCurrency(pmData.primaryCurrency || "USD");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchPaymentMethod();
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch(`/api/payment-methods/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          type,
          currency,
          bank_account_number: bankAccountNumber.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update payment method");
      }

      router.push(`/accounts/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !paymentMethod) {
    return (
      <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || "Payment method not found"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link
            href={`/accounts/${id}`}
            className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block"
          >
            ← Back to account
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Payment Method</h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Current Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(paymentMethod.current_balance, paymentMethod.currency || "USD")}
            </p>
            {paymentMethod.currency !== primaryCurrency && (
              <p className="text-sm text-gray-500 mt-1">
                ({formatCurrency(paymentMethod.current_balance, primaryCurrency)} in {primaryCurrency})
              </p>
            )}
          </div>

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
                onChange={(e) => setType(e.target.value as "cash" | "bank_account" | "credit_card")}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                <option value="cash">Cash</option>
                <option value="bank_account">Bank Account</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            <div>
              <label htmlFor="bankAccountNumber" className="block text-sm font-medium text-gray-700">
                Bank Account Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="bankAccountNumber"
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g. last 4 digits ****1234 or full number"
              />
              <p className="mt-1 text-sm text-gray-500">
                Helps distinguish between accounts; you can use last 4 digits only if you prefer.
              </p>
            </div>

            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
                Currency
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Default currency for transactions in this account. This can be changed per transaction if needed.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <Link
                href={`/accounts/${id}`}
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
