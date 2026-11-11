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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      return NextResponse.json({ error: "Upload an audio file directly" }, { status: 400 });
    }

    // Use OpenAI Audio API for transcription
    // Prefer gpt-4o-transcribe (newer, better) but fallback to whisper-1 for compatibility
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "gpt-4o-transcribe");
    formData.append("response_format", "json");

    console.info("Audio transcription request started");

    let response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    // Fallback to whisper-1 if gpt-4o-transcribe is not available
    if (!response.ok) {
      console.warn("Audio transcription fallback", response.status);
      
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
      console.error("Audio transcription upstream failed", response.status);
      throw new Error(errorData.error?.message || "OpenAI API error");
    }

    const data = await response.json();
    const transcription = data.text;


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

    console.info("Audio transaction parsing request started");

    const parseResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!parseResponse.ok) {
      console.warn("Audio transaction parsing fallback", parseResponse.status);
      
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


      const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(fallbackRequestBody),
      });

      if (!fallbackResponse.ok) {
        console.error("Audio transaction parsing upstream failed", fallbackResponse.status);
        // If parsing fails, return just the transcription
        return NextResponse.json({
          transcription,
          transaction: null,
        });
      }

      const fallbackData = await fallbackResponse.json();
      const fallbackContent = fallbackData.choices[0]?.message?.content;
      
      if (fallbackContent) {
        try {
          let transactionJson = JSON.parse(fallbackContent);
          
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
        } catch {
          console.warn("Audio transaction fallback parse failed");
        }
      }
      
      return NextResponse.json({
        transcription,
        transaction: null,
      });
    }

    const parseData = await parseResponse.json();
    
    const content = parseData.choices[0]?.message?.content;
    const finishReason = parseData.choices[0]?.finish_reason;
    
    if (finishReason && finishReason !== "stop") {
      console.info("Audio transaction parse incomplete");
    }
    
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
      
      
      // Validate that we have the required fields (schema should ensure this, but double-check)
      if (transactionJson.amount === undefined || transactionJson.description === undefined || 
          transactionJson.transaction_date === undefined) {
        console.warn("Audio transaction missing required fields");
        return NextResponse.json({
          transcription,
          transaction: null,
        });
      }
      
      // Validate that we have at least an amount or description with meaningful content
      if (transactionJson.amount === 0 && !transactionJson.description) {
        console.warn("Audio transaction has no meaningful fields");
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
              } catch {
                console.warn("Audio transaction category response parse failed");
              }
            }
          } else {
            console.warn("Category AI call failed, using null");
          }
        }
      }

      // Add the categorized category to the transaction
      transactionJson.category = categorizedCategory;
      
    } catch {
      console.warn("Audio transaction parse failed");
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
