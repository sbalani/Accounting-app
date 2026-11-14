"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";
import { nextBillingDate, type BillingInterval, type BillingProvider } from "@/lib/utils/subscription-matching";

interface Subscription {
  id: string;
  name: string;
  description: string | null;
  statement_match_text: string | null;
  billing_provider: BillingProvider;
  billing_interval: BillingInterval;
  billing_month: number | null;
  amount: number;
  due_day: number;
  payment_method_id: string;
  merchant_id: string | null;
  category_id: string | null;
  is_active: boolean;
  total_expense?: number;
  transaction_count?: number;
  payment_methods?: {
    name: string;
    type: string;
    currency?: string;
  };
  merchants?: {
    id: string;
    name: string;
  };
  transaction_categories?: {
    id: string;
    name: string;
    color?: string;
  };
}

type SubscriptionForm = {
  name: string;
  description: string;
  statement_match_text: string;
  amount: string;
  due_day: string;
  billing_provider: BillingProvider;
  billing_interval: BillingInterval;
  billing_month: string;
  payment_method_id: string;
  merchant_id: string;
  category_id: string;
};

const emptyForm = (): SubscriptionForm => ({
  name: "", description: "", statement_match_text: "", amount: "", due_day: "1",
  billing_provider: "direct", billing_interval: "monthly", billing_month: "",
  payment_method_id: "", merchant_id: "", category_id: "",
});

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("USD");
  const [paymentMethods, setPaymentMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SubscriptionForm>(emptyForm);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions");
      if (!response.ok) {
        throw new Error("Failed to fetch subscriptions");
      }
      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
    Promise.all([fetch("/api/payment-methods"), fetch("/api/merchants"), fetch("/api/categories")])
      .then(async ([accounts, merchantsResponse, categoriesResponse]) => {
        if (!accounts.ok || !merchantsResponse.ok || !categoriesResponse.ok) throw new Error("Unable to load edit options");
        const [accountData, merchantData, categoryData] = await Promise.all([
          accounts.json(), merchantsResponse.json(), categoriesResponse.json(),
        ]);
        setPaymentMethods(accountData.paymentMethods || []);
        setMerchants(merchantData.merchants || []);
        setCategories(categoryData.categories || []);
      })
      .catch(() => setActionError("Could not load accounts, merchants or categories for editing."));
    fetch("/api/workspaces/current")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.workspace?.primary_currency) {
          setPrimaryCurrency(data.workspace.primary_currency);
        }
      })
      .catch(() => {});
  }, [fetchSubscriptions]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    setActionError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update subscription");
      }

      await fetchSubscriptions();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (subscription: Subscription) => {
    setEditingId(subscription.id);
    setCreating(false);
    setActionError(null);
    setForm({
      name: subscription.name,
      description: subscription.description || "",
      statement_match_text: subscription.statement_match_text || "",
      amount: String(subscription.amount),
      due_day: String(subscription.due_day),
      billing_provider: subscription.billing_provider,
      billing_interval: subscription.billing_interval,
      billing_month: subscription.billing_month ? String(subscription.billing_month) : "",
      payment_method_id: subscription.payment_method_id,
      merchant_id: subscription.merchant_id || "",
      category_id: subscription.category_id || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm());
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(editingId ? `/api/subscriptions/${editingId}` : "/api/subscriptions", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || null,
          statement_match_text: form.statement_match_text.trim() || null,
          merchant_id: form.merchant_id || null,
          category_id: form.category_id || null,
          billing_month: form.billing_interval === "yearly" ? form.billing_month : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update subscription");
      }

      handleCancelEdit();
      await fetchSubscriptions();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this subscription from your list? Historical transactions and balances will remain untouched.")) {
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete subscription");
      }

      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="text-center py-8">Loading subscriptions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  const activeSubscriptions = subscriptions.filter((s) => s.is_active);
  const totalYearlyCost = activeSubscriptions.reduce((sum, s) =>
    sum + Math.abs(s.amount) * (s.billing_interval === "yearly" ? 1 : 12), 0);
  const totalMonthlyCost = totalYearlyCost / 12;

  // Calculate next billing dates
  const today = new Date();
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  // Sort subscriptions by next billing date
  const subscriptionsWithDates = subscriptions.map((sub) => ({
    ...sub,
    nextBillingDate: nextBillingDate(sub, today),
  }));

  subscriptionsWithDates.sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return a.nextBillingDate.getTime() - b.nextBillingDate.getTime();
  });

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subscriptions</h1>
              <p className="mt-2 text-sm text-gray-600">
                Track and manage your recurring subscriptions
              </p>
              <p className="mt-1 text-xs text-gray-500">Marking one cancelled only stops tracking it here. Cancel actual charges with Apple or the merchant.</p>
            </div>
            <button type="button" disabled={saving || paymentMethods.length === 0}
              onClick={() => { setEditingId(null); setCreating(true); setActionError(null); setForm(emptyForm()); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              Add Subscription
            </button>
          </div>
        </div>

        {actionError && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

        {(creating || editingId) && (
          <form className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4" onSubmit={(event) => { event.preventDefault(); handleSaveEdit(); }}>
            <h2 className="text-lg font-semibold mb-3">{editingId ? "Edit subscription" : "Add subscription"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">Display name *
                <input required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="mt-1 block w-full rounded border p-2" placeholder="iCloud+" />
              </label>
              <label className="text-sm">Statement entry
                <input maxLength={256} value={form.statement_match_text} onChange={e => setForm({ ...form, statement_match_text: e.target.value })}
                  className="mt-1 block w-full rounded border p-2" placeholder="APPLE.COM/BILL" />
              </label>
              <label className="text-sm">Billed by
                <select value={form.billing_provider} onChange={e => setForm({ ...form, billing_provider: e.target.value as BillingProvider })}
                  className="mt-1 block w-full rounded border p-2">
                  <option value="direct">Merchant directly</option><option value="apple">Apple subscriptions</option>
                </select>
              </label>
              <label className="text-sm">Expected amount ({primaryCurrency}) *
                <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="mt-1 block w-full rounded border p-2" />
              </label>
              <label className="text-sm">Billed
                <select value={form.billing_interval} onChange={e => setForm({ ...form, billing_interval: e.target.value as BillingInterval,
                  billing_month: e.target.value === "yearly" ? form.billing_month || String(today.getUTCMonth() + 1) : "" })}
                  className="mt-1 block w-full rounded border p-2">
                  <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="text-sm">Billing day *
                <input required type="number" min="1" max="31" step="1" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })}
                  className="mt-1 block w-full rounded border p-2" />
              </label>
              {form.billing_interval === "yearly" && (
                <label className="text-sm">Billing month *
                  <select required value={form.billing_month} onChange={e => setForm({ ...form, billing_month: e.target.value })}
                    className="mt-1 block w-full rounded border p-2">
                    <option value="">Select month</option>
                    {Array.from({ length: 12 }, (_, month) => <option key={month} value={month + 1}>
                      {new Date(Date.UTC(2024, month, 1)).toLocaleString(undefined, { month: "long", timeZone: "UTC" })}
                    </option>)}
                  </select>
                </label>
              )}
              <label className="text-sm">Payment account *
                <select required value={form.payment_method_id} onChange={e => setForm({ ...form, payment_method_id: e.target.value })}
                  className="mt-1 block w-full rounded border p-2">
                  <option value="">Select account</option>
                  {paymentMethods.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Merchant (optional)
                <select value={form.merchant_id} onChange={e => setForm({ ...form, merchant_id: e.target.value })}
                  className="mt-1 block w-full rounded border p-2">
                  <option value="">None</option>
                  {merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Category (optional)
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  className="mt-1 block w-full rounded border p-2">
                  <option value="">None</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm md:col-span-3">Notes (optional)
                <textarea maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="mt-1 block w-full rounded border p-2" />
              </label>
            </div>
            <p className="mt-3 text-xs text-gray-600">For Apple charges, use the service name as the display name and the actual card statement entry as matching text. Same-amount Apple charges require your confirmation before linking.</p>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{saving ? "Saving..." : "Save subscription"}</button>
              <button type="button" onClick={handleCancelEdit} disabled={saving} className="rounded border px-4 py-2">Close</button>
            </div>
          </form>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-1">Total Active Subscriptions</p>
            <p className="text-2xl font-bold text-gray-900">{activeSubscriptions.length}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
             <p className="text-sm text-gray-600 mb-1">Monthly Equivalent</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalMonthlyCost, primaryCurrency)}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
             <p className="text-sm text-gray-600 mb-1">Yearly Equivalent</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalYearlyCost, primaryCurrency)}</p>
          </div>
        </div>

        {/* Subscriptions List */}
        {subscriptions.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">No subscriptions found.</p>
            <p className="text-sm text-gray-500">
              Add a subscription above or mark a transaction as a subscription from the{" "}
              <Link href="/transactions" className="text-blue-600 hover:text-blue-500 font-medium">
                Transactions page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Expected Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Spent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Day
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Billing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Merchant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {subscriptionsWithDates.map((subscription) => {
                   const daysUntil = Math.round(
                     (subscription.nextBillingDate.getTime() - startOfToday) / (1000 * 60 * 60 * 24)
                   );
                  const isUpcoming = daysUntil <= 7 && subscription.is_active;

                  return (
                    <tr key={subscription.id} className={isUpcoming ? "bg-yellow-50" : ""}>
                      <td className="px-6 py-4">
                         <div>
                           <div className="text-sm font-medium text-gray-900">{subscription.name}</div>
                           <div className="text-xs text-gray-500">{subscription.billing_provider === "apple" ? "Apple billing" : "Direct billing"} · {subscription.billing_interval}</div>
                           {subscription.statement_match_text && <div className="text-xs text-gray-500 mt-1">Statement: {subscription.statement_match_text}</div>}
                           {subscription.description && <div className="text-xs text-gray-500 mt-1">{subscription.description}</div>}
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                        {formatCurrency(Math.abs(subscription.amount), primaryCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(subscription.total_expense || 0, primaryCurrency)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {subscription.transaction_count || 0} {subscription.transaction_count === 1 ? "payment" : "payments"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                         {subscription.billing_interval === "yearly" && subscription.billing_month
                           ? `${new Date(Date.UTC(2024, subscription.billing_month - 1, 1)).toLocaleString(undefined, { month: "short", timeZone: "UTC" })} ${subscription.due_day}`
                           : subscription.due_day}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                           {subscription.nextBillingDate.toLocaleDateString(undefined, { timeZone: "UTC" })}
                          {isUpcoming && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {daysUntil} {daysUntil === 1 ? "day" : "days"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.payment_methods?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.merchants?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {subscription.transaction_categories?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            subscription.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                           {subscription.is_active ? "Active" : "Cancelled"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                         <div className="flex items-center space-x-2">
                           <button type="button" onClick={() => handleStartEdit(subscription)} disabled={saving}
                             className="text-blue-600 hover:text-blue-500 disabled:opacity-50">Edit</button>
                           <button
                             onClick={() => handleToggleActive(subscription.id, subscription.is_active)}
                             disabled={saving}
                             title="Tracking only. Cancel actual charges with Apple or the merchant."
                            className={`${
                              subscription.is_active
                                ? "text-gray-600 hover:text-gray-900"
                                : "text-green-600 hover:text-green-900"
                            }`}
                          >
                             {subscription.is_active ? "Mark cancelled" : "Resume tracking"}
                          </button>
                          <button
                             onClick={() => handleDelete(subscription.id)}
                             disabled={saving}
                            className="text-red-600 hover:text-red-500"
                          >
                             Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
