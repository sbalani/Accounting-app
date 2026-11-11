import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/workspaces/invite/[token]/route";

test("invalid invitation token is rejected before any database access", async () => {
  const response = await GET(new Request("https://example.invalid"), { params: Promise.resolve({ token: "../admin" }) });
  assert.equal(response.status, 404);
});

test("anonymous invitation preview never leaks workspace, email or token", async () => {
  const token = "a".repeat(64);
  const response = await GET(new Request("https://example.invalid"), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 200);
  const payload = await response.text();
  assert.equal(payload.includes(token), false);
  assert.equal(payload.includes("@"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
