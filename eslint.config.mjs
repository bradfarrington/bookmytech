import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The original client proposal, kept as a visual reference only. It is not
    // imported, built or typechecked, and it accounted for 273 of the 344 lint
    // problems on this repo — enough noise to hide every real one. Copies of it
    // live on other machines, so nothing is lost by not linting it here.
    "proposal/**",
  ]),
]);

export default eslintConfig;
