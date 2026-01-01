// Enhanced CSV parser with header detection and flexible column mapping
import * as XLSX from "xlsx";

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
  transaction_type?: "expense" | "income" | "transfer";
  transfer_from_id?: string | null;
  transfer_to_id?: string | null;
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
    // Throw error if date cannot be parsed instead of silently defaulting
    const dateParsed = parseDate(dateValue);
    if (!dateParsed) {
      throw new Error(
        `Unable to parse date "${dateValue}" in row ${i + 1}. ` +
        `Please check the date column mapping. Dates should be in formats like YYYY-MM-DD, MM/DD/YYYY, or YYYY-MM-DD HH:MM:SS.`
      );
    }
    const transactionDate = dateParsed;

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
 * Handles date+time formats by extracting just the date portion
 */
function parseDate(dateStr: string): string | null {
  // Remove any extra whitespace
  let cleaned = dateStr.trim();
  
  // Handle date+time formats by extracting just the date part
  // Common formats: "2025-12-01 09:02:51", "2025-12-01T09:02:51", "2025/12/01 09:02:51"
  // Split on space or 'T' and take the first part (the date)
  const dateTimeMatch = cleaned.match(/^(.+?)[\sT](.+)$/);
  if (dateTimeMatch) {
    cleaned = dateTimeMatch[1].trim();
  }

  // Try different date formats
  // First, try YYYY-MM-DD or YYYY/MM/DD format
  const ymdFormat = /^(\d{4})[-\/](\d{2})[-\/](\d{2})$/;
  const ymdMatch = cleaned.match(ymdFormat);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900) {
      return `${yearNum}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Try DD/MM/YYYY or MM/DD/YYYY format
  // We need to detect which one it is by checking if first number > 12
  const dmyFormat = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/;
  const dmyMatch = cleaned.match(dmyFormat);
  if (dmyMatch) {
    const [, first, second, year] = dmyMatch;
    const firstNum = parseInt(first, 10);
    const secondNum = parseInt(second, 10);
    let yearStr = year;
    
    if (year.length === 2) {
      // Convert YY to YYYY (assuming 20XX for years 00-99)
      yearStr = "20" + year;
    }
    
    const yearNum = parseInt(yearStr, 10);
    let month: string, day: string;
    
    // If first number > 12, it must be DD/MM/YYYY
    if (firstNum > 12) {
      day = first;
      month = second;
    } 
    // If second number > 12, it must be MM/DD/YYYY
    else if (secondNum > 12) {
      month = first;
      day = second;
    }
    // If both <= 12, try both formats and see which one validates
    else {
      // Try DD/MM/YYYY first (more common internationally)
      const dayNum = firstNum;
      const monthNum = secondNum;
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
        day = first;
        month = second;
      }
      // Try MM/DD/YYYY
      else if (firstNum >= 1 && firstNum <= 12 && secondNum >= 1 && secondNum <= 31 && yearNum >= 1900) {
        month = first;
        day = second;
      } else {
        // Default to DD/MM/YYYY if validation fails for both
        day = first;
        month = second;
      }
    }
    
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900) {
      return `${yearNum}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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

/**
 * Converts XLSX file buffer to a 2D array (rows and columns)
 */
export function parseXLSXToArray(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON array format
  // Use raw: true to get actual values, then we'll format dates ourselves
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    defval: "",
    raw: true 
  }) as any[][];
  
  // Convert all values to strings and handle null/undefined
  return jsonData.map(row => 
    row.map(cell => {
      if (cell === null || cell === undefined) {
        return "";
      }
      // Handle Excel date serial numbers (Excel stores dates as numbers)
      if (typeof cell === "number") {
        // Excel date serial number starts from 1900-01-01 (serial number 1)
        // Dates are typically between 1 and ~50000 (for dates up to year 2100)
        // But we also need to check if it's actually a date vs a regular number
        // A heuristic: if it's between 1 and 100000 and looks like a date serial
        if (cell >= 1 && cell < 1000000) {
          try {
            // Try to parse as Excel date
            const excelEpoch = new Date(1899, 11, 30); // Excel epoch is Dec 30, 1899
            const date = new Date(excelEpoch.getTime() + cell * 86400000); // Add days in milliseconds
            
            // Check if the resulting date is reasonable (between 1900 and 2100)
            const year = date.getFullYear();
            if (year >= 1900 && year <= 2100 && !isNaN(date.getTime())) {
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              return `${year}-${month}-${day}`;
            }
          } catch (e) {
            // If date parsing fails, treat as regular number
          }
        }
        // If it's a number but not a date, convert to string
        return String(cell);
      }
      // If it's already a string (from raw: true, dates might be formatted strings)
      return String(cell);
    })
  );
}

/**
 * Detects the header row in an XLSX array by looking for common header keywords
 */
export function detectHeaderRowFromArray(data: string[][]): number {
  const headerKeywords = [
    "date", "transaction date", "posting date", "posted date",
    "description", "transaction", "details", "memo", "note",
    "amount", "debit", "credit", "withdrawal", "deposit",
    "merchant", "payee", "vendor", "store",
    "category", "type"
  ];

  // Check first 10 rows for headers
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    // Count how many columns contain header keywords
    let matches = 0;
    for (const col of row) {
      const normalizedCol = String(col).toLowerCase().trim().replace(/[^a-z0-9\s]/gi, "");
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
 * Parses XLSX content with configuration
 */
export function parseXLSXWithConfig(
  buffer: ArrayBuffer,
  config: CSVImportConfig
): ParsedTransaction[] {
  const data = parseXLSXToArray(buffer);
  const transactions: ParsedTransaction[] = [];

  // Start parsing from after the header row
  for (let i = config.headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    // Extract values based on mapping
    const dateValue = config.columnMapping.date !== null && config.columnMapping.date < row.length
      ? (String(row[config.columnMapping.date] || "").trim() || null)
      : null;
    
    const descriptionValue = config.columnMapping.description !== null && config.columnMapping.description < row.length
      ? (String(row[config.columnMapping.description] || "").trim() || null)
      : null;

    const merchantValue = config.columnMapping.merchant !== null && config.columnMapping.merchant < row.length
      ? (String(row[config.columnMapping.merchant] || "").trim() || null)
      : null;

    const categoryValue = config.columnMapping.category !== null && config.columnMapping.category < row.length
      ? (String(row[config.columnMapping.category] || "").trim() || null)
      : null;

    // Extract amount based on format
    let amount = 0;
    
    if (config.amountFormat === "separate") {
      // Separate debit and credit columns
      const debitStr = config.columnMapping.debit !== null && config.columnMapping.debit < row.length
        ? (String(row[config.columnMapping.debit] || "0").trim() || "0")
        : "0";
      const creditStr = config.columnMapping.credit !== null && config.columnMapping.credit < row.length
        ? (String(row[config.columnMapping.credit] || "0").trim() || "0")
        : "0";

      const debit = parseFloat(String(debitStr).replace(/[^-\d.]/g, "")) || 0;
      const credit = parseFloat(String(creditStr).replace(/[^-\d.]/g, "")) || 0;

      // Debit is negative, credit is positive
      amount = credit - debit;
    } else {
      // Unified amount column
      const amountStr = config.columnMapping.amount !== null && config.columnMapping.amount < row.length
        ? (String(row[config.columnMapping.amount] || "0").trim() || "0")
        : "0";

      amount = parseFloat(String(amountStr).replace(/[^-\d.]/g, "")) || 0;

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
    const dateParsed = parseDate(dateValue);
    if (!dateParsed) {
      throw new Error(
        `Unable to parse date "${dateValue}" in row ${i + 1}. ` +
        `Please check the date column mapping. Dates should be in formats like YYYY-MM-DD, MM/DD/YYYY, or YYYY-MM-DD HH:MM:SS.`
      );
    }
    const transactionDate = dateParsed;

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
 * Gets preview of XLSX (first few rows) for UI display
 */
export function getXLSXPreview(buffer: ArrayBuffer, maxRows: number = 10): string[][] {
  const data = parseXLSXToArray(buffer);
  return data.slice(0, Math.min(maxRows, data.length));
}

