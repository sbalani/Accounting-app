import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("all app image stages use the same pinned Node 24 image and retain HEIC WASM", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const bases = [...dockerfile.matchAll(/^FROM (\S+) AS /gm)].map(match => match[1]);
  assert.equal(bases.length, 3);
  assert.equal(new Set(bases).size, 1);
  assert.match(bases[0], /^node:24\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/);
  assert.equal(existsSync("node_modules/libheif-js/libheif-wasm/libheif.wasm"), true);
  assert.match(dockerfile, /COPY --from=builder .*\/app\/node_modules\/libheif-js \.\/node_modules\/libheif-js/);
  assert.match(dockerfile, /HEALTHCHECK .*node.*127\.0\.0\.1:3000\/api\/health/);
  assert.equal(existsSync("public"), false); // Revisit runner COPY if public assets are added.
});
