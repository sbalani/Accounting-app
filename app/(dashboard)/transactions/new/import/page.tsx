"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";

interface ParsedTransaction {
  amount: number;
  description: string | null;
  category: string | null;
  transaction_date: string;
}

export default function StatementImportPage() {
  const router = useRouter();
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"csv" | "pdf">("csv");

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
      // Determine file type from extension
      const extension = fileData.fileName.split(".").pop()?.toLowerCase();
      const type = extension === "pdf" ? "pdf" : "csv";
      setFileType(type);

      const response = await fetch(
        `/api/transactions/import?file_url=${encodeURIComponent(fileData.publicUrl)}&file_type=${type}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process statement");
      }

      const data = await response.json();
      setParsedTransactions(data.transactions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!paymentMethodId || parsedTransactions.length === 0) {
      setError("Please select a payment method and ensure transactions are parsed");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactions: parsedTransactions,
          payment_method_id: paymentMethodId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to import transactions");
      }

      const data = await response.json();
      alert(`Imported ${data.imported} transactions. ${data.duplicates} duplicates skipped.`);
      router.push("/transactions");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/transactions/new" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Add Transaction
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Import Bank Statement</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload a CSV or PDF bank statement to import transactions
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!uploadedFile ? (
            <div>
              <FileUpload
                type="statement"
                onUploadComplete={handleUploadComplete}
                onUploadError={(err) => setError(err)}
                accept=".csv,.pdf"
              />
            </div>
          ) : (
            <>
              {processing ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Processing statement...</p>
                </div>
              ) : parsedTransactions.length > 0 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethodId}
                      onChange={(e) => setPaymentMethodId(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    >
                      {paymentMethods.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h2 className="font-semibold">
                        Found {parsedTransactions.length} transactions
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Review the transactions below. Duplicates will be automatically skipped during import.
                      </p>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Description
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {parsedTransactions.map((transaction, index) => (
                            <tr key={index}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {transaction.transaction_date}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {transaction.description || "-"}
                              </td>
                              <td
                                className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                                  transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatAmount(transaction.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setUploadedFile(null);
                        setParsedTransactions([]);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing || !paymentMethodId}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {importing ? "Importing..." : `Import ${parsedTransactions.length} Transactions`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">No transactions found in the statement</p>
                  <button
                    onClick={() => {
                      setUploadedFile(null);
                      setParsedTransactions([]);
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
