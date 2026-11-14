import test from "node:test";
import assert from "node:assert/strict";
import { isAppleBillingEntry, matchingSubscriptions, nextBillingDate, suggestionForSubscriptions,
  type SubscriptionMatchCandidate, type SubscriptionTransaction } from "../lib/utils/subscription-matching";
import { parseSubscriptionFields } from "../lib/utils/subscription-input";
import { archiveSubscription } from "../lib/utils/subscription-archive";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
const apple: SubscriptionMatchCandidate = {
  id: "33333333-3333-4333-8333-333333333333", name: "iCloud+", amount: 9.99,
  due_day: 31, payment_method_id: accountA, merchant_id: null,
  statement_match_text: "APPLE.COM/BILL", billing_provider: "apple",
  billing_interval: "monthly", billing_month: null, is_active: true,
};
const charge: SubscriptionTransaction = {
  amount: -9.99, transaction_date: "2026-02-28", payment_method_id: accountA,
  merchant_id: null, description: "APPLE.COM/BILL 12345",
};

test("Apple billing: account + cents + clamped billing date + actual statement entry", () => {
  assert.equal(isAppleBillingEntry(charge.description), true);
  assert.deepEqual(matchingSubscriptions(charge, [apple]).map(s => s.id), [apple.id]);
  assert.deepEqual(matchingSubscriptions({ ...charge, payment_method_id: accountB }, [apple]), []);
  assert.deepEqual(matchingSubscriptions({ ...charge, amount: -10.01 }, [apple]), []);
  assert.deepEqual(matchingSubscriptions({ ...charge, description: "APPLE STORE RETAIL" }, [apple]), []);
  assert.deepEqual(matchingSubscriptions({ ...charge, transaction_date: "2026-03-08" }, [apple]), []);
  assert.deepEqual(matchingSubscriptions(charge, [{ ...apple, is_active: false }]), []);
  assert.deepEqual(matchingSubscriptions(charge, [{ ...apple, statement_match_text: "ICLOUD" }]), []);
});

test("same-amount Apple services remain multiple candidates for manual choice", () => {
  const music = { ...apple, id: "44444444-4444-4444-8444-444444444444", name: "Apple Music" };
  const matches = matchingSubscriptions(charge, [apple, music]);
  assert.deepEqual(matches.map(s => s.name), ["iCloud+", "Apple Music"]);
  const suggestion = suggestionForSubscriptions(matches);
  assert.equal(suggestion?.type, "choose_existing");
  assert.equal(suggestion && "subscription" in suggestion, false); // Never pick one silently.
  assert.equal(suggestionForSubscriptions([apple])?.type, "link_to_existing");
  assert.deepEqual(matchingSubscriptions(charge, [{ ...apple, billing_provider: "direct", merchant_id: charge.merchant_id }]), []);
});

test("direct descriptor wins over merchant-only fallback; yearly schedules respect month", () => {
  const direct = { ...apple, billing_provider: "direct" as const, statement_match_text: "NETFLIX*BILL",
    merchant_id: "55555555-5555-4555-8555-555555555555" };
  const directCharge = { ...charge, description: "NETFLIX*BILL NOV", merchant_id: direct.merchant_id };
  assert.equal(matchingSubscriptions(directCharge, [direct]).length, 1);
  assert.deepEqual(matchingSubscriptions({ ...directCharge, description: "UNRELATED MERCHANT" }, [direct]), []);
  const annual = { ...apple, billing_interval: "yearly" as const, billing_month: 4, due_day: 15 };
  assert.equal(matchingSubscriptions({ ...charge, transaction_date: "2026-04-16" }, [annual]).length, 1);
  assert.deepEqual(matchingSubscriptions({ ...charge, transaction_date: "2026-05-16" }, [annual]), []);
  assert.equal(nextBillingDate({ billing_interval: "yearly", billing_month: 2, due_day: 31 },
    new Date("2026-02-01T00:00:00Z")).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(nextBillingDate({ billing_interval: "monthly", billing_month: null, due_day: 31 },
    new Date("2026-12-31T00:00:00Z")).toISOString().slice(0, 10), "2026-12-31");
});

test("subscription edits preserve NUMERIC cents, validate schedule and reject hidden fields", () => {
  const fields = parseSubscriptionFields({ name: " iCloud+ ", amount: "9.99", due_day: "31",
    payment_method_id: accountA, billing_provider: "apple", billing_interval: "yearly", billing_month: "4",
    statement_match_text: " APPLE.COM/BILL " });
  assert.equal(fields.name, "iCloud+");
  assert.equal(fields.amount, "9.99");
  assert.equal(fields.billing_month, 4);
  assert.equal(fields.statement_match_text, "APPLE.COM/BILL");
  assert.equal(parseSubscriptionFields({ billing_interval: "monthly" },
    { billing_interval: "yearly", billing_month: 4 }).billing_month, null);
  for (const invalid of [{ amount: "9.999" }, { amount: -1 }, { due_day: "1.5" },
    { billing_provider: "unknown" }, { billing_interval: "yearly" },
    { billing_interval: "monthly", billing_month: 4 }, { workspace_id: accountB }]) {
    assert.throws(() => parseSubscriptionFields(invalid));
  }
});

test("removal archives the subscription without touching linked transactions or claiming an absent row was removed", async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  let result: { id: string } | null = { id: apple.id };
  const query = {
    update(fields: unknown) { calls.push(["update", fields]); return this; },
    eq(field: string, value: unknown) { calls.push(["eq", field, value]); return this; },
    is(field: string, value: unknown) { calls.push(["is", field, value]); return this; },
    select(fields: string) { calls.push(["select", fields]); return this; },
    async maybeSingle() { return { data: result, error: null }; },
  };
  const client = { from(table: string) { calls.push(["from", table]); return query; } };
  assert.equal((await archiveSubscription(client as any, accountA, apple.id)).archived, true);
  assert.deepEqual(calls.filter(call => call[0] === "from"), [["from", "subscriptions"]]);
  const update = calls.find(call => call[0] === "update")?.[1] as { archived_at: string; is_active: boolean };
  assert.deepEqual(Object.keys(update).sort(), ["archived_at", "is_active"]);
  assert.equal(update.is_active, false);
  assert.match(update.archived_at, /^\d{4}-\d\d-\d\dT/);
  assert.ok(calls.some(call => call[0] === "eq" && call[1] === "workspace_id" && call[2] === accountA));
  assert.ok(calls.some(call => call[0] === "is" && call[1] === "archived_at" && call[2] === null));
  result = null;
  assert.equal((await archiveSubscription(client as any, accountA, apple.id)).archived, false);
});
