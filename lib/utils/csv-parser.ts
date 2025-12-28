// Enhanced CSV parser with header detection and flexible column mapping

export interface CSVColumnMapping {
  date: number | null; // column index
  description: number | null;
  amount: number | null; // for unified amount column
  debit: number | null; // for separate debit column
  credit: number | null; // for separate credit column
  merchant: number | null; // optional
  category: number | null; // optional
}

export type AmountFormat = 
  | "unified" // positive = income, negative = expense
  | "unified_reverse" // positive = expense, negative = income (credit cards)
  | "separate"; // separate debit and credit columns

export interface CSVImportConfig {
  headerRow: number; // 0-indexed row number where headers are found
  columnMapping: CSVColumnMapping;
  amountFormat: AmountFormat;
}

export interface ParsedTransaction {
  amount: number;
  description: string | null;
  merchant: string | null;
  category: string | null;
  transaction_date: string;
}

/**
 * Detects the header row in a CSV by looking for common header keywords
 */
export function detectHeaderRow(csvLines: string[]): number {
  const headerKeywords = [
    "date", "transaction date", "posting date", "posted date",
    "description", "transaction", "details", "memo", "note",
    "amount", "debit", "credit", "withdrawal", "deposit",
    "merchant", "payee", "vendor", "store",
    "category", "type"
  ];

  // Check first 10 rows for headers
  for (let i = 0; i < Math.min(10, csvLines.length); i++) {
    const line = csvLines[i].toLowerCase();
    const columns = parseCSVLine(line);
    
    // Count how many columns contain header keywords
    let matches = 0;
    for (const col of columns) {
      const normalizedCol = col.trim().replace(/[^a-z0-9\s]/gi, "");
      if (headerKeywords.some(keyword => normalizedCol.includes(keyword))) {
        matches++;
      }
    }

    // If we find 2+ matches, likely a header row
    if (matches >= 2) {
      return i;
    }
  }

  // Default to first row if no header detected
  return 0;
}

/**
 * Parses a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Suggests column mappings based on header row
 */
export function suggestColumnMapping(headers: string[]): CSVColumnMapping {
  const mapping: CSVColumnMapping = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    merchant: null,
    category: null,
  };

  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  normalizedHeaders.forEach((header, index) => {
    const normalized = header.replace(/[^a-z0-9\s]/gi, "");

    // Date columns
    if (!mapping.date && (
      normalized.includes("date") ||
      normalized.includes("posted") ||
      normalized.includes("posting")
    )) {
      mapping.date = index;
    }

    // Description columns
    else if (!mapping.description && (
      normalized.includes("description") ||
      normalized.includes("transaction") ||
      normalized.includes("details") ||
      normalized.includes("memo") ||
      normalized.includes("note") ||
      normalized.includes("reference")
    )) {
      mapping.description = index;
    }

    // Amount columns
    else if (!mapping.amount && (
      normalized.includes("amount") ||
      normalized === "amt"
    )) {
      mapping.amount = index;
    }

    // Debit columns
    else if (!mapping.debit && (
      normalized.includes("debit") ||
      normalized.includes("withdrawal") ||
      normalized.includes("out")
    )) {
      mapping.debit = index;
    }

    // Credit columns
    else if (!mapping.credit && (
      normalized.includes("credit") ||
      normalized.includes("deposit") ||
      normalized.includes("in")
    )) {
      mapping.credit = index;
    }

    // Merchant columns
    else if (!mapping.merchant && (
      normalized.includes("merchant") ||
      normalized.includes("payee") ||
      normalized.includes("vendor") ||
      normalized.includes("store") ||
      normalized.includes("company")
    )) {
      mapping.merchant = index;
    }

    // Category columns
    else if (!mapping.category && (
      normalized.includes("category") ||
      normalized.includes("type") ||
      normalized.includes("class")
    )) {
      mapping.category = index;
    }
  });

  return mapping;
}

/**
 * Parses CSV content with configuration
 */
export function parseCSVWithConfig(
  csvContent: string,
  config: CSVImportConfig
): ParsedTransaction[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  const transactions: ParsedTransaction[] = [];

  // Start parsing from after the header row
  for (let i = config.headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = parseCSVLine(line);

    // Extract values based on mapping
    // Add safety check to ensure column index exists
    const dateValue = config.columnMapping.date !== null && config.columnMapping.date < columns.length
      ? (columns[config.columnMapping.date]?.trim() || null)
      : null;
    
    const descriptionValue = config.columnMapping.description !== null && config.columnMapping.description < columns.length
      ? (columns[config.columnMapping.description]?.trim() || null)
      : null;

    const merchantValue = config.columnMapping.merchant !== null && config.columnMapping.merchant < columns.length
      ? (columns[config.columnMapping.merchant]?.trim() || null)
      : null;

    const categoryValue = config.columnMapping.category !== null && config.columnMapping.category < columns.length
      ? (columns[config.columnMapping.category]?.trim() || null)
      : null;

    // Extract amount based on format
    let amount = 0;
    
    if (config.amountFormat === "separate") {
      // Separate debit and credit columns
      const debitStr = config.columnMapping.debit !== null && config.columnMapping.debit < columns.length
        ? (columns[config.columnMapping.debit]?.trim() || "0")
        : "0";
      const creditStr = config.columnMapping.credit !== null && config.columnMapping.credit < columns.length
        ? (columns[config.columnMapping.credit]?.trim() || "0")
        : "0";

      const debit = parseFloat(debitStr.replace(/[^-\d.]/g, "")) || 0;
      const credit = parseFloat(creditStr.replace(/[^-\d.]/g, "")) || 0;

      // Debit is negative, credit is positive
      amount = credit - debit;
    } else {
      // Unified amount column
      const amountStr = config.columnMapping.amount !== null && config.columnMapping.amount < columns.length
        ? (columns[config.columnMapping.amount]?.trim() || "0")
        : "0";

      amount = parseFloat(amountStr.replace(/[^-\d.]/g, "")) || 0;

      if (config.amountFormat === "unified_reverse") {
        // For credit cards: positive = expense, so we negate it
        amount = -amount;
      }
      // For "unified": positive = income, negative = expense (already correct)
    }

    // Skip transactions with zero amount or missing date
    if (amount === 0 || !dateValue) {
      continue;
    }

    // Try to parse date - handle various formats
    let transactionDate: string;
    try {
      // Try common date formats
      const dateParsed = parseDate(dateValue);
      transactionDate = dateParsed || new Date().toISOString().split("T")[0];
    } catch {
      transactionDate = new Date().toISOString().split("T")[0];
    }

    transactions.push({
      amount,
      description: descriptionValue || null,
      merchant: merchantValue || null,
      category: categoryValue || null,
      transaction_date: transactionDate,
    });
  }

  return transactions;
}

/**
 * Parses various date formats to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  // Remove any extra whitespace
  const cleaned = dateStr.trim();

  // Try different date formats
  const formats = [
    /^(\d{4})[-\/](\d{2})[-\/](\d{2})$/, // YYYY-MM-DD or YYYY/MM/DD
    /^(\d{2})[-\/](\d{2})[-\/](\d{4})$/, // MM/DD/YYYY or MM-DD-YYYY
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/, // M/D/YY or M/D/YYYY
  ];

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i];
    const match = cleaned.match(format);
    if (match) {
      let year: string, month: string, day: string;

      if (i === 0) {
        // YYYY-MM-DD or YYYY/MM/DD
        [, year, month, day] = match;
      } else {
        // MM/DD/YYYY or MM-DD-YYYY or M/D/YY
        [, month, day, year] = match;
        if (year.length === 2) {
          // Convert YY to YYYY (assuming 20XX for years 00-99)
          year = "20" + year;
        }
      }

      // Validate and pad
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      const yearNum = parseInt(year, 10);

      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900) {
        return `${yearNum}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
  }

  return null;
}

/**
 * Gets preview of CSV (first few rows) for UI display
 */
export function getCSVPreview(csvContent: string, maxRows: number = 10): string[][] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  const preview: string[][] = [];

  for (let i = 0; i < Math.min(maxRows, lines.length); i++) {
    preview.push(parseCSVLine(lines[i]));
  }

  return preview;
}

