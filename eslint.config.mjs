import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  // Existing application baseline predates the React Compiler and typed-eslint
  // migration. Keep the previous rule scope; follow up with dedicated cleanup.
  { rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/immutability": "off",
    "react-hooks/purity": "off",
    "prefer-const": "off",
  } },
]);
