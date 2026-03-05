import { FlatCompat } from "@eslint/eslintrc";
import unusedImports from "eslint-plugin-unused-imports";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      ".next/**/*",
      "node_modules/**/*",
      "dist/**/*",
      "build/**/*",
      ".vercel/**/*",
      "coverage/**/*",
      "playwright-report/**/*",
      "test-results/**/*",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json", "./tsconfig.*.json"],
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
    rules: {
      // Console logs: error (allow warn/error)
      "no-console": ["error", { allow: ["warn", "error"] }],

      // "Warn me on warning": produce a *warning* when console.warn is used
      "no-restricted-properties": [
        "warn",
        { object: "console", property: "warn", message: "Avoid console.warn" },
      ],

      // Unused imports: error (fail CI/build if lint runs)
      "unused-imports/no-unused-imports": "error",
      // Delegate unused vars handling to plugin; ignore leading underscores
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Duplicate imports: error
      "import/no-duplicates": ["error", { "prefer-inline": true }],
      // (optional) avoid self-imports, which often show up in cycle refactors
      "import/no-self-import": "error",

      // Prevent import cycles
      "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: Infinity }],
    },
  },
];

export default eslintConfig;
