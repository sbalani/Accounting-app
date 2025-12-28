import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const { imageUrl } = await request.json();

  if (!imageUrl) {
    return NextResponse.json(
      { error: "Image URL is required" },
      { status: 400 }
    );
  }

  try {
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
                  url: imageUrl,
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
