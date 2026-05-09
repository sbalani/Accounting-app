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
  currency?: string | null;
}

interface QueueItem {
  id: string;
  file: any;
  status: "uploaded" | "processing" | "parsed" | "error";
  parsed?: ParsedTransaction | null;
  error?: string | null;
  payment_method_id?: string;
  include?: boolean;
  previewOpen?: boolean;
}

export default function ReceiptUploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "processing" | "review">("upload");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState("USD");
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
        if (data.primaryCurrency) {
          setPrimaryCurrency(data.primaryCurrency);
        }
      }
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  };

  const handleUploadComplete = async (fileData: any) => {
    setError(null);
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setQueue((prev) => [
      ...prev,
      {
        id,
        file: fileData,
        status: "uploaded",
        parsed: null,
        error: null,
        payment_method_id: paymentMethodId || undefined,
        include: true,
        previewOpen: false,
      },
    ]);
  };

  const processQueueItem = async (item: QueueItem) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, status: "processing", error: null } : q
      )
    );

    try {
      const response = await fetch("/api/openai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: item.file.filePathFull || item.file.filePath,
          imageUrl: item.file.signedUrl || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process receipt");
      }

      const data = await response.json();
      const parsed = data.transaction as ParsedTransaction;

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "parsed", parsed } : q
        )
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "error", error: err.message || "Failed to parse" }
            : q
        )
      );
    }
  };

  const processQueue = async () => {
    if (queue.length === 0) return;
    // Switch straight to review — items update in place as OCR finishes
    setMode("review");
    setError(null);

    const pending = queue.filter((q) => q.status !== "parsed");
    for (const item of pending) {
      await processQueueItem(item);
    }
  };

  const updateQueueItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const toSave = queue.filter(
        (q) => q.include !== false && q.status === "parsed" && q.parsed
      );
      if (toSave.length === 0) {
        throw new Error("No parsed receipts selected to save");
      }

      for (const item of toSave) {
        const tx = item.parsed!;
        const pmId = item.payment_method_id || paymentMethodId;
        if (!pmId || !tx.amount || !tx.transaction_date) {
          throw new Error("Missing required fields in one or more transactions");
        }

        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_method_id: pmId,
            amount: tx.amount,
            description: tx.description,
            merchant: tx.merchant || null,
            category: tx.category,
            transaction_date: tx.transaction_date,
            currency: tx.currency || primaryCurrency,
            source: "receipt",
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to save one or more transactions");
        }
      }

      router.push("/transactions");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Upload step ─────────────────────────────────────────────────────────────
  const uploadView = (
    <div className="space-y-4">
      <FileUpload
        type="receipt"
        onUploadComplete={handleUploadComplete}
        onUploadError={(err) => setError(err)}
        accept="image/*"
        multiple
      />

      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Default Payment Method
          </label>
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {pm.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            You can override the payment method per receipt during review.
          </p>
        </div>

        {queue.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Queue: <span className="font-medium">{queue.length}</span> receipt(s)
              </p>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="text-xs text-red-600 hover:text-red-500"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1">
              {queue.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between text-xs bg-white border rounded px-3 py-2"
                >
                  <span className="text-gray-700 truncate">
                    {q.file.fileName || q.file.filePath || "Receipt"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(q.id)}
                    className="ml-2 text-red-600 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Upload one or more receipts to build a queue.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={processQueue}
          disabled={queue.length === 0}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Process {queue.length} Receipt{queue.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );

  // ── Review / live-processing step ───────────────────────────────────────────
  const processingCount = queue.filter((q) => q.status === "processing").length;
  const pendingCount = queue.filter((q) => q.status === "uploaded").length;
  const stillWorking = processingCount > 0 || pendingCount > 0;

  const reviewView = (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">
              {stillWorking ? "Processing receipts…" : "Review & Approve"}
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {stillWorking
                ? `${processingCount > 0 ? `Processing 1 receipt` : ""}${pendingCount > 0 ? `, ${pendingCount} remaining` : ""}`
                : "Confirm each extracted entry before saving to your transactions."}
            </p>
          </div>
          {stillWorking && (
            <svg
              className="animate-spin h-5 w-5 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {queue.map((item) => {
          const previewUrl = item.file.signedUrl || null;
          const isOpen = item.previewOpen === true;

          return (
            <div key={item.id} className="border rounded-lg overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.file.fileName || item.file.filePath || "Receipt"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.status === "parsed"
                      ? "Parsed"
                      : item.status === "processing"
                        ? "Processing…"
                        : item.status === "error"
                          ? "Error"
                          : "Queued"}
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        updateQueueItem(item.id, { previewOpen: !isOpen })
                      }
                      className="text-xs text-blue-600 hover:text-blue-500"
                    >
                      {isOpen ? "Hide receipt" : "View receipt"}
                    </button>
                  )}
                  <label className="flex items-center space-x-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={item.include !== false}
                      onChange={(e) =>
                        updateQueueItem(item.id, { include: e.target.checked })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Include</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(item.id)}
                    className="text-xs text-red-600 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Card body */}
              <div className="p-4">
                {/* Receipt image preview */}
                {previewUrl && isOpen && (
                  <div className="mb-4">
                    <img
                      src={previewUrl}
                      alt="Receipt"
                      className="max-h-80 w-auto rounded border border-gray-200 object-contain mx-auto"
                    />
                  </div>
                )}

                {item.status === "processing" && (
                  <div className="flex items-center space-x-2 text-sm text-gray-500 py-4">
                    <svg
                      className="animate-spin h-4 w-4 text-blue-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Extracting transaction details…</span>
                  </div>
                )}

                {item.status === "uploaded" && (
                  <p className="text-sm text-gray-400 py-2">Queued — waiting to process</p>
                )}

                {item.status === "error" && (
                  <div className="text-sm text-red-600 py-2">
                    {item.error || "Failed to parse receipt"}
                  </div>
                )}

                {item.status === "parsed" && item.parsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.parsed.amount ?? ""}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              amount: parseFloat(e.target.value || "0"),
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700">Date</label>
                      <input
                        type="date"
                        value={item.parsed.transaction_date || ""}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              transaction_date: e.target.value,
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700">Description</label>
                      <input
                        type="text"
                        value={item.parsed.description || ""}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              description: e.target.value,
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700">Merchant</label>
                      <input
                        type="text"
                        value={item.parsed.merchant || ""}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              merchant: e.target.value || null,
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700">Category</label>
                      <input
                        type="text"
                        value={item.parsed.category || ""}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              category: e.target.value || null,
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700">Currency</label>
                      <input
                        type="text"
                        value={item.parsed.currency || primaryCurrency}
                        maxLength={3}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            parsed: {
                              ...item.parsed!,
                              currency: e.target.value.toUpperCase() || null,
                            },
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm uppercase"
                        placeholder={primaryCurrency}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700">Payment Method</label>
                      <select
                        value={item.payment_method_id || paymentMethodId}
                        onChange={(e) =>
                          updateQueueItem(item.id, { payment_method_id: e.target.value })
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Duplicate detection — only when exactly one included+parsed item */}
      {(() => {
        const included = queue.filter(
          (q) => q.include !== false && q.status === "parsed" && q.parsed
        );
        if (included.length !== 1) return null;
        const only = included[0];
        if (!only.parsed) return null;
        const pmId = only.payment_method_id || paymentMethodId;
        if (!pmId || !only.parsed.amount || !only.parsed.transaction_date) return null;
        return (
          <DuplicateDetection
            amount={only.parsed.amount}
            transactionDate={only.parsed.transaction_date}
            paymentMethodId={pmId}
          />
        );
      })()}

      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={() => {
            setMode("upload");
            setQueue([]);
          }}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          disabled={saving}
        >
          Start Over
        </button>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            disabled={saving}
          >
            Add More Receipts
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || stillWorking}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : stillWorking ? "Processing…" : "Save Selected"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link
            href="/transactions/new"
            className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block"
          >
            ← Back to Add Transaction
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Upload Receipt</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload one or more receipt images to automatically extract transaction details.
            HEIC photos from iPhone are supported.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {mode === "upload" ? uploadView : reviewView}
        </div>
      </div>
    </div>
  );
}
