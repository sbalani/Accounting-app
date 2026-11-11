import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function unsafeConsoleArguments(contents: string, filename: string): string[] {
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "console" &&
        ["log", "info", "warn", "error", "debug"].includes(node.expression.name.text)) {
      const [event, code] = node.arguments;
      const safeStatus = code && ts.isPropertyAccessExpression(code) && code.name.text === "status" &&
        ts.isIdentifier(code.expression) && /^(response|parseResponse|fallbackResponse)$/.test(code.expression.text);
      if (!ts.isStringLiteral(event) || node.arguments.length < 1 || node.arguments.length > 2 ||
          (node.arguments.length === 2 && !safeStatus)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${filename}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}

test("runtime logging never includes data, raw errors, URLs or payload objects", () => {
  const files = ["app", "components", "lib"].flatMap(sources);
  const violations = files.flatMap(file => unsafeConsoleArguments(readFileSync(file, "utf8"), file));
  assert.deepEqual(violations, []);
});

test("log rule rejects raw upstream errors and prompts while permitting HTTP status", () => {
  assert.equal(unsafeConsoleArguments('console.error("failed", error)', "synthetic.ts").length, 1);
  assert.equal(unsafeConsoleArguments('console.log("prompt", JSON.stringify(body))', "synthetic.ts").length, 1);
  assert.deepEqual(unsafeConsoleArguments('console.error("upstream failed", response.status)', "synthetic.ts"), []);
});
