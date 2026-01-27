"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";
import TransactionsList from "@/components/TransactionsList";

interface PaymentMethod {
  id: string;
  name: string;
  type: "cash" | "bank_account" | "credit_card";
  current_balance: number;
  currency: string;
  bank_account_number?: string | null;
}

function getTypeLabel(type: string) {
  switch (type) {
    case "cash":
      return "Cash";
    case "bank_account":
      return "Bank Account";
    case "credit_card":
      return "Credit Card";
    default:
      return type;
  }
}

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccount() {
      try {
        const [pmRes, listRes] = await Promise.all([
          fetch(`/api/payment-methods/${id}`),
          fetch("/api/payment-methods"),
        ]);
        if (!pmRes.ok) {
          throw new Error("Failed to fetch account");
        }
        const data = await pmRes.json();
        setPaymentMethod(data.paymentMethod);
        if (listRes.ok) {
          const listData = await listRes.json();
          setPrimaryCurrency(listData.primaryCurrency || "USD");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load account");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchAccount();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center py-12">Loading account...</div>
        </div>
      </div>
    );
  }

  if (error || !paymentMethod) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || "Account not found"}
          </div>
          <Link href="/accounts" className="mt-4 inline-block text-blue-600 hover:text-blue-500 text-sm">
            ← Back to Payment Methods
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link
            href="/accounts"
            className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block"
          >
            ← Back to Payment Methods
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{paymentMethod.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>{getTypeLabel(paymentMethod.type)}</span>
                <span>·</span>
                <span>{paymentMethod.currency}</span>
                {paymentMethod.bank_account_number && (
                  <>
                    <span>·</span>
                    <span className="font-mono text-gray-700">
                      {paymentMethod.bank_account_number}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/accounts/${id}/edit`}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit account
              </Link>
              <Link
                href="/transactions/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Add transaction
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-8 p-6 bg-white shadow rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Current balance</p>
          <p
            className={`text-2xl font-bold ${
              paymentMethod.type === "credit_card" && paymentMethod.current_balance < 0
                ? "text-red-600"
                : "text-gray-900"
            }`}
          >
            {formatCurrency(paymentMethod.current_balance, primaryCurrency)}
          </p>
          {paymentMethod.currency !== primaryCurrency && (
            <p className="text-sm text-gray-500 mt-1">
              ({formatCurrency(paymentMethod.current_balance, paymentMethod.currency)} in account currency)
            </p>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transactions</h2>
          <TransactionsList paymentMethodId={id} />
        </div>
      </div>
    </div>
  );
}
