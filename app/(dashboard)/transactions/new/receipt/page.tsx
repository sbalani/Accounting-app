"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import DuplicateDetection from "@/components/DuplicateDetection";

interface ParsedTransaction {
  amount: number;
  description: string | null;
  category: string | null;
  transaction_date: string;
}

export default function ReceiptUploadPage() {
  const router = useRouter();
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
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

  const handleUploadComplete = async (fileData: any) => {
    setUploadedFile(fileData);
    setProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/openai/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: fileData.publicUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process receipt");
      }

      const data = await response.json();
      setParsedTransaction(data.transaction);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedTransaction || !paymentMethodId) {
      setError("Missing required fields");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          amount: parsedTransaction.amount,
          description: parsedTransaction.description,
          category: parsedTransaction.category,
          transaction_date: parsedTransaction.transaction_date,
          source: "receipt",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save transaction");
      }

      router.push("/transactions");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/transactions/new" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Add Transaction
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Upload Receipt</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload a receipt image to automatically extract transaction details
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!uploadedFile ? (
            <FileUpload
              type="receipt"
              onUploadComplete={handleUploadComplete}
              onUploadError={(err) => setError(err)}
              accept="image/*"
            />
          ) : (
            <>
              {processing ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Processing receipt...</p>
                </div>
              ) : parsedTransaction ? (
                <>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h2 className="font-semibold mb-4">Extracted Transaction Details</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={parsedTransaction.amount}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              amount: parseFloat(e.target.value),
                            })
                          }
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <input
                          type="text"
                          value={parsedTransaction.description || ""}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              description: e.target.value,
                            })
                          }
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Date</label>
                        <input
                          type="date"
                          value={parsedTransaction.transaction_date}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              transaction_date: e.target.value,
                            })
                          }
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                        <select
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
                    </div>
                  </div>

                  {paymentMethodId && parsedTransaction.amount && parsedTransaction.transaction_date && (
                    <DuplicateDetection
                      amount={parsedTransaction.amount}
                      transactionDate={parsedTransaction.transaction_date}
                      paymentMethodId={paymentMethodId}
                    />
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setUploadedFile(null);
                        setParsedTransaction(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Transaction"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">Failed to extract transaction details</p>
                  <button
                    onClick={() => {
                      setUploadedFile(null);
                      setParsedTransaction(null);
                    }}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
