"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import DuplicateDetection from "@/components/DuplicateDetection";

interface ParsedTransaction {
  amount: number;
  description: string | null;
  merchant?: string | null;
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
  const [categories, setCategories] = useState<any[]>([]);
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);
  const [showPaymentMethodForm, setShowPaymentMethodForm] = useState(false);
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [newPaymentMethodType, setNewPaymentMethodType] = useState<"cash" | "bank_account" | "credit_card">("bank_account");
  const [newPaymentMethodBalance, setNewPaymentMethodBalance] = useState("");
  const [creatingPaymentMethod, setCreatingPaymentMethod] = useState(false);

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

  const handleCreatePaymentMethod = async () => {
    if (!newPaymentMethodName.trim()) {
      return;
    }

    setCreatingPaymentMethod(true);
    setError(null);

    try {
      const response = await fetch("/api/payment-methods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newPaymentMethodName.trim(),
          type: newPaymentMethodType,
          initial_balance: parseFloat(newPaymentMethodBalance) || 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create payment method");
      }

      const data = await response.json();
      
      // Add the new payment method to the list
      setPaymentMethods([data.paymentMethod, ...paymentMethods]);
      // Select the newly created payment method
      setPaymentMethodId(data.paymentMethod.id);
      // Reset form
      setShowPaymentMethodForm(false);
      setNewPaymentMethodName("");
      setNewPaymentMethodType("bank_account");
      setNewPaymentMethodBalance("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingPaymentMethod(false);
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
          filePath: fileData.filePathFull || `receipts/${fileData.filePath}`,
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
      const amountValue = parseFloat(parsedTransaction.amount.toString());
      if (isNaN(amountValue) || amountValue === 0) {
        throw new Error("Amount must be a non-zero number");
      }

      // Calculate final amount based on transaction type
      const finalAmount = transactionType === "expense" ? -Math.abs(amountValue) : Math.abs(amountValue);

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          amount: finalAmount,
          description: parsedTransaction.description?.trim() || null,
          merchant: parsedTransaction.merchant?.trim() || null,
          category: parsedTransaction.category || null,
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
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                          <button
                            type="button"
                            onClick={() => setShowPaymentMethodForm(true)}
                            className="text-sm text-blue-600 hover:text-blue-500"
                          >
                            + Add New
                          </button>
                        </div>
                        {showPaymentMethodForm ? (
                          <div className="mt-1 p-4 border border-gray-300 rounded-md bg-gray-50">
                            <h3 className="text-sm font-medium text-gray-900 mb-3">Create Payment Method</h3>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Name</label>
                                <input
                                  type="text"
                                  value={newPaymentMethodName}
                                  onChange={(e) => setNewPaymentMethodName(e.target.value)}
                                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                  placeholder="e.g., Chase Checking"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Type</label>
                                <select
                                  value={newPaymentMethodType}
                                  onChange={(e) => setNewPaymentMethodType(e.target.value as any)}
                                  className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                >
                                  <option value="cash">Cash</option>
                                  <option value="bank_account">Bank Account</option>
                                  <option value="credit_card">Credit Card</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Initial Balance</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={newPaymentMethodBalance}
                                  onChange={(e) => setNewPaymentMethodBalance(e.target.value)}
                                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="flex justify-end space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowPaymentMethodForm(false);
                                    setNewPaymentMethodName("");
                                    setNewPaymentMethodType("bank_account");
                                    setNewPaymentMethodBalance("");
                                  }}
                                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCreatePaymentMethod}
                                  disabled={!newPaymentMethodName || creatingPaymentMethod}
                                  className="px-3 py-1.5 text-sm border border-transparent rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {creatingPaymentMethod ? "Creating..." : "Create"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
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
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={parsedTransaction.amount}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              amount: parseFloat(e.target.value) || 0,
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
                        <label className="block text-sm font-medium text-gray-700">Merchant/Vendor</label>
                        <input
                          type="text"
                          value={parsedTransaction.merchant || ""}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              merchant: e.target.value,
                            })
                          }
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder="Store or vendor name (optional)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Category</label>
                        <select
                          value={parsedTransaction.category || ""}
                          onChange={(e) =>
                            setParsedTransaction({
                              ...parsedTransaction,
                              category: e.target.value,
                            })
                          }
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
                    </div>
                  </div>

                  {paymentMethodId && parsedTransaction.amount && parsedTransaction.transaction_date && (
                    <DuplicateDetection
                      amount={Math.abs(parsedTransaction.amount)}
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
