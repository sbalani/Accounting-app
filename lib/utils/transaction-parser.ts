// Utility functions for parsing transaction data from various sources

export interface ParsedTransaction {
  amount: number;
  description: string | null;
  category: string | null;
  transaction_date: string;
}

export function parseTransactionFromText(text: string): ParsedTransaction | null {
  // Basic parsing logic - can be enhanced with OpenAI
  // This is a placeholder for more sophisticated parsing

  // Try to extract amount (look for currency patterns)
  const amountMatch = text.match(/\$?([\d,]+\.?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

  if (!amount) {
    return null;
  }

  // Extract date (basic pattern matching)
  const dateMatch = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
  const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];

  // Extract description (everything else)
  const description = text
    .replace(/\$?([\d,]+\.?\d*)/g, "")
    .replace(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g, "")
    .trim();

  return {
    amount,
    description: description || null,
    category: null,
    transaction_date: dateStr,
  };
}

export function parseCSVStatement(csvContent: string): ParsedTransaction[] {
  const lines = csvContent.split("\n");
  const transactions: ParsedTransaction[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(",").map((col) => col.trim().replace(/^"|"$/g, ""));

    // Basic CSV parsing - adjust column indices based on your bank's format
    // Typical format: Date, Description, Amount, Balance
    if (columns.length >= 3) {
      const dateStr = columns[0];
      const description = columns[1] || "";
      const amountStr = columns[2] || "0";

      const amount = parseFloat(amountStr.replace(/[^-\d.]/g, ""));

      if (!isNaN(amount) && amount !== 0) {
        transactions.push({
          amount,
          description: description || null,
          category: null,
          transaction_date: dateStr,
        });
      }
    }
  }

  return transactions;
}
