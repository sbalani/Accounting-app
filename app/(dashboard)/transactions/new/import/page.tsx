"use client";

import { useState, useEffect } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import AutocompleteDropdown from "@/components/AutocompleteDropdown";
import {
  CSVColumnMapping,
  AmountFormat,
  NumberFormat,
  CSVImportConfig,
  ParsedTransaction,
  suggestColumnMapping,
} from "@/lib/utils/csv-parser";
import { formatCurrency } from "@/lib/utils/currency";

type ImportStep =
  | "upload"
  | "configure"
  | "merchants"
  | "review"
  | "importing";

const normalizeMerchantName = (value: string) => value.trim().toLowerCase();

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

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
  const [detectedHeaderRow, setDetectedHeaderRow] = useState<number>(0);
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
  const [numberFormat, setNumberFormat] = useState<NumberFormat>("us");
  const [saveMapping, setSaveMapping] = useState(false);

  // Parsed transactions
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Merchant mapping
  const [merchants, setMerchants] = useState<any[]>([]);
  const [statementMerchants, setStatementMerchants] = useState<
    { key: string; name: string }[]
  >([]);
  const [merchantMapping, setMerchantMapping] = useState<Record<string, string | null>>({});
  const [creatingMerchants, setCreatingMerchants] = useState<Record<string, boolean>>({});
  const [creatingAllMerchants, setCreatingAllMerchants] = useState(false);
  const [statementDateRange, setStatementDateRange] = useState<{
    min: string | null;
    max: string | null;
  } | null>(null);
  
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
    fetchMerchants();
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

  useEffect(() => {
    if (parsedTransactions.length === 0) {
      setStatementMerchants([]);
      setMerchantMapping({});
      setStatementDateRange(null);
      return;
    }

    const merchantMap = new Map<string, string>();
    let minDate: string | null = null;
    let maxDate: string | null = null;

    parsedTransactions.forEach((transaction) => {
      if (transaction.transaction_date) {
        if (!minDate || transaction.transaction_date < minDate) {
          minDate = transaction.transaction_date;
        }
        if (!maxDate || transaction.transaction_date > maxDate) {
          maxDate = transaction.transaction_date;
        }
      }

      const merchantName = transaction.merchant?.trim();
      if (merchantName) {
        const key = normalizeMerchantName(merchantName);
        if (!merchantMap.has(key)) {
          merchantMap.set(key, merchantName);
        }
      }
    });

    setStatementDateRange({ min: minDate, max: maxDate });

    const uniqueMerchants = Array.from(merchantMap.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setStatementMerchants(uniqueMerchants);
    setMerchantMapping((prev) => {
      const next: Record<string, string | null> = {};
      uniqueMerchants.forEach(({ key }) => {
        if (prev[key] !== undefined) {
          next[key] = prev[key];
          return;
        }
        const match = merchants.find(
          (merchant) => normalizeMerchantName(merchant.name) === key
        );
        next[key] = match ? match.id : null;
      });
      return next;
    });
  }, [parsedTransactions, merchants]);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
        if (data.paymentMethods?.length > 0) {
          if (!paymentMethodId) {
            setPaymentMethodId(data.paymentMethods[0].id);
            // Set currency from first payment method
            if (data.paymentMethods[0].currency) {
              setPrimaryCurrency(data.paymentMethods[0].currency);
            }
          } else {
            // Update currency for currently selected payment method
            const selectedPM = data.paymentMethods.find((pm: any) => pm.id === paymentMethodId);
            if (selectedPM?.currency) {
              setPrimaryCurrency(selectedPM.currency);
            }
          }
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

  const fetchMerchants = async () => {
    try {
      const response = await fetch("/api/merchants");
      if (response.ok) {
        const data = await response.json();
        setMerchants(data.merchants || []);
      }
    } catch (err) {
      console.error("Error fetching merchants:", err);
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

  const createMerchantByName = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const existingMerchant = merchants.find(
      (merchant) => normalizeMerchantName(merchant.name) === normalizeMerchantName(trimmedName)
    );
    if (existingMerchant) {
      return existingMerchant;
    }

    try {
      const response = await fetch("/api/merchants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create merchant");
      }

      const data = await response.json();
      const merchant = data.merchant;
      setMerchants((prev) => {
        const exists = prev.some(
          (item) => normalizeMerchantName(item.name) === normalizeMerchantName(merchant.name)
        );
        return exists ? prev : [...prev, merchant];
      });
      return merchant;
    } catch (err: any) {
      setError(err.message || "Failed to create merchant");
      return null;
    }
  };

  const handleMerchantMappingChange = (key: string, merchantId: string | null) => {
    setMerchantMapping((prev) => ({ ...prev, [key]: merchantId }));
  };

  const handleCreateMerchantForMapping = async (name: string, key: string) => {
    if (creatingMerchants[key]) return;

    setCreatingMerchants((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      const merchant = await createMerchantByName(name);
      if (merchant) {
        setMerchantMapping((prev) => ({ ...prev, [key]: merchant.id }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingMerchants((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCreateAllMerchants = async () => {
    const missing = statementMerchants.filter(
      (merchant) => !merchantMapping[merchant.key]
    );
    if (missing.length === 0 || creatingAllMerchants) return;

    setCreatingAllMerchants(true);
    setError(null);
    try {
      for (const merchant of missing) {
        const created = await createMerchantByName(merchant.name);
        if (created) {
          setMerchantMapping((prev) => ({ ...prev, [merchant.key]: created.id }));
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingAllMerchants(false);
    }
  };

  const applyMerchantMapping = () => {
    const mapping = merchantMapping;
    setParsedTransactions((prev) =>
      prev.map((transaction) => {
        const merchantName = transaction.merchant?.trim();
        if (!merchantName) {
          return transaction;
        }
        const key = normalizeMerchantName(merchantName);
        const mappedId = mapping[key] ?? null;
        return {
          ...transaction,
          merchant_id: mappedId,
        };
      })
    );
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
        setCsvPreview(data.preview || []);
        const detectedRow = data.headerRow || 0;
        setDetectedHeaderRow(detectedRow);
        setHeaderRow(detectedRow);
        
        // Extract headers from the detected header row
        const previewData = data.preview || [];
        const headerRowData = previewData[detectedRow] || [];
        const headers = headerRowData.map((cell: any) => String(cell || ""));
        setCsvHeaders(headers);
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
              setNumberFormat(savedConfig.numberFormat || "us");
              // Use saved header row if available, otherwise use detected
              const savedHeaderRow = savedConfig.headerRow !== undefined ? savedConfig.headerRow : detectedRow;
              setHeaderRow(savedHeaderRow);
              // Update headers based on saved header row
              const savedHeaderRowData = previewData[savedHeaderRow] || [];
              const savedHeaders = savedHeaderRowData.map((cell: any) => String(cell || ""));
              setCsvHeaders(savedHeaders);
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
        numberFormat,
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
      const transactions = data.transactions || [];
      setParsedTransactions(transactions);

      const hasMerchantValues = transactions.some(
        (transaction: ParsedTransaction) => transaction.merchant?.trim()
      );
      const shouldShowMerchantStep =
        (fileType === "csv" || fileType === "xlsx") &&
        columnMapping.merchant !== null;

      if (shouldShowMerchantStep && hasMerchantValues) {
        setStep("merchants");
      } else {
        setStep("review");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleLinkRows = (i: number, j: number) => {
    const pairId = `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const a = parsedTransactions[i];
    const b = parsedTransactions[j];
    const aNeg = a.amount < 0;
    const bNeg = b.amount < 0;
    let iSide: "this_account" | "other_account";
    let jSide: "this_account" | "other_account";
    if (aNeg && !bNeg) {
      iSide = "other_account";
      jSide = "this_account";
    } else if (!aNeg && bNeg) {
      iSide = "this_account";
      jSide = "other_account";
    } else {
      iSide = "this_account";
      jSide = "other_account";
    }
    setParsedTransactions((prev) =>
      prev.map((t, idx) => {
        if (idx === i)
          return {
            ...t,
            transfer_pair_id: pairId,
            transfer_belongs_to: iSide,
            transaction_type: "transfer" as const,
            transfer_from_id: null,
            transfer_to_id: null,
          };
        if (idx === j)
          return {
            ...t,
            transfer_pair_id: pairId,
            transfer_belongs_to: jSide,
            transaction_type: "transfer" as const,
            transfer_from_id: null,
            transfer_to_id: null,
          };
        return t;
      })
    );
  };

  const handleUnlinkPair = (pairId: string) => {
    setParsedTransactions((prev) =>
      prev.map((t) =>
        t.transfer_pair_id === pairId
          ? {
              ...t,
              transfer_pair_id: null,
              transfer_belongs_to: null,
              transfer_other_account_id: null,
              transaction_type: (t.amount >= 0 ? "income" : "expense") as "income" | "expense",
              transfer_from_id: null,
              transfer_to_id: null,
            }
          : t
      )
    );
  };

  const handlePairAssignment = (
    pairId: string,
    thisRowIndex: number,
    otherRowIndex: number,
    otherAccountId: string | null
  ) => {
    setParsedTransactions((prev) =>
      prev.map((t, i) => {
        if (t.transfer_pair_id !== pairId) return t;
        if (i === thisRowIndex)
          return {
            ...t,
            transfer_belongs_to: "this_account" as const,
            transfer_other_account_id: null,
          };
        if (i === otherRowIndex)
          return {
            ...t,
            transfer_belongs_to: "other_account" as const,
            transfer_other_account_id: otherAccountId,
          };
        return t;
      })
    );
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
          numberFormat,
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

      const toImport = parsedTransactions.filter((t) => !t.excluded);
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactions: toImport,
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

  const selectedPaymentMethod = paymentMethods.find(
    (pm) => pm.id === paymentMethodId
  );
  const lastStatementImportedThrough =
    selectedPaymentMethod?.last_statement_imported_through;
  const showMerchantStep =
    (fileType === "csv" || fileType === "xlsx") &&
    columnMapping.merchant !== null &&
    (step === "merchants" || statementMerchants.length > 0);
  const steps = [
    { key: "upload", label: "Upload" },
    ...(fileType === "csv" || fileType === "xlsx"
      ? [
          { key: "configure", label: "Configure" },
          ...(showMerchantStep ? [{ key: "merchants", label: "Merchants" }] : []),
        ]
      : []),
    { key: "review", label: "Review" },
  ];
  const currentStepKey = step === "importing" ? "review" : step;
  const currentStepIndex = steps.findIndex((item) => item.key === currentStepKey);
  const unmappedMerchants = statementMerchants.filter(
    (merchant) => !merchantMapping[merchant.key]
  );

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
            {steps.map((item, index) => {
              const isCurrent = index === currentStepIndex;
              const isComplete = index < currentStepIndex;

              return (
                <React.Fragment key={item.key}>
                  <div
                    className={`flex items-center ${
                      isCurrent
                        ? "text-blue-600"
                        : isComplete
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isCurrent
                          ? "bg-blue-600 text-white"
                          : isComplete
                          ? "bg-green-600 text-white"
                          : "bg-gray-300 text-gray-600"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="ml-2 text-sm font-medium">{item.label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-8 h-px bg-gray-300"></div>
                  )}
                </React.Fragment>
              );
            })}
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
                  onChange={(e) => {
                    setPaymentMethodId(e.target.value);
                    // Update currency when payment method changes
                    const selectedPM = paymentMethods.find(pm => pm.id === e.target.value);
                    if (selectedPM?.currency) {
                      setPrimaryCurrency(selectedPM.currency);
                    }
                  }}
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
                <p className="mt-2 text-xs text-gray-500">
                  {lastStatementImportedThrough
                    ? `Last statement imported through ${formatDate(
                        lastStatementImportedThrough
                      )}.`
                    : "No statements imported yet for this account."}
                </p>
              </div>

              {/* Header Row Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Header Row (1-indexed)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    max={csvPreview.length}
                    value={headerRow + 1}
                    onChange={(e) => {
                      const newHeaderRow = Math.max(0, Math.min(csvPreview.length - 1, parseInt(e.target.value) - 1));
                      setHeaderRow(newHeaderRow);
                      
                      // Update headers from the new header row
                      const headerRowData = csvPreview[newHeaderRow] || [];
                      const newHeaders = headerRowData.map((cell: any) => String(cell || ""));
                      setCsvHeaders(newHeaders);
                      
                      // Recalculate column mapping suggestions
                      const newMapping = suggestColumnMapping(newHeaders);
                      setColumnMapping(newMapping);
                    }}
                    className="block w-32 px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  <span className="text-sm text-gray-500">
                    (Automatically detected: Row {detectedHeaderRow + 1})
                  </span>
                </div>
              </div>

              {/* CSV/XLSX Preview */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{fileType === "xlsx" ? "Excel" : "CSV"} Preview</h3>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                          Row
                        </th>
                        {csvHeaders.map((header, index) => (
                          <th
                            key={index}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header || `Column ${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {csvPreview.slice(headerRow, headerRow + 10).map((row, rowIndex) => {
                        const actualRowIndex = headerRow + rowIndex;
                        const isHeaderRow = actualRowIndex === headerRow;
                        return (
                          <tr 
                            key={actualRowIndex} 
                            className={isHeaderRow ? "bg-blue-50 font-medium" : ""}
                          >
                            <td className="px-3 py-2 text-sm text-gray-500 font-mono">
                              {actualRowIndex + 1}
                            </td>
                            {row.map((cell, cellIndex) => (
                              <td 
                                key={cellIndex} 
                                className={`px-3 py-2 text-sm ${isHeaderRow ? "text-blue-700 font-medium" : "text-gray-900"}`}
                              >
                                {cell || "-"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Showing rows starting from row {headerRow + 1} (header row highlighted in blue). Rows above this will be ignored during import.
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

              {/* Number Format */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Number Format *</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="us"
                      checked={numberFormat === "us"}
                      onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      US Format (period as decimal, comma as thousands) - e.g., 1,234.56
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="european"
                      checked={numberFormat === "european"}
                      onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      European Format (comma as decimal, period as thousands) - e.g., 1.234,56 or 13,99
                    </span>
                  </label>
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

          {/* Merchant Mapping Step */}
          {step === "merchants" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Match Merchants</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Map merchant names from your statement to saved merchants, or create new ones.
                </p>
                {statementDateRange?.max && (
                  <p className="mt-2 text-xs text-gray-500">
                    Statement range: {formatDate(statementDateRange.min)} -{" "}
                    {formatDate(statementDateRange.max)}
                  </p>
                )}
              </div>

              {statementMerchants.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No merchant values were detected in this statement.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">
                      Found {statementMerchants.length} unique merchant names.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateAllMerchants}
                      disabled={creatingAllMerchants || unmappedMerchants.length === 0}
                      className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      {creatingAllMerchants ? "Creating..." : "Create missing merchants"}
                    </button>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Statement Merchant
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Map To Merchant
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {statementMerchants.map((merchant) => {
                          const mappedId = merchantMapping[merchant.key] || null;
                          const isCreating = creatingMerchants[merchant.key];

                          return (
                            <tr key={merchant.key}>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {merchant.name}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <AutocompleteDropdown
                                  items={merchants}
                                  value={mappedId}
                                  onChange={(merchantId, _merchantName) =>
                                    handleMerchantMappingChange(merchant.key, merchantId)
                                  }
                                  onCreateNew={createMerchantByName}
                                  placeholder="Select merchant..."
                                />
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCreateMerchantForMapping(merchant.name, merchant.key)
                                  }
                                  disabled={isCreating}
                                  className="text-xs text-blue-600 hover:text-blue-500 disabled:opacity-50"
                                >
                                  {isCreating ? "Creating..." : "Create"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {unmappedMerchants.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded text-sm">
                      {unmappedMerchants.length} merchant
                      {unmappedMerchants.length === 1 ? " is" : "s are"} still
                      unmapped. You can leave them blank or create new merchants.
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setStep("configure")}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Back to Configure
                </button>
                <button
                  onClick={() => {
                    applyMerchantMapping();
                    setStep("review");
                  }}
                  disabled={creatingAllMerchants}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Continue to Review
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
                    onChange={(e) => {
                      setPaymentMethodId(e.target.value);
                      // Update currency when payment method changes
                      const selectedPM = paymentMethods.find(pm => pm.id === e.target.value);
                      if (selectedPM?.currency) {
                        setPrimaryCurrency(selectedPM.currency);
                      }
                    }}
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
                <div className="mt-2 text-xs text-gray-500">
                  {lastStatementImportedThrough
                    ? `Last statement imported through ${formatDate(
                        lastStatementImportedThrough
                      )}.`
                    : "No statements imported yet for this account."}
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
                    {parsedTransactions.some((t) => t.excluded) && (
                      <span className="ml-2 font-normal text-gray-600">
                        ({parsedTransactions.filter((t) => !t.excluded).length} to import)
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and edit transactions below. Exclude rows you don&apos;t want to import. Link two rows as a transfer pair (e.g. Revolut inter-account) and assign which belongs to this account vs another. Duplicates will be automatically skipped during import.
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                          Exclude
                        </th>
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Link pair
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {parsedTransactions.map((transaction, index) => (
                        <TransactionRow
                          key={index}
                          transaction={transaction}
                          index={index}
                          allTransactions={parsedTransactions}
                          paymentMethods={paymentMethods}
                          paymentMethodId={paymentMethodId}
                          onUpdate={(updated) => {
                            setParsedTransactions((prev) =>
                              prev.map((t, i) => (i === index ? updated : t))
                            );
                          }}
                          onLinkRows={handleLinkRows}
                          onUnlinkPair={handleUnlinkPair}
                          onPairAssignment={handlePairAssignment}
                          onCreatePaymentMethod={() => setShowPaymentMethodForm(true)}
                          primaryCurrency={primaryCurrency}
                          importing={importing}
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
                      if (showMerchantStep && statementMerchants.length > 0) {
                        setStep("merchants");
                      } else {
                        setStep("configure");
                      }
                    } else {
                      setStep("upload");
                      setUploadedFile(null);
                      setParsedTransactions([]);
                    }
                  }}
                  disabled={importing}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {(fileType === "csv" || fileType === "xlsx")
                    ? showMerchantStep && statementMerchants.length > 0
                      ? "Back to Merchants"
                      : "Back to Configure"
                    : "Cancel"}
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !paymentMethodId || parsedTransactions.filter((t) => !t.excluded).length === 0}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {importing
                    ? "Importing..."
                    : `Import ${parsedTransactions.filter((t) => !t.excluded).length} Transactions`}
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
  allTransactions,
  paymentMethods,
  paymentMethodId,
  onUpdate,
  onLinkRows,
  onUnlinkPair,
  onPairAssignment,
  onCreatePaymentMethod,
  primaryCurrency,
  importing,
}: {
  transaction: ParsedTransaction;
  index: number;
  allTransactions: ParsedTransaction[];
  paymentMethods: any[];
  paymentMethodId: string;
  onUpdate: (transaction: ParsedTransaction) => void;
  onLinkRows: (i: number, j: number) => void;
  onUnlinkPair: (pairId: string) => void;
  onPairAssignment: (
    pairId: string,
    thisRowIndex: number,
    otherRowIndex: number,
    otherAccountId: string | null
  ) => void;
  onCreatePaymentMethod: () => void;
  primaryCurrency: string;
  importing: boolean;
}) {
  const [isTransfer, setIsTransfer] = useState(transaction.transaction_type === "transfer");
  const [transferFrom, setTransferFrom] = useState(transaction.transfer_from_id || paymentMethodId);
  const [transferTo, setTransferTo] = useState(transaction.transfer_to_id || "");

  const isPaired = !!transaction.transfer_pair_id;
  const partnerIndex = isPaired
    ? allTransactions.findIndex(
        (t, i) => i !== index && t.transfer_pair_id === transaction.transfer_pair_id
      )
    : -1;
  const partner = partnerIndex >= 0 ? allTransactions[partnerIndex] : null;

  useEffect(() => {
    if (isPaired) return;
    setIsTransfer(transaction.transaction_type === "transfer");
    setTransferFrom(transaction.transfer_from_id || paymentMethodId);
    setTransferTo(transaction.transfer_to_id || "");
  }, [transaction, paymentMethodId, isPaired]);

  const handleExcludeToggle = (checked: boolean) => {
    onUpdate({ ...transaction, excluded: checked });
  };

  const handleTransferToggle = (checked: boolean) => {
    if (isPaired) return;
    setIsTransfer(checked);
    if (checked) {
      onUpdate({
        ...transaction,
        transaction_type: "transfer",
        transfer_from_id: transferFrom,
        transfer_to_id: transferTo || paymentMethodId,
      });
    } else {
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
    onUpdate({ ...transaction, transfer_from_id: value });
  };

  const handleTransferToChange = (value: string) => {
    setTransferTo(value);
    onUpdate({ ...transaction, transfer_to_id: value });
  };

  const handleBelongsToggle = (belongs: "this_account" | "other_account") => {
    if (!transaction.transfer_pair_id || partnerIndex < 0) return;
    const otherId =
      belongs === "other_account"
        ? (transaction.transfer_other_account_id || null)
        : partner?.transfer_other_account_id || null;
    onPairAssignment(
      transaction.transfer_pair_id,
      belongs === "this_account" ? index : partnerIndex,
      belongs === "other_account" ? index : partnerIndex,
      otherId
    );
  };

  const handleOtherAccountChange = (value: string) => {
    onUpdate({ ...transaction, transfer_other_account_id: value || null });
  };

  const formatAmount = (amount: number) => formatCurrency(amount, primaryCurrency);

  const linkableIndexes = allTransactions
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t, i }) =>
        i !== index &&
        !t.excluded &&
        !t.transfer_pair_id
    )
    .map(({ i }) => i);

  const isTransferLike = isPaired || isTransfer;
  const rowClass = [
    transaction.excluded ? "opacity-50 bg-gray-50" : "",
    isTransferLike ? "bg-blue-50" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={rowClass || undefined}>
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={!!transaction.excluded}
          onChange={(e) => handleExcludeToggle(e.target.checked)}
          disabled={importing}
          title="Exclude from import"
          className="rounded border-gray-300"
        />
      </td>
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
          isTransferLike
            ? "text-blue-600"
            : (transaction.transaction_type === "income" ||
              (transaction.transaction_type === undefined && transaction.amount > 0))
              ? "text-green-600"
              : "text-red-600"
        }`}
      >
        {formatAmount(Math.abs(transaction.amount))}
      </td>
      <td className="px-4 py-3 text-sm">
        {isPaired ? (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            Transfer (pair)
          </span>
        ) : isTransfer ? (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            Transfer
          </span>
        ) : transaction.transaction_type === "income" ||
          (transaction.transaction_type === undefined && transaction.amount > 0) ? (
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
        {isPaired ? (
          <div className="space-y-1.5 text-xs">
            <p className="text-gray-600">
              Pair with row {partnerIndex + 1}
              {partner && (
                <span className="ml-1 text-gray-500">
                  ({formatAmount(Math.abs(partner.amount))} — {partner.description || "—"})
                </span>
              )}
            </p>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name={`pair-${transaction.transfer_pair_id}-${index}`}
                    checked={transaction.transfer_belongs_to === "this_account"}
                    onChange={() => handleBelongsToggle("this_account")}
                    disabled={importing}
                    className="mr-1"
                  />
                  <span>This account</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name={`pair-${transaction.transfer_pair_id}-${index}`}
                    checked={transaction.transfer_belongs_to === "other_account"}
                    onChange={() => handleBelongsToggle("other_account")}
                    disabled={importing}
                    className="mr-1"
                  />
                  <span>Other:</span>
                </label>
                {transaction.transfer_belongs_to === "other_account" && (
                  <div className="flex items-center gap-1">
                    <select
                      value={transaction.transfer_other_account_id || ""}
                      onChange={(e) => handleOtherAccountChange(e.target.value)}
                      disabled={importing}
                      className="text-xs px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="">Select account</option>
                      {paymentMethods
                        .filter((pm) => pm.id !== paymentMethodId)
                        .map((pm) => (
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
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => transaction.transfer_pair_id && onUnlinkPair(transaction.transfer_pair_id)}
              disabled={importing}
              className="text-red-600 hover:text-red-700 text-xs"
            >
              Unlink
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isTransfer}
                onChange={(e) => handleTransferToggle(e.target.checked)}
                disabled={importing}
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
                    disabled={importing}
                    className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
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
                      disabled={importing}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
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
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {isPaired ? (
          <span className="text-gray-500 text-xs">—</span>
        ) : linkableIndexes.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              const j = parseInt(e.target.value, 10);
              if (!Number.isNaN(j)) onLinkRows(index, j);
              e.target.value = "";
            }}
            disabled={importing || !!transaction.excluded}
            className="text-xs px-2 py-1 border border-gray-300 rounded"
          >
            <option value="">Link to row…</option>
            {linkableIndexes.map((j) => {
              const t = allTransactions[j];
              return (
                <option key={j} value={j}>
                  Row {j + 1}: {t.transaction_date} {formatAmount(Math.abs(t.amount))} —{" "}
                  {(t.description || "").slice(0, 30)}
                </option>
              );
            })}
          </select>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
