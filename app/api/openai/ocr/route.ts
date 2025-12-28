import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const { imageUrl, filePath } = await request.json();

  if (!imageUrl && !filePath) {
    return NextResponse.json(
      { error: "Image URL or file path is required" },
      { status: 400 }
    );
  }

  try {
    let imageDataUrl: string;

    // If we have a filePath, download the file from Supabase Storage
    if (filePath) {
      const supabase = await createClient();
      // Parse bucket name and path
      // filePath format: "receipts/user_id/workspace_id/type/timestamp.ext" or just the path part
      const bucketName = filePath.startsWith('receipts/') ? 'receipts' : 
                        filePath.startsWith('statements/') ? 'statements' : 'receipts';
      const path = filePath.startsWith('receipts/') || filePath.startsWith('statements/') 
        ? filePath.substring(filePath.indexOf('/') + 1) 
        : filePath;
      
      // Download the file as a blob
      const { data, error: downloadError } = await supabase.storage
        .from(bucketName)
        .download(path);

      if (downloadError || !data) {
        return NextResponse.json(
          { error: downloadError?.message || "Failed to download file from storage" },
          { status: 500 }
        );
      }

      // Convert blob to base64 data URL
      const arrayBuffer = await data.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = data.type || 'image/jpeg';
      imageDataUrl = `data:${mimeType};base64,${base64}`;
    } else {
      // If we have a public URL, try to fetch it
      // But if it's a private bucket, we'll need to handle it differently
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: "Failed to download image. Please ensure the file is accessible." },
          { status: 500 }
        );
      }
      const imageBlob = await imageResponse.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      imageDataUrl = `data:${imageBlob.type};base64,${base64}`;
    }

    // Use OpenAI Vision API to extract text from image
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract transaction information from this receipt/image. Return a JSON object with the following fields: amount (number), description (string), category (string or null), transaction_date (YYYY-MM-DD format). If you cannot determine a field, use null.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "OpenAI API error");
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    // Parse the JSON response
    let parsedData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      // If parsing fails, try to extract structured data manually
      parsedData = {
        amount: extractAmount(content),
        description: extractDescription(content),
        category: null,
        transaction_date: extractDate(content),
      };
    }

    return NextResponse.json({ transaction: parsedData, rawResponse: content });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process image" },
      { status: 500 }
    );
  }
}

function extractAmount(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function extractDescription(text: string): string | null {
  // Try to find merchant/store name
  const lines = text.split("\n").filter((line) => line.trim());
  return lines[0]?.trim() || null;
}

function extractDate(text: string): string {
  const dateMatch = text.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})|(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  if (dateMatch) {
    return dateMatch[0];
  }
  return new Date().toISOString().split("T")[0];
}
