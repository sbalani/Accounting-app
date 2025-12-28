import { NextResponse } from "next/server";
import {
  detectHeaderRow,
  suggestColumnMapping,
  getCSVPreview,
  CSVImportConfig,
} from "@/lib/utils/csv-parser";

/**
 * Analyzes a CSV file and returns header detection and column mapping suggestions
 */
export async function POST(request: Request) {
  const { file_url } = await request.json();

  if (!file_url) {
    return NextResponse.json(
      { error: "File URL is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch CSV content
    const response = await fetch(file_url);
    if (!response.ok) {
      throw new Error("Failed to fetch CSV file");
    }
    const csvContent = await response.text();

    // Split into lines for analysis
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

    // Detect header row
    const headerRow = detectHeaderRow(lines);

    // Get preview
    const preview = getCSVPreview(csvContent, 10);

    // Get headers
    const headerLine = lines[headerRow];
    if (!headerLine) {
      return NextResponse.json(
        { error: "Could not find header row" },
        { status: 400 }
      );
    }

    // Parse header line to get column names
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(headerLine);

    // Suggest column mapping
    const suggestedMapping = suggestColumnMapping(headers);

    return NextResponse.json({
      headerRow,
      headers,
      preview,
      suggestedMapping,
      totalRows: lines.length - headerRow - 1,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to analyze CSV" },
      { status: 500 }
    );
  }
}

