"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils/currency";

interface SubscriptionSuggestionProps {
  transactionId: string;
  suggestion: {
    type: "link_to_existing" | "create_new";
    subscription?: {
      id: string;
      name: string;
      amount: number;
    };
    match_count?: number;
    future_match_count?: number;
    suggested_amount?: number;
    suggested_due_day?: number;
    matching_transactions?: Array<{
      id: string;
      date: string;
      amount: number;
    }>;
    confidence?: "high" | "medium" | "low";
  };
  primaryCurrency: string;
  onLinked: () => void;
}

export default function SubscriptionSuggestion({
  transactionId,
  suggestion,
  primaryCurrency,
  onLinked,
}: SubscriptionSuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleLinkToExisting = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription_id: suggestion.subscription?.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to link transaction");
      }

      onLinked();
      setDismissed(true);
    } catch (err: any) {
      alert(err.message || "Failed to link transaction to subscription");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndLink = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction_id: transactionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create subscription");
      }

      onLinked();
      setDismissed(true);
    } catch (err: any) {
      alert(err.message || "Failed to create subscription");
    } finally {
      setLoading(false);
    }
  };

  if (dismissed) {
    return null;
  }

  const isHighConfidence = suggestion.confidence === "high";

  return (
    <div
      className={`mt-2 p-3 rounded-md border ${
        isHighConfidence
          ? "bg-blue-50 border-blue-200"
          : "bg-yellow-50 border-yellow-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-gray-900">
              {suggestion.type === "link_to_existing"
                ? `This might be "${suggestion.subscription?.name}" subscription`
                : "This looks like a subscription"}
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {suggestion.type === "link_to_existing" ? (
              <>
                Found {suggestion.match_count || 0} similar transaction
                {suggestion.match_count !== 1 ? "s" : ""} that match this subscription pattern.
              </>
            ) : (
              <>
                Found {suggestion.future_match_count || 0} similar future transaction
                {suggestion.future_match_count !== 1 ? "s" : ""} (
                {suggestion.match_count || 0} total) suggesting this is a recurring subscription.
              </>
            )}
          </p>
          {suggestion.matching_transactions && suggestion.matching_transactions.length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              <p className="font-medium">Matching dates:</p>
              <ul className="list-disc list-inside mt-1">
                {suggestion.matching_transactions.slice(0, 3).map((t, idx) => (
                  <li key={idx}>
                    {new Date(t.date).toLocaleDateString()} -{" "}
                    {formatCurrency(Math.abs(t.amount), primaryCurrency)}
                  </li>
                ))}
                {suggestion.matching_transactions.length > 3 && (
                  <li>... and {suggestion.matching_transactions.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="ml-4 flex flex-col gap-2">
          {suggestion.type === "link_to_existing" ? (
            <button
              onClick={handleLinkToExisting}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Linking..." : "Link to Subscription"}
            </button>
          ) : (
            <button
              onClick={handleCreateAndLink}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Subscription"}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

