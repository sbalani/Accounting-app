import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import {
  checkUserRules,
  getAIContextRules,
  buildCategorizationPrompt,
  type CategorizationRule,
} from "@/lib/utils/categorization";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  try {
    let audioFile: File;

    // Check if this is a multipart/form-data request (direct file upload)
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return NextResponse.json(
          { error: "Audio file is required" },
          { status: 400 }
        );
      }

      audioFile = file;
    } else {
      // Legacy: support audioUrl for backwards compatibility
      const { audioUrl } = await request.json();

      if (!audioUrl) {
        return NextResponse.json(
          { error: "Audio file or URL is required" },
          { status: 400 }
        );
      }

      // Fetch the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error("Failed to fetch audio file");
      }

      const audioBlob = await audioResponse.blob();
      audioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" });
    }

    // Use OpenAI Audio API for transcription
    // Prefer gpt-4o-transcribe (newer, better) but fallback to whisper-1 for compatibility
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "gpt-4o-transcribe");
    formData.append("response_format", "json");

    console.log("Sending audio file for transcription, size:", audioFile.size, "type:", audioFile.type);
    console.log("Using model: gpt-4o-transcribe");

    let response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    // Fallback to whisper-1 if gpt-4o-transcribe is not available
    if (!response.ok) {
      const errorData = await response.json();
      console.warn("gpt-4o-transcribe failed, falling back to whisper-1:", errorData);
      
      const fallbackFormData = new FormData();
      fallbackFormData.append("file", audioFile);
      fallbackFormData.append("model", "whisper-1");
      fallbackFormData.append("response_format", "json");
      
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fallbackFormData,
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Transcription API error:", response.status, errorData);
      throw new Error(errorData.error?.message || "OpenAI API error");
    }

    const data = await response.json();
    const transcription = data.text;

    console.log("Transcription received:", transcription);
    console.log("Full transcription response:", JSON.stringify(data, null, 2));

    // Fetch categories and categorization rules for the workspace
    const supabase = await createClient();
    const workspaceId = await getCurrentWorkspaceId();

    let categories: string[] = [];
    let categorizationRules: CategorizationRule[] = [];

    if (workspaceId) {
      // Fetch categories
      const { data: categoriesData } = await supabase
        .from("transaction_categories")
        .select("name")
        .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (categoriesData) {
        categories = categoriesData.map((c) => c.name);
      }

      // Fetch categorization rules
      const { data: rulesData } = await supabase
        .from("categorization_rules")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("priority", { ascending: false });

      if (rulesData) {
        categorizationRules = rulesData as CategorizationRule[];
      }
    }

    console.log("Categories:", categories);
    console.log("Categorization rules:", categorizationRules.length);

    // Parse the transcription to extract transaction details
    // Use GPT-4o with structured outputs (JSON schema) for reliable parsing
    // Get today's date in YYYY-MM-DD format for the prompt
    const today = new Date().toISOString().split("T")[0];
    
    // Build the extraction prompt - first extract basic fields (category will be determined separately)
    const extractionPrompt = `Extract transaction information from this spoken text: "${transcription}". If today's date is ${today}, use it when no date is mentioned.\n\nExtract: amount (number), description (string), merchant/vendor (string or null if not mentioned), transaction_date (YYYY-MM-DD format).`;
    
    const requestBody = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that extracts transaction information from spoken text. Return a JSON object with the transaction details.`,
        },
        {
          role: "user",
          content: extractionPrompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "transaction_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description: "The transaction amount as a number. Use 0 if not specified.",
              },
              description: {
                type: "string",
                description: "A brief description of the transaction. Use empty string if not specified.",
              },
              merchant: {
                type: ["string", "null"],
                description: "The merchant/vendor name if mentioned, or null if not mentioned.",
              },
              transaction_date: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                description: "The date in YYYY-MM-DD format. Use today's date if not specified.",
              },
            },
            required: ["amount", "description", "merchant", "transaction_date"],
            additionalProperties: false,
          },
        },
      },
      max_tokens: 300,
    };

    console.log("Sending parsing request to OpenAI:", JSON.stringify(requestBody, null, 2));

    const parseResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.warn("Structured outputs (json_schema) failed, falling back to json_object mode:", parseResponse.status, errorText);
      
      // Fallback to json_object mode (legacy but widely supported)
      const fallbackRequestBody = {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts transaction information from spoken text. You MUST respond with valid JSON only. Return a JSON object with: amount (number, use 0 if not specified), description (string, use empty string if not specified), merchant (string or null if not mentioned), transaction_date (YYYY-MM-DD format, use "${today}" if not specified).`,
          },
          {
            role: "user",
            content: `Extract transaction information from this spoken text as JSON: "${transcription}"`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      };

      console.log("Sending fallback parsing request:", JSON.stringify(fallbackRequestBody, null, 2));

      const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(fallbackRequestBody),
      });

      if (!fallbackResponse.ok) {
        const fallbackErrorText = await fallbackResponse.text();
        console.error("OpenAI parsing API error (fallback also failed):", fallbackResponse.status, fallbackErrorText);
        // If parsing fails, return just the transcription
        return NextResponse.json({
          transcription,
          transaction: null,
        });
      }

      const fallbackData = await fallbackResponse.json();
      console.log("Fallback parsing response:", JSON.stringify(fallbackData, null, 2));
      const fallbackContent = fallbackData.choices[0]?.message?.content;
      
      if (fallbackContent) {
        try {
          let transactionJson = JSON.parse(fallbackContent);
          console.log("Parsed transaction JSON (fallback):", JSON.stringify(transactionJson, null, 2));
          
          if (transactionJson.amount !== undefined && transactionJson.description !== undefined) {
            // Apply categorization logic for fallback path too
            const description = transactionJson.description || "";
            const merchant = transactionJson.merchant || null;
            
            const ruleMatch = checkUserRules(description, merchant, categorizationRules);
            if (ruleMatch && ruleMatch.category) {
              transactionJson.category = ruleMatch.category;
            } else {
              // Use AI for categorization in fallback
              const aiContextRules = getAIContextRules(description, merchant, categorizationRules);
              if (categories.length > 0) {
                const categorizationPrompt = buildCategorizationPrompt(
                  description,
                  merchant,
                  categories,
                  aiContextRules
                );
                
                const categoryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                      {
                        role: "system",
                        content: "You are a helpful assistant that categorizes financial transactions. Return only the category name from the provided list, or 'null' if none apply.",
                      },
                      {
                        role: "user",
                        content: categorizationPrompt,
                      },
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 100,
                  }),
                });
                
                if (categoryResponse.ok) {
                  const categoryData = await categoryResponse.json();
                  const categoryContent = categoryData.choices[0]?.message?.content;
                  if (categoryContent) {
                    try {
                      const categoryResult = JSON.parse(categoryContent);
                      transactionJson.category = categoryResult.category || null;
                    } catch (e) {
                      transactionJson.category = null;
                    }
                  }
                }
              }
            }
            
            return NextResponse.json({
              transcription,
              transaction: transactionJson,
            });
          }
        } catch (e) {
          console.error("Failed to parse fallback JSON:", e);
        }
      }
      
      return NextResponse.json({
        transcription,
        transaction: null,
      });
    }

    const parseData = await parseResponse.json();
    console.log("OpenAI parsing response received:", JSON.stringify(parseData, null, 2));
    
    const content = parseData.choices[0]?.message?.content;
    const finishReason = parseData.choices[0]?.finish_reason;
    
    console.log("Extracted content:", content);
    console.log("Finish reason:", finishReason);
    
    if (!content) {
      console.error("No content in OpenAI parsing response");
      return NextResponse.json({
        transcription,
        transaction: null,
      });
    }

    // Parse the JSON response (structured outputs ensure valid JSON)
    let transactionJson: any;
    try {
      transactionJson = JSON.parse(content);
      
      console.log("Parsed transaction JSON:", JSON.stringify(transactionJson, null, 2));
      
      // Validate that we have the required fields (schema should ensure this, but double-check)
      if (transactionJson.amount === undefined || transactionJson.description === undefined || 
          transactionJson.transaction_date === undefined) {
        console.error("Transaction JSON missing required fields:", transactionJson);
        return NextResponse.json({
          transcription,
          transaction: null,
        });
      }
      
      // Validate that we have at least an amount or description with meaningful content
      if (transactionJson.amount === 0 && !transactionJson.description) {
        console.error("Transaction JSON has no meaningful data:", transactionJson);
        return NextResponse.json({
          transcription,
          transaction: null,
        });
      }

      // Now apply categorization logic (3-tier approach)
      const description = transactionJson.description || "";
      const merchant = transactionJson.merchant || null;

      // Step 1: Check user-designated rules (exact match or contains)
      let categorizedCategory: string | null = null;
      const ruleMatch = checkUserRules(description, merchant, categorizationRules);
      
      if (ruleMatch && ruleMatch.category) {
        categorizedCategory = ruleMatch.category;
        console.log("Category assigned by rule:", categorizedCategory, "Rule ID:", ruleMatch.rule_id);
      } else {
        // Step 2 & 3: Use AI for categorization
        // Get AI context rules if any match
        const aiContextRules = getAIContextRules(description, merchant, categorizationRules);
        
        if (categories.length > 0) {
          // Build categorization prompt with categories and AI context rules
          const categorizationPrompt = buildCategorizationPrompt(
            description,
            merchant,
            categories,
            aiContextRules
          );

          console.log("Categorization prompt:", categorizationPrompt);

          // Call AI for categorization
          const categoryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "You are a helpful assistant that categorizes financial transactions. Return only the category name from the provided list, or 'null' if none apply.",
                },
                {
                  role: "user",
                  content: categorizationPrompt,
                },
              ],
              response_format: { type: "json_object" },
              max_tokens: 100,
            }),
          });

          if (categoryResponse.ok) {
            const categoryData = await categoryResponse.json();
            const categoryContent = categoryData.choices[0]?.message?.content;
            if (categoryContent) {
              try {
                const categoryResult = JSON.parse(categoryContent);
                // The AI should return { category: "Category Name" } or { category: null }
                categorizedCategory = categoryResult.category || null;
                console.log("Category assigned by AI:", categorizedCategory);
              } catch (e) {
                console.error("Failed to parse category response:", e);
              }
            }
          } else {
            console.warn("Category AI call failed, using null");
          }
        }
      }

      // Add the categorized category to the transaction
      transactionJson.category = categorizedCategory;
      
    } catch (parseError) {
      console.error("Failed to parse transaction JSON:", parseError);
      console.error("Content that failed to parse:", content);
      return NextResponse.json({
        transcription,
        transaction: null,
      });
    }

    return NextResponse.json({
      transcription,
      transaction: transactionJson,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
