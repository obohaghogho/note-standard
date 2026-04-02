import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
  // 1. Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/build/**",
      "**/coverage/**",
      "**/.github/**",
      "package-lock.json",
      "eslint.config.mjs"
    ],
  },

  // 2. Base recommended configuration
  js.configs.recommended,

  // 3. Client configuration (React + TypeScript)
  {
    files: ["client/src/**/*.{ts,tsx}", "client/*.ts"],
    extends: [
      ...tseslint.configs.recommended,
    ],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "import-x": importX,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.worker,
        ...globals.serviceworker,
      },
      parserOptions: {
        project: ["./client/tsconfig.app.json", "./client/tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: ["./client/tsconfig.app.json"],
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/ban-ts-comment": "warn",
      "import-x/no-unresolved": "off",
      "import-x/no-duplicates": "warn",
      "prefer-const": "error",
      "no-empty": "error",
      "no-undef": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // 4. Service Worker configuration (Public JS)
  {
    files: ["client/public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.worker,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },

  // 5. Server & Root Script configuration (Node.js + CommonJS)
  {
    files: ["server/**/*.js", "realtime-gateway/**/*.js", "*.js", "*.mjs", "scripts/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.commonjs,
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-console": "off",
      "no-prototype-builtins": "off",
    },
  }
);
