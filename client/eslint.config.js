import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),

  // React hooks flat config (registers its own plugin + rules)
  reactHooks.configs.flat.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    plugins: {
      "react-refresh": reactRefresh,
      "import-x": importX,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: "./tsconfig.app.json",
        },
      },
    },
    rules: {
      // React refresh
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Catch unresolved imports — the #1 cause of Vercel build failures
      "import-x/no-unresolved": "error",

      // Catch named exports that don't exist in the target module
      "import-x/named": "error",

      // Catch default imports from modules that have no default export
      "import-x/default": "error",

      // Prevent importing from the same module twice
      "import-x/no-duplicates": "warn",
    },
  },
]);
