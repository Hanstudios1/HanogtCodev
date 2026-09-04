import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["electron/**/*.js", "scripts/**/*.js"],
    rules: {
      // These maintenance/desktop entry points intentionally use CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "android/app/src/main/assets/public/**",
    "ios/App/App/public/**",
    "dist-electron/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
