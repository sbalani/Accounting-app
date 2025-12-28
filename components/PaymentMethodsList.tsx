"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

interface PaymentMethod {
  id: string;
  name: string;
  type: "cash" | "bank_account" | "credit_card";
  current_balance: number;
  initial_balance: number;
  created_at: string;
}

export default function PaymentMethodsList() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (!response.ok) {
        throw new Error("Failed to fetch payment methods");
      }
      const data = await response.json();
      setPaymentMethods(data.paymentMethods || []);
      setPrimaryCurrency(data.primaryCurrency || "USD");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) {
      return;
    }

    try {
      const response = await fetch(`/api/payment-methods/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete payment method");
      }

      setPaymentMethods(paymentMethods.filter((pm) => pm.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };


  const getTypeLabel = (type: string) => {
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
  };

  if (loading) {
    return <div className="text-center py-8">Loading payment methods...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (paymentMethods.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center">
        <p className="text-gray-600 mb-4">No payment methods yet.</p>
        <Link
          href="/accounts/new"
          className="text-blue-600 hover:text-blue-500 font-medium"
        >
          Create your first payment method
        </Link>
      </div>
    );
  }

  const totalBalance = paymentMethods.reduce((sum, pm) => sum + pm.current_balance, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Total Balance</h2>
        <p className="text-3xl font-bold text-gray-900">
          {formatCurrency(totalBalance, primaryCurrency)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {paymentMethods.map((method) => (
          <div key={method.id} className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{method.name}</h3>
                <p className="text-sm text-gray-500">{getTypeLabel(method.type)}</p>
              </div>
              <div className="flex space-x-2">
                <Link
                  href={`/accounts/${method.id}`}
                  className="text-blue-600 hover:text-blue-500 text-sm"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(method.id)}
                  className="text-red-600 hover:text-red-500 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-1">Current Balance</p>
              <p
                className={`text-2xl font-bold ${
                  method.type === "credit_card" && method.current_balance < 0
                    ? "text-red-600"
                    : "text-gray-900"
                }`}
              >
                {formatCurrency(method.current_balance, primaryCurrency)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
