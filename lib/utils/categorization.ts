/**
 * Categorization utility with 3-tier approach:
 * 1. User-designated rules (exact matches)
 * 2. AI-based categorization (with category list)
 * 3. User-defined AI rules (context-aware)
 */

export interface CategorizationRule {
  id: string;
  workspace_id: string;
  name: string;
  rule_type: "exact_match" | "contains" | "ai_context";
  match_field: "description" | "merchant";
  match_value: string;
  category: string;
  ai_context?: {
    context: string;
    possible_categories: string[];
    examples?: string[];
  } | null;
  priority: number;
  is_active: boolean;
}

export interface CategorizationResult {
  category: string | null;
  method: "rule" | "ai" | "ai_context_rule" | null;
  rule_id?: string;
}

/**
 * Check if a transaction matches user-defined exact match or contains rules
 */
export function checkUserRules(
  description: string | null,
  merchant: string | null,
  rules: CategorizationRule[]
): CategorizationResult | null {
  // Filter to active rules, sort by priority (highest first)
  const activeRules = rules
    .filter((r) => r.is_active && (r.rule_type === "exact_match" || r.rule_type === "contains"))
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeRules) {
    const fieldValue = rule.match_field === "description" ? description : merchant;
    
    if (!fieldValue) continue;

    let matches = false;
    if (rule.rule_type === "exact_match") {
      matches = fieldValue.toLowerCase() === rule.match_value.toLowerCase();
    } else if (rule.rule_type === "contains") {
      matches = fieldValue.toLowerCase().includes(rule.match_value.toLowerCase());
    }

    if (matches) {
      return {
        category: rule.category,
        method: "rule",
        rule_id: rule.id,
      };
    }
  }

  return null;
}

/**
 * Get AI context rules that match the transaction
 */
export function getAIContextRules(
  description: string | null,
  merchant: string | null,
  rules: CategorizationRule[]
): CategorizationRule[] {
  return rules
    .filter(
      (r) =>
        r.is_active &&
        r.rule_type === "ai_context" &&
        ((r.match_field === "description" && description) ||
          (r.match_field === "merchant" && merchant))
    )
    .filter((r) => {
      const fieldValue = r.match_field === "description" ? description : merchant;
      if (!fieldValue) return false;

      if (r.rule_type === "ai_context") {
        // For AI context rules, we check if the match_value is contained
        return fieldValue.toLowerCase().includes(r.match_value.toLowerCase());
      }
      return false;
    })
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Build AI prompt for categorization with category list and context rules
 */
export function buildCategorizationPrompt(
  description: string,
  merchant: string | null,
  categories: string[],
  aiContextRules: CategorizationRule[]
): string {
  let prompt = `Categorize this transaction into one of the following categories:\n${categories.map((c) => `- ${c}`).join("\n")}\n\n`;

  if (merchant) {
    prompt += `Merchant/Vendor: ${merchant}\n`;
  }
  prompt += `Description: ${description}\n\n`;

  if (aiContextRules.length > 0) {
    prompt += `Context Rules:\n`;
    for (const rule of aiContextRules) {
      prompt += `- For "${rule.match_value}" (${rule.match_field}): ${rule.ai_context?.context || ""}\n`;
      if (rule.ai_context?.possible_categories && rule.ai_context.possible_categories.length > 0) {
        prompt += `  Possible categories: ${rule.ai_context.possible_categories.join(", ")}\n`;
      }
      if (rule.ai_context?.examples && rule.ai_context.examples.length > 0) {
        prompt += `  Examples: ${rule.ai_context.examples.join(", ")}\n`;
      }
    }
    prompt += `\n`;
  }

  prompt += `Return the most appropriate category name from the list above, or null if none apply.`;

  return prompt;
}

