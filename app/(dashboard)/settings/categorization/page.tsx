"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CategorizationRule {
  id: string;
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

interface Category {
  id: string;
  name: string;
}

export default function CategorizationRulesPage() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchCategories();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch("/api/categorization-rules");
      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error("Error fetching rules:", err);
      setError("Failed to load categorization rules");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    try {
      const response = await fetch(`/api/categorization-rules/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchRules();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete rule");
      }
    } catch (err) {
      alert("Failed to delete rule");
    }
  };

  const handleToggleActive = async (rule: CategorizationRule) => {
    try {
      const response = await fetch(`/api/categorization-rules/${rule.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: !rule.is_active,
        }),
      });

      if (response.ok) {
        fetchRules();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update rule");
      }
    } catch (err) {
      alert("Failed to update rule");
    }
  };

  const startEdit = (rule: CategorizationRule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingRule(null);
    setShowForm(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Categorization Rules</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage automatic transaction categorization rules
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Rules</h2>
            <button
              onClick={() => {
                setEditingRule(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              Add Rule
            </button>
          </div>

          {showForm && (
            <RuleForm
              rule={editingRule}
              categories={categories}
              onSave={() => {
                fetchRules();
                setShowForm(false);
                setEditingRule(null);
              }}
              onCancel={cancelEdit}
            />
          )}

          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No categorization rules yet. Click &quot;Add Rule&quot; to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Match Field
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Match Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rule.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.rule_type === "exact_match" && "Exact Match"}
                        {rule.rule_type === "contains" && "Contains"}
                        {rule.rule_type === "ai_context" && "AI Context"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.match_field === "description" ? "Description" : "Merchant"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.match_value}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.priority}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`px-2 py-1 text-xs rounded ${
                            rule.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {rule.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => startEdit(rule)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleForm({
  rule,
  categories,
  onSave,
  onCancel,
}: {
  rule: CategorizationRule | null;
  categories: Category[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name || "");
  const [ruleType, setRuleType] = useState<"exact_match" | "contains" | "ai_context">(
    rule?.rule_type || "contains"
  );
  const [matchField, setMatchField] = useState<"description" | "merchant">(
    rule?.match_field || "description"
  );
  const [matchValue, setMatchValue] = useState(rule?.match_value || "");
  const [category, setCategory] = useState(rule?.category || "");
  const [priority, setPriority] = useState(rule?.priority || 0);
  const [isActive, setIsActive] = useState(rule?.is_active !== false);
  const [aiContext, setAiContext] = useState(
    rule?.ai_context?.context || ""
  );
  const [possibleCategories, setPossibleCategories] = useState(
    rule?.ai_context?.possible_categories?.join(", ") || ""
  );
  const [examples, setExamples] = useState(
    rule?.ai_context?.examples?.join(", ") || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body: any = {
        name,
        rule_type: ruleType,
        match_field: matchField,
        match_value: matchValue,
        category,
        priority: parseInt(priority.toString()),
        is_active: isActive,
      };

      if (ruleType === "ai_context") {
        body.ai_context = {
          context: aiContext,
          possible_categories: possibleCategories
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c),
          examples: examples
            .split(",")
            .map((e) => e.trim())
            .filter((e) => e),
        };
      }

      const url = rule ? `/api/categorization-rules/${rule.id}` : "/api/categorization-rules";
      const method = rule ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save rule");
      }
    } catch (err) {
      setError("Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">{rule ? "Edit Rule" : "New Rule"}</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type *</label>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          >
            <option value="contains">Contains (Programmatic)</option>
            <option value="exact_match">Exact Match (Programmatic)</option>
            <option value="ai_context">AI Context (AI-assisted)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Match Field *</label>
          <select
            value={matchField}
            onChange={(e) => setMatchField(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          >
            <option value="description">Description</option>
            <option value="merchant">Merchant</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Match Value *</label>
          <input
            type="text"
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder={ruleType === "contains" ? "e.g., parking" : "e.g., WALMART"}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">Higher priority rules are checked first</p>
        </div>
      </div>

      {ruleType === "ai_context" && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Context *</label>
            <textarea
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              rows={3}
              placeholder="e.g., Walmart sells many types of products. Categorize based on the description details..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Possible Categories</label>
            <input
              type="text"
              value={possibleCategories}
              onChange={(e) => setPossibleCategories(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Food & Dining, Shopping, Healthcare (comma-separated)"
            />
            <p className="mt-1 text-xs text-gray-500">
              List categories the AI should consider for this merchant
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Examples</label>
            <input
              type="text"
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Groceries → Food & Dining, Electronics → Shopping (comma-separated)"
            />
            <p className="mt-1 text-xs text-gray-500">Examples to guide the AI</p>
          </div>
        </div>
      )}

      <div className="mt-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">Active</span>
        </label>
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
        </button>
      </div>
    </form>
  );
}

