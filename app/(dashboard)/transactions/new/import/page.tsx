"use client";

import { useState, useEffect } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import {
  CSVColumnMapping,
  AmountFormat,
  CSVImportConfig,
  ParsedTransaction,
} from "@/lib/utils/csv-parser";
import { formatCurrency } from "@/lib/utils/currency";

type ImportStep =
  | "upload"
  | "configure"
  | "review"
  | "importing";

export default function StatementImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("upload");
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"csv" | "pdf" | "xlsx">("csv");

  // CSV Analysis state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<CSVColumnMapping>({
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    merchant: null,
    category: null,
  });
  const [amountFormat, setAmountFormat] = useState<AmountFormat>("unified");
  const [saveMapping, setSaveMapping] = useState(false);

  // Parsed transactions
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Transfer rules
  const [transferRules, setTransferRules] = useState<any[]>([]);
  const [showTransferRulesForm, setShowTransferRulesForm] = useState(false);
  const [newTransferRule, setNewTransferRule] = useState({
    name: "",
    rule_type: "contains" as "contains" | "starts_with" | "ends_with" | "exact_match",
    match_value: "",
    transfer_direction: "to" as "to" | "from",
    target_payment_method_id: "",
    priority: 0,
  });
  const [creatingTransferRule, setCreatingTransferRule] = useState(false);
  
  // Payment method creation
  const [showPaymentMethodForm, setShowPaymentMethodForm] = useState(false);
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [newPaymentMethodType, setNewPaymentMethodType] = useState<"cash" | "bank_account" | "credit_card">("bank_account");
  const [newPaymentMethodBalance, setNewPaymentMethodBalance] = useState("");
  const [creatingPaymentMethod, setCreatingPaymentMethod] = useState(false);
  
  // Primary currency for formatting
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");

  useEffect(() => {
    fetchPaymentMethods();
    fetchTransferRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved CSV config when payment method changes in configure step
  useEffect(() => {
    const loadSavedConfig = async () => {
      if (step === "configure" && paymentMethodId && csvHeaders.length > 0) {
        try {
          const pmResponse = await fetch(`/api/payment-methods/${paymentMethodId}`);
          if (pmResponse.ok) {
            const pmData = await pmResponse.json();
            if (pmData.paymentMethod?.csv_import_config) {
              const savedConfig = pmData.paymentMethod.csv_import_config;
              // Use saved config if available, otherwise keep current state
              if (savedConfig.columnMapping) {
                setColumnMapping(savedConfig.columnMapping);
              }
              if (savedConfig.amountFormat) {
                setAmountFormat(savedConfig.amountFormat);
              }
              if (savedConfig.headerRow !== undefined && savedConfig.headerRow !== null) {
                setHeaderRow(savedConfig.headerRow);
              }
              setSaveMapping(true);
            } else {
              // Reset to defaults if no saved config
              setSaveMapping(false);
            }
          }
        } catch (err) {
          console.error("Error loading saved config:", err);
        }
      }
    };

    loadSavedConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodId, step, csvHeaders.length]);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
        if (data.paymentMethods?.length > 0 && !paymentMethodId) {
          setPaymentMethodId(data.paymentMethods[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  };

  const fetchTransferRules = async () => {
    try {
      const response = await fetch("/api/transfer-rules");
      if (response.ok) {
        const data = await response.json();
        setTransferRules(data.transferRules || []);
      }
    } catch (err) {
      console.error("Error fetching transfer rules:", err);
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

  const handleCreateTransferRule = async () => {
    if (!newTransferRule.name.trim() || !newTransferRule.match_value.trim() || !newTransferRule.target_payment_method_id) {
      setError("Please fill in all required fields");
      return;
    }

    setCreatingTransferRule(true);
    setError(null);

    try {
      const response = await fetch("/api/transfer-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newTransferRule),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create transfer rule");
      }

      const data = await response.json();
      
      // Add the new rule to the list
      setTransferRules([data.transferRule, ...transferRules]);
      // Apply the rule to transactions
      applyTransferRules([data.transferRule]);
      // Reset form
      setShowTransferRulesForm(false);
      setNewTransferRule({
        name: "",
        rule_type: "contains",
        match_value: "",
        transfer_direction: "to",
        target_payment_method_id: "",
        priority: 0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingTransferRule(false);
    }
  };

  const applyTransferRules = (rulesToApply?: any[]) => {
    const rules = rulesToApply || transferRules;
    if (rules.length === 0) return;

    setParsedTransactions((prev) =>
      prev.map((transaction) => {
        // Skip if already marked as transfer
        if (transaction.transaction_type === "transfer") {
          return transaction;
        }

        const description = (transaction.description || "").toLowerCase();
        
        for (const rule of rules) {
          if (!rule.is_active) continue;

          const matchValue = rule.match_value.toLowerCase();
          let matches = false;

          switch (rule.rule_type) {
            case "contains":
              matches = description.includes(matchValue);
              break;
            case "starts_with":
              matches = description.startsWith(matchValue);
              break;
            case "ends_with":
              matches = description.endsWith(matchValue);
              break;
            case "exact_match":
              matches = description === matchValue;
              break;
          }

          if (matches) {
            if (rule.transfer_direction === "to") {
              // Money going TO the target account (deposit)
              return {
                ...transaction,
                transaction_type: "transfer" as const,
                transfer_from_id: paymentMethodId,
                transfer_to_id: rule.target_payment_method_id,
              };
            } else {
              // Money coming FROM the target account (withdrawal)
              return {
                ...transaction,
                transaction_type: "transfer" as const,
                transfer_from_id: rule.target_payment_method_id,
                transfer_to_id: paymentMethodId,
              };
            }
          }
        }

        return transaction;
      })
    );
  };

  const handleApplyTransferRules = () => {
    applyTransferRules();
  };

  const handleUploadComplete = async (fileData: any) => {
    setUploadedFile(fileData);
    setError(null);

    // Determine file type from extension
    const extension = fileData.fileName.split(".").pop()?.toLowerCase();
    let type: "csv" | "pdf" | "xlsx" = "csv";
    if (extension === "pdf") {
      type = "pdf";
    } else if (extension === "xlsx" || extension === "xls") {
      type = "xlsx";
    } else {
      type = "csv";
    }
    setFileType(type);

    if (type === "csv" || type === "xlsx") {
      // Analyze CSV or XLSX
      setProcessing(true);
      try {
        const response = await fetch("/api/transactions/csv-analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            file_url: fileData.signedUrl || fileData.publicUrl,
            file_path: fileData.filePath || fileData.filePathFull,
            file_type: type,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to analyze CSV");
        }

        const data = await response.json();
        setCsvHeaders(data.headers || []);
        setCsvPreview(data.preview || []);
        setHeaderRow(data.headerRow || 0);
        setColumnMapping(data.suggestedMapping || columnMapping);

        // Check if payment method has saved mapping
        if (paymentMethodId) {
          const pmResponse = await fetch(`/api/payment-methods/${paymentMethodId}`);
          if (pmResponse.ok) {
            const pmData = await pmResponse.json();
            if (pmData.paymentMethod?.csv_import_config) {
              const savedConfig = pmData.paymentMethod.csv_import_config;
              setColumnMapping(savedConfig.columnMapping || columnMapping);
              setAmountFormat(savedConfig.amountFormat || "unified");
              setHeaderRow(savedConfig.headerRow || 0);
              setSaveMapping(true); // Auto-suggest saving if config exists
            }
          }
        }

        setStep("configure");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setProcessing(false);
      }
    } else {
      // PDF handling (existing flow)
      setProcessing(true);
      try {
        const fileUrl = fileData.signedUrl || fileData.publicUrl;
        if (!fileUrl) {
          throw new Error("File URL not available");
        }
        const response = await fetch(
          `/api/transactions/import?file_url=${encodeURIComponent(fileUrl)}&file_type=pdf`
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to process PDF");
        }

        const data = await response.json();
        const transactions = data.transactions || [];
        // Apply transfer rules to detected transactions
        setParsedTransactions(transactions);
        // Apply transfer rules after a short delay to ensure state is set
        setTimeout(() => {
          applyTransferRules();
        }, 100);
        setStep("review");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setProcessing(false);
      }
    }
  };

  const handlePreviewTransactions = async () => {
    if (!uploadedFile || !paymentMethodId) {
      setError("Please select a payment method");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const config: CSVImportConfig = {
        headerRow,
        columnMapping,
        amountFormat,
      };

      const fileUrl = uploadedFile.signedUrl || uploadedFile.publicUrl;
      if (!fileUrl) {
        throw new Error("File URL not available");
      }
      const response = await fetch(
        `/api/transactions/import?file_url=${encodeURIComponent(
          fileUrl
        )}&file_type=${fileType}&csv_config=${encodeURIComponent(JSON.stringify(config))}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to parse transactions");
      }

      const data = await response.json();
      setParsedTransactions(data.transactions || []);
      setStep("review");
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
      // Save mapping if requested
      if (saveMapping && (fileType === "csv" || fileType === "xlsx")) {
        const config: CSVImportConfig = {
          headerRow,
          columnMapping,
          amountFormat,
        };

        await fetch(`/api/payment-methods/${paymentMethodId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            csv_import_config: config,
          }),
        });
      }

      // Import transactions
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
    return formatCurrency(amount, primaryCurrency);
  };

  const canProceedToPreview = () => {
    if (amountFormat === "separate") {
      return columnMapping.date !== null &&
        (columnMapping.debit !== null || columnMapping.credit !== null);
    } else {
      return columnMapping.date !== null && columnMapping.amount !== null;
    }
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
            Upload a CSV, XLSX, or PDF bank statement to import transactions
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Step indicators */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className={`flex items-center ${step === "upload" ? "text-blue-600" : step === "configure" || step === "review" || step === "importing" ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "upload" ? "bg-blue-600 text-white" : step === "configure" || step === "review" || step === "importing" ? "bg-green-600 text-white" : "bg-gray-300 text-gray-600"}`}>
                1
              </div>
              <span className="ml-2 text-sm font-medium">Upload</span>
            </div>
            {(fileType === "csv" || fileType === "xlsx") && (
              <>
                <div className="w-8 h-px bg-gray-300"></div>
                <div className={`flex items-center ${step === "configure" ? "text-blue-600" : step === "review" || step === "importing" ? "text-green-600" : "text-gray-400"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "configure" ? "bg-blue-600 text-white" : step === "review" || step === "importing" ? "bg-green-600 text-white" : "bg-gray-300 text-gray-600"}`}>
                    2
                  </div>
                  <span className="ml-2 text-sm font-medium">Configure</span>
                </div>
              </>
            )}
            <div className="w-8 h-px bg-gray-300"></div>
            <div className={`flex items-center ${step === "review" ? "text-blue-600" : step === "importing" ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "review" ? "bg-blue-600 text-white" : step === "importing" ? "bg-green-600 text-white" : "bg-gray-300 text-gray-600"}`}>
                {(fileType === "csv" || fileType === "xlsx") ? "3" : "2"}
              </div>
              <span className="ml-2 text-sm font-medium">Review</span>
            </div>
          </div>

          {/* Upload Step */}
          {step === "upload" && (
            <div>
              <FileUpload
                type="statement"
                onUploadComplete={handleUploadComplete}
                onUploadError={(err) => setError(err)}
                accept=".csv,.pdf,.xlsx,.xls"
              />
              {processing && (
                <div className="mt-4 text-center py-8">
                  <p className="text-gray-600">Analyzing statement...</p>
                </div>
              )}
            </div>
          )}

          {/* Configure Step (CSV/XLSX only) */}
          {step === "configure" && (fileType === "csv" || fileType === "xlsx") && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method *
                </label>
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                >
                  <option value="">Select a payment method</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* CSV/XLSX Preview */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{fileType === "xlsx" ? "Excel" : "CSV"} Preview</h3>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {csvHeaders.map((header, index) => (
                          <th
                            key={index}
                            className={`px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                              index === headerRow ? "bg-blue-100" : ""
                            }`}
                          >
                            {header || `Column ${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {csvPreview.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 text-sm text-gray-900">
                              {cell || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Row {headerRow + 1} is detected as the header row
                </p>
              </div>

              {/* Column Mapping */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Map Columns</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date *
                      </label>
                      <select
                        value={columnMapping.date ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            date: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select column</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <select
                        value={columnMapping.description ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            description: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select column</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Merchant
                      </label>
                      <select
                        value={columnMapping.merchant ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            merchant: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">None</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={columnMapping.category ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            category: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">None</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Amount Format */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Amount Format *</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="unified"
                      checked={amountFormat === "unified"}
                      onChange={(e) => {
                        setAmountFormat(e.target.value as AmountFormat);
                        // Clear separate column mappings
                        if (amountFormat === "separate") {
                          setColumnMapping({
                            ...columnMapping,
                            debit: null,
                            credit: null,
                          });
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Unified (positive = income, negative = expense)
                    </span>
                  </label>
                  {amountFormat === "unified" && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount Column *
                      </label>
                      <select
                        value={columnMapping.amount ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            amount: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select column</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="unified_reverse"
                      checked={amountFormat === "unified_reverse"}
                      onChange={(e) => {
                        setAmountFormat(e.target.value as AmountFormat);
                        // Clear separate column mappings
                        if (amountFormat === "separate") {
                          setColumnMapping({
                            ...columnMapping,
                            debit: null,
                            credit: null,
                          });
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Unified Reverse (positive = expense, negative = income) - for credit cards
                    </span>
                  </label>
                  {amountFormat === "unified_reverse" && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount Column *
                      </label>
                      <select
                        value={columnMapping.amount ?? ""}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            amount: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select column</option>
                        {csvHeaders.map((header, index) => (
                          <option key={index} value={index}>
                            Column {index + 1}: {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="separate"
                      checked={amountFormat === "separate"}
                      onChange={(e) => {
                        setAmountFormat(e.target.value as AmountFormat);
                        // Clear unified amount mapping
                        if (amountFormat !== "separate") {
                          setColumnMapping({
                            ...columnMapping,
                            amount: null,
                          });
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Separate Debit & Credit Columns
                    </span>
                  </label>
                  {amountFormat === "separate" && (
                    <div className="ml-6 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Debit Column *
                        </label>
                        <select
                          value={columnMapping.debit ?? ""}
                          onChange={(e) =>
                            setColumnMapping({
                              ...columnMapping,
                              debit: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="">Select column</option>
                          {csvHeaders.map((header, index) => (
                            <option key={index} value={index}>
                              Column {index + 1}: {header}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Credit Column *
                        </label>
                        <select
                          value={columnMapping.credit ?? ""}
                          onChange={(e) =>
                            setColumnMapping({
                              ...columnMapping,
                              credit: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="">Select column</option>
                          {csvHeaders.map((header, index) => (
                            <option key={index} value={index}>
                              Column {index + 1}: {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Save Mapping Option */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="saveMapping"
                  checked={saveMapping}
                  onChange={(e) => setSaveMapping(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="saveMapping" className="text-sm text-gray-700">
                  Save this mapping for future imports from this payment method
                </label>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setStep("upload");
                    setUploadedFile(null);
                    setParsedTransactions([]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePreviewTransactions}
                  disabled={processing || !canProceedToPreview() || !paymentMethodId}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {processing ? "Processing..." : "Preview Transactions"}
                </button>
              </div>
            </div>
          )}

          {/* Review Step */}
          {step === "review" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method (Source Account)
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                    disabled={importing}
                  >
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowPaymentMethodForm(true)}
                    className="px-3 py-2 text-sm text-blue-600 hover:text-blue-500 border border-blue-300 rounded-md hover:bg-blue-50"
                    disabled={importing}
                  >
                    + Add Account
                  </button>
                </div>
              </div>

              {/* Transfer Rules Section */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Transfer Rules</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically detect transfers based on description patterns
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleApplyTransferRules}
                      className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
                      disabled={importing || transferRules.length === 0}
                    >
                      Apply Rules
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTransferRulesForm(true)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      disabled={importing}
                    >
                      + Add Rule
                    </button>
                  </div>
                </div>
                {transferRules.length > 0 && (
                  <div className="space-y-1">
                    {transferRules.map((rule) => (
                      <div key={rule.id} className="text-xs text-gray-600 bg-white p-2 rounded border">
                        <span className="font-medium">{rule.name}:</span> {rule.rule_type} &quot;{rule.match_value}&quot; → {rule.transfer_direction === "to" ? "To" : "From"} {paymentMethods.find(pm => pm.id === rule.target_payment_method_id)?.name || "Unknown"}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Method Creation Form */}
              {showPaymentMethodForm && (
                <div className="border rounded-lg p-4 bg-white">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Create New Account</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Name</label>
                      <input
                        type="text"
                        value={newPaymentMethodName}
                        onChange={(e) => setNewPaymentMethodName(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="e.g., Flexible Cash Funds"
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
                        className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreatePaymentMethod}
                        disabled={creatingPaymentMethod}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingPaymentMethod ? "Creating..." : "Create"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transfer Rule Creation Form */}
              {showTransferRulesForm && (
                <div className="border rounded-lg p-4 bg-white">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Create Transfer Rule</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Rule Name</label>
                      <input
                        type="text"
                        value={newTransferRule.name}
                        onChange={(e) => setNewTransferRule({ ...newTransferRule, name: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="e.g., To Flexible Cash Funds"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Match Type</label>
                        <select
                          value={newTransferRule.rule_type}
                          onChange={(e) => setNewTransferRule({ ...newTransferRule, rule_type: e.target.value as any })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="contains">Contains</option>
                          <option value="starts_with">Starts With</option>
                          <option value="ends_with">Ends With</option>
                          <option value="exact_match">Exact Match</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Direction</label>
                        <select
                          value={newTransferRule.transfer_direction}
                          onChange={(e) => setNewTransferRule({ ...newTransferRule, transfer_direction: e.target.value as any })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="to">To Account (Deposit)</option>
                          <option value="from">From Account (Withdrawal)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Match Value</label>
                      <input
                        type="text"
                        value={newTransferRule.match_value}
                        onChange={(e) => setNewTransferRule({ ...newTransferRule, match_value: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="e.g., To Flexible Cash Funds"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Target Account</label>
                      <select
                        value={newTransferRule.target_payment_method_id}
                        onChange={(e) => setNewTransferRule({ ...newTransferRule, target_payment_method_id: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select account</option>
                        {paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTransferRulesForm(false);
                          setNewTransferRule({
                            name: "",
                            rule_type: "contains",
                            match_value: "",
                            transfer_direction: "to",
                            target_payment_method_id: "",
                            priority: 0,
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateTransferRule}
                        disabled={creatingTransferRule}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingTransferRule ? "Creating..." : "Create Rule"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h2 className="font-semibold">
                    Found {parsedTransactions.length} transactions
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and edit transactions below. Mark transfers and select accounts. Duplicates will be automatically skipped during import.
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
                          Merchant
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transfer
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {parsedTransactions.map((transaction, index) => (
                        <TransactionRow
                          key={index}
                          transaction={transaction}
                          index={index}
                          paymentMethods={paymentMethods}
                          paymentMethodId={paymentMethodId}
                          onUpdate={(updated) => {
                            setParsedTransactions((prev) =>
                              prev.map((t, i) => (i === index ? updated : t))
                            );
                          }}
                          onCreatePaymentMethod={() => setShowPaymentMethodForm(true)}
                          primaryCurrency={primaryCurrency}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(fileType === "csv" || fileType === "xlsx") && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="saveMappingReview"
                    checked={saveMapping}
                    onChange={(e) => setSaveMapping(e.target.checked)}
                    className="mr-2"
                    disabled={importing}
                  />
                  <label htmlFor="saveMappingReview" className="text-sm text-gray-700">
                    Save this mapping for future imports from this payment method
                  </label>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    if (fileType === "csv" || fileType === "xlsx") {
                      setStep("configure");
                    } else {
                      setStep("upload");
                      setUploadedFile(null);
                      setParsedTransactions([]);
                    }
                  }}
                  disabled={importing}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {(fileType === "csv" || fileType === "xlsx") ? "Back to Configure" : "Cancel"}
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !paymentMethodId}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {importing ? "Importing..." : `Import ${parsedTransactions.length} Transactions`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Transaction Row Component for editable transactions
function TransactionRow({
  transaction,
  index,
  paymentMethods,
  paymentMethodId,
  onUpdate,
  onCreatePaymentMethod,
  primaryCurrency,
}: {
  transaction: ParsedTransaction;
  index: number;
  paymentMethods: any[];
  paymentMethodId: string;
  onUpdate: (transaction: ParsedTransaction) => void;
  onCreatePaymentMethod: () => void;
  primaryCurrency: string;
}) {
  const [isTransfer, setIsTransfer] = useState(transaction.transaction_type === "transfer");
  const [transferFrom, setTransferFrom] = useState(transaction.transfer_from_id || paymentMethodId);
  const [transferTo, setTransferTo] = useState(transaction.transfer_to_id || "");

  useEffect(() => {
    setIsTransfer(transaction.transaction_type === "transfer");
    setTransferFrom(transaction.transfer_from_id || paymentMethodId);
    setTransferTo(transaction.transfer_to_id || "");
  }, [transaction, paymentMethodId]);

  const handleTransferToggle = (checked: boolean) => {
    setIsTransfer(checked);
    if (checked) {
      onUpdate({
        ...transaction,
        transaction_type: "transfer",
        transfer_from_id: transferFrom,
        transfer_to_id: transferTo || paymentMethodId,
      });
    } else {
      // Determine type based on amount
      const type = transaction.amount >= 0 ? "income" : "expense";
      onUpdate({
        ...transaction,
        transaction_type: type,
        transfer_from_id: null,
        transfer_to_id: null,
      });
    }
  };

  const handleTransferFromChange = (value: string) => {
    setTransferFrom(value);
    onUpdate({
      ...transaction,
      transfer_from_id: value,
    });
  };

  const handleTransferToChange = (value: string) => {
    setTransferTo(value);
    onUpdate({
      ...transaction,
      transfer_to_id: value,
    });
  };

  const formatAmount = (amount: number) => {
    return formatCurrency(amount, primaryCurrency);
  };

  return (
    <tr className={isTransfer ? "bg-blue-50" : ""}>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
        {transaction.transaction_date}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {transaction.description || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {transaction.merchant || "-"}
      </td>
      <td
        className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
          isTransfer ? "text-blue-600" : transaction.amount >= 0 ? "text-green-600" : "text-red-600"
        }`}
      >
        {formatAmount(Math.abs(transaction.amount))}
      </td>
      <td className="px-4 py-3 text-sm">
        {isTransfer ? (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            Transfer
          </span>
        ) : transaction.amount >= 0 ? (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
            Income
          </span>
        ) : (
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
            Expense
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isTransfer}
              onChange={(e) => handleTransferToggle(e.target.checked)}
              className="mr-1"
            />
            <span className="text-xs text-gray-700">Mark as Transfer</span>
          </label>
          {isTransfer && (
            <div className="space-y-1 ml-5">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">From:</label>
                <select
                  value={transferFrom}
                  onChange={(e) => handleTransferFromChange(e.target.value)}
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">To:</label>
                <div className="flex items-center space-x-1">
                  <select
                    value={transferTo}
                    onChange={(e) => handleTransferToChange(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select account</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onCreatePaymentMethod}
                    className="text-xs text-blue-600 hover:text-blue-500 px-1"
                    title="Create new account"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
