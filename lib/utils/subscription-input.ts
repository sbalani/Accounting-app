import type { BillingInterval, BillingProvider } from "./subscription-matching";

type CurrentSchedule = { billing_interval: BillingInterval; billing_month: number | null };
const editable = new Set([
  "name", "description", "statement_match_text", "amount", "due_day", "payment_method_id",
  "merchant_id", "category_id", "billing_provider", "billing_interval", "billing_month", "is_active",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubscriptionFields(body: Record<string, unknown>, current?: CurrentSchedule): Record<string, string | number | boolean | null> {
  if (Object.keys(body).some(key => !editable.has(key))) throw new Error("Unsupported subscription field");
  const fields: Record<string, string | number | boolean | null> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) throw new Error("Valid subscription name required");
    fields.name = body.name.trim();
  }
  for (const [key, maxLength] of [["description", 2000], ["statement_match_text", 256]] as const) {
    if (body[key] !== undefined) {
      if (body[key] !== null && typeof body[key] !== "string") throw new Error(`Invalid ${key}`);
      const value = typeof body[key] === "string" ? body[key].trim() : "";
      if (value.length > maxLength) throw new Error(`${key} is too long`);
      fields[key] = value || null;
    }
  }
  if (body.amount !== undefined) {
    const value = String(body.amount);
    if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) throw new Error("Amount must be positive with at most two decimal places");
    fields.amount = value; // Preserve PostgreSQL NUMERIC precision.
  }
  if (body.due_day !== undefined) {
    const value = Number(body.due_day);
    if (!Number.isInteger(value) || value < 1 || value > 31 || String(body.due_day).trim() !== String(value)) throw new Error("Due day must be from 1 to 31");
    fields.due_day = value;
  }
  for (const key of ["payment_method_id", "merchant_id", "category_id"] as const) {
    if (body[key] !== undefined) {
      if (key !== "payment_method_id" && (body[key] === null || body[key] === "")) fields[key] = null;
      else if (typeof body[key] === "string" && uuid.test(body[key])) fields[key] = body[key];
      else throw new Error(`Invalid ${key}`);
    }
  }
  if (body.billing_provider !== undefined) {
    if (body.billing_provider !== "direct" && body.billing_provider !== "apple") throw new Error("Invalid billing provider");
    fields.billing_provider = body.billing_provider as BillingProvider;
  }
  if (body.billing_interval !== undefined) {
    if (body.billing_interval !== "monthly" && body.billing_interval !== "yearly") throw new Error("Invalid billing interval");
    fields.billing_interval = body.billing_interval as BillingInterval;
  }
  if (body.billing_month !== undefined) {
    if (body.billing_month === null || body.billing_month === "") fields.billing_month = null;
    else {
      const value = Number(body.billing_month);
      if (!Number.isInteger(value) || value < 1 || value > 12 || String(body.billing_month).trim() !== String(value)) throw new Error("Billing month must be from 1 to 12");
      fields.billing_month = value;
    }
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") throw new Error("Invalid subscription status");
    fields.is_active = body.is_active;
  }

  const interval = fields.billing_interval ?? current?.billing_interval ?? "monthly";
  if (interval === "monthly" && body.billing_interval === "monthly" && body.billing_month === undefined) fields.billing_month = null;
  const month = fields.billing_month !== undefined ? fields.billing_month : current?.billing_month ?? null;
  if ((interval === "yearly" && month === null) || (interval === "monthly" && month !== null)) throw new Error("Billing month is required only for yearly subscriptions");
  return fields;
}
