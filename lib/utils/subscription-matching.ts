export type BillingInterval = "monthly" | "yearly";
export type BillingProvider = "direct" | "apple";

export interface SubscriptionMatchCandidate {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  payment_method_id: string;
  merchant_id: string | null;
  statement_match_text: string | null;
  billing_provider: BillingProvider;
  billing_interval: BillingInterval;
  billing_month: number | null;
  is_active: boolean;
}

export interface SubscriptionTransaction {
  amount: number;
  transaction_date: string;
  payment_method_id: string;
  merchant_id: string | null;
  description: string | null;
}

function normalized(value: string | null): string {
  return (value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function isAppleBillingEntry(description: string | null): boolean {
  const text = normalized(description);
  return /(?:^|[^A-Z])(?:APPLE(?:\.COM)?\/BILL|ITUNES\.COM\/BILL|APPLE SERVICES)(?:$|[^A-Z])/.test(text) ||
    text === "APPLE";
}

function transactionDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function scheduledDate(year: number, zeroBasedMonth: number, dueDay: number): Date {
  const last = new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, zeroBasedMonth, Math.min(dueDay, last)));
}

export function nextBillingDate(subscription: Pick<SubscriptionMatchCandidate, "billing_interval" | "billing_month" | "due_day">, now = new Date()): Date {
  const year = now.getUTCFullYear();
  const month = subscription.billing_interval === "yearly" ? (subscription.billing_month || 1) - 1 : now.getUTCMonth();
  const next = scheduledDate(year, month, subscription.due_day);
  if (next.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return next;
  return subscription.billing_interval === "yearly"
    ? scheduledDate(year + 1, month, subscription.due_day)
    : scheduledDate(year, month + 1, subscription.due_day);
}

function closeToScheduledDate(date: Date, subscription: SubscriptionMatchCandidate): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const scheduled = subscription.billing_interval === "yearly"
    ? [-1, 0, 1].map(offset => scheduledDate(year + offset, (subscription.billing_month || 1) - 1, subscription.due_day))
    : [-1, 0, 1].map(offset => scheduledDate(year, month + offset, subscription.due_day));
  return scheduled.some(billingDate => Math.abs(date.getTime() - billingDate.getTime()) <= 2 * 86400000);
}

// Suggest only. Never change transaction links without an explicit user action.
export function matchingSubscriptions(transaction: SubscriptionTransaction, subscriptions: SubscriptionMatchCandidate[]): SubscriptionMatchCandidate[] {
  const date = transactionDate(transaction.transaction_date);
  if (!date || !Number.isFinite(transaction.amount) || transaction.amount >= 0) return [];
  const appleEntry = isAppleBillingEntry(transaction.description);
  return subscriptions.filter(sub => {
    if (!sub.is_active || sub.payment_method_id !== transaction.payment_method_id ||
        !Number.isFinite(sub.amount) || sub.amount <= 0 || !closeToScheduledDate(date, sub)) return false;
    const tolerance = sub.billing_provider === "apple" ? 0.01 : Math.max(0.01, sub.amount * 0.01);
    if (Math.abs(Math.abs(transaction.amount) - sub.amount) > tolerance + 0.000001) return false;
    if (sub.billing_provider === "apple") {
      return appleEntry && (!sub.statement_match_text ||
        normalized(transaction.description).includes(normalized(sub.statement_match_text)));
    }
    // Generic Apple postings cannot establish which direct merchant was paid.
    if (appleEntry) return false;
    return sub.statement_match_text
      ? normalized(transaction.description).includes(normalized(sub.statement_match_text))
      : Boolean(sub.merchant_id && sub.merchant_id === transaction.merchant_id);
  });
}

export function suggestionForSubscriptions(candidates: SubscriptionMatchCandidate[]) {
  if (candidates.length === 1) return {
    type: "link_to_existing" as const, subscription: candidates[0],
    confidence: candidates[0].billing_provider === "apple" ? "medium" as const : "high" as const,
  };
  if (candidates.length > 1) return {
    type: "choose_existing" as const, subscriptions: candidates,
    confidence: "medium" as const,
  };
  return null;
}
