import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  detectHeaderRow,
  suggestColumnMapping,
  getCSVPreview,
  detectHeaderRowFromArray,
  getXLSXPreview,
  CSVImportConfig,
} from "@/lib/utils/csv-parser";

/**
 * Analyzes a CSV or XLSX file and returns header detection and column mapping suggestions
 */
export async function POST(request: Request) {
  const { file_url, file_path, file_type } = await request.json();

  if (!file_url && !file_path) {
    return NextResponse.json(
      { error: "File URL or file path is required" },
      { status: 400 }
    );
  }

  try {
    const isXLSX = file_type === "xlsx" || file_type === "xls";

    if (isXLSX) {
      // Handle XLSX files
      let buffer: ArrayBuffer;

      if (file_path) {
        const supabase = await createClient();
        const bucketName = file_path.startsWith("statements/") ? "statements" : "statements";
        const path = file_path.startsWith("statements/") 
          ? file_path.substring("statements/".length) 
          : file_path;
        
        const { data, error: downloadError } = await supabase.storage
          .from(bucketName)
          .download(path);

        if (downloadError || !data) {
          return NextResponse.json(
            { error: downloadError?.message || "Failed to download file from storage" },
            { status: 500 }
          );
        }

        buffer = await data.arrayBuffer();
      } else {
        // Fallback to fetching from URL
        const response = await fetch(file_url);
        if (!response.ok) {
          throw new Error("Failed to fetch XLSX file");
        }
        buffer = await response.arrayBuffer();
      }

      // Parse XLSX to array
      const data = getXLSXPreview(buffer, 10);
      
      // Detect header row
      const headerRow = detectHeaderRowFromArray(data);

      // Get headers from the detected row
      const headerRowData = data[headerRow];
      if (!headerRowData || headerRowData.length === 0) {
        return NextResponse.json(
          { error: "Could not find header row" },
          { status: 400 }
        );
      }

      const headers = headerRowData.map(cell => String(cell || ""));

      // Suggest column mapping
      const suggestedMapping = suggestColumnMapping(headers);

      return NextResponse.json({
        headerRow,
        headers,
        preview: data,
        suggestedMapping,
        totalRows: data.length - headerRow - 1,
      });
    } else {
      // Handle CSV files (existing logic)
      let csvContent: string;

      // If we have a file_path, download from Supabase Storage (more reliable for private buckets)
      if (file_path) {
        const supabase = await createClient();
        // Parse bucket name and path
        const bucketName = file_path.startsWith("statements/") ? "statements" : "statements";
        const path = file_path.startsWith("statements/") 
          ? file_path.substring("statements/".length) 
          : file_path;
        
        const { data, error: downloadError } = await supabase.storage
          .from(bucketName)
          .download(path);

        if (downloadError || !data) {
          return NextResponse.json(
            { error: downloadError?.message || "Failed to download file from storage" },
            { status: 500 }
          );
        }

        csvContent = await data.text();
      } else {
        // Fallback to fetching from URL
        const response = await fetch(file_url);
        if (!response.ok) {
          throw new Error("Failed to fetch CSV file");
        }
        csvContent = await response.text();
      }

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
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to analyze CSV" },
      { status: 500 }
    );
  }
}

