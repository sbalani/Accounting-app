"use client";

import { useState, useEffect, useCallback } from "react";

interface DuplicateTransaction {
  id: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  payment_method_id: string;
  payment_method_name: string;
  similarity_score: number;
}

interface DuplicateDetectionProps {
  amount: number;
  transactionDate: string;
  paymentMethodId: string;
  excludeTransactionId?: string;
  onDuplicateSelect?: (duplicateId: string) => void;
}

export default function DuplicateDetection({
  amount,
  transactionDate,
  paymentMethodId,
  excludeTransactionId,
  onDuplicateSelect,
}: DuplicateDetectionProps) {
  const [duplicates, setDuplicates] = useState<DuplicateTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/transactions/duplicates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          transaction_date: transactionDate,
          payment_method_id: paymentMethodId,
          exclude_transaction_id: excludeTransactionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to check for duplicates");
      }

      const data = await response.json();
      setDuplicates(data.duplicates || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [amount, transactionDate, paymentMethodId, excludeTransactionId]);

  useEffect(() => {
    if (amount && transactionDate && paymentMethodId) {
      checkDuplicates();
    } else {
      setDuplicates([]);
    }
  }, [amount, transactionDate, paymentMethodId, excludeTransactionId, checkDuplicates]);

  if (!amount || !transactionDate || !paymentMethodId) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">Checking for duplicate transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">Error checking for duplicates: {error}</p>
      </div>
    );
  }

  if (duplicates.length === 0) {
    return null;
  }

  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amt);
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-yellow-900 mb-2">
        Potential Duplicate Transactions Found
      </h3>
      <div className="space-y-2">
        {duplicates.map((duplicate) => (
          <div
            key={duplicate.id}
            className="bg-white rounded p-3 border border-yellow-200"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {formatAmount(duplicate.amount)}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {duplicate.description || "No description"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {duplicate.payment_method_name} •{" "}
                  {new Date(duplicate.transaction_date).toLocaleDateString()} •{" "}
                  {duplicate.similarity_score.toFixed(0)}% match
                </p>
              </div>
              {onDuplicateSelect && (
                <button
                  onClick={() => onDuplicateSelect(duplicate.id)}
                  className="ml-2 text-xs text-blue-600 hover:text-blue-500"
                >
                  Mark as Duplicate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-yellow-700 mt-2">
        These transactions are similar to the one you&apos;re entering. Please review to avoid duplicates.
      </p>
    </div>
  );
}
