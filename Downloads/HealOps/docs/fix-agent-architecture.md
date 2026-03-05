# Fix Agent — Prompt Architecture & Processing

## Key Files
- `apps/backend/src/background/queue/fix-request/constants/fix-prompts.constant.ts` — Prompt builder
- `apps/backend/src/background/queue/fix-request/agent/fix-graph.ts` — LangGraph state machine
- `apps/backend/src/background/queue/fix-request/fix-request.processor.ts` — BullMQ processor
- `apps/backend/src/background/queue/fix-request/services/fix-agent.service.ts` — Service wrapper
- `apps/backend/src/background/queue/fix-request/services/error-classifier.service.ts` — Error classifier
- `apps/backend/src/repair-agent/prompts/error-type-prompts.ts` — Per-error-type detailed prompts (imported via `@repair-agent/prompts/error-type-prompts`)

---

## How The Prompt Works (Simple Explanation)

The prompt sent to the LLM has two parts: **System Prompt** and **User Prompt**.

### System Prompt = 3 pieces joined together

```
┌─────────────────────────────────────────────────┐
│  PIECE 1: Role + Rules (STATIC — never changes) │
│  "You are a surgical code-fixing agent..."       │
│  - Output format: action, lineNumber, fixedLine  │
│  - Two actions: replace / insert_after           │
│  - 7 rules: don't delete code, no ts-ignore...   │
├─────────────────────────────────────────────────┤
│  PIECE 2: Error-Type Rules (DYNAMIC)             │
│  Changes based on what KIND of error it is.      │
│  e.g. for "type_error" → detailed TS type rules  │
│  e.g. for "import_error" → import fixing rules   │
│  Source: error-type-prompts.ts (10 error types)  │
├─────────────────────────────────────────────────┤
│  PIECE 3: Language Rules (DYNAMIC)               │
│  Changes based on what LANGUAGE the code is.     │
│  e.g. TypeScript → strict mode, NestJS, aliases  │
│  e.g. Python → indentation rules                 │
│  Source: LANGUAGE_CONTEXT in fix-prompts.ts       │
└─────────────────────────────────────────────────┘
```

### How Piece 2 (Error-Type) is calculated:

```
CI error message
    ↓
Error Classifier LLM → outputs: "type_error"
    ↓
CODE_TO_PROMPT_KEY map → "type_error" → "TYPE_ERROR"
    ↓
ERROR_TYPE_PROMPTS["TYPE_ERROR"] → big block of text with:
  - What to investigate
  - How to fix it
  - Edge cases to watch out for
    ↓
Appended to system prompt as "--- ERROR-TYPE CONTEXT ---"
```

10 error types supported:
| Classifier Output | Prompt Key | Example Error |
|---|---|---|
| syntax_error | SYNTAX_ERROR | Missing semicolon, bracket |
| import_error | IMPORT_ERROR | Wrong import path |
| type_error | TYPE_ERROR | string vs number mismatch |
| export_error | EXPORT_ERROR | Symbol not exported |
| dto_interface_error | DTO_INTERFACE_ERROR | DTO shape mismatch |
| build_error | BUILD_CONFIGURATION_ERROR | tsconfig, webpack issue |
| test_failure | TEST_FAILURE | Failing test |
| missing_dependency | MISSING_DEPENDENCY | Package not installed |
| version_conflict | DEPENDENCY_VERSION_CONFLICT | Package version clash |
| package_json_error | PACKAGE_JSON_ERROR | Bad package.json |

### How Piece 3 (Language) is calculated:

```
Build error payload has "language" field (from file extension / CI config)
    ↓
If missing → defaults to "typescript"
    ↓
LANGUAGE_CONTEXT["typescript"] → TypeScript strict mode rules
```

6 languages: typescript, javascript, python, go, java, rust

### User Prompt (structure is static, content is dynamic — unique per error):

```
Error type: {classifiedErrorType}        ← from classifier LLM
Error message: {errorMessage}            ← from CI build logs
Error is on line {lineNumber}            ← parsed from CI error
File: {filePath}                         ← resolved to monorepo path

--- CODE (with line numbers) ---
{codeSnippet with line numbers}          ← fetched from GitHub at commit SHA
--- END CODE ---                            15 lines above + error line + 15 below

Fix the error on line {lineNumber}. Output ONLY the line(s) that need to change.
```

How this is built:
1. `enrichWithSourceCode()` fetches the ACTUAL file from GitHub at the commit SHA
2. Extracts 31 lines: 15 before error + error line + 15 after
3. Adds line numbers (e.g. `  52:  const x = foo();`)
4. `windowStartLine = Math.max(1, lineNumber - 15)` — ensures line numbers match the real file

---

## LLM Output Schema

The LLM responds with JSON:
```json
{
  "thinking": "Step-by-step: (1) error is string vs number (2) line 52 (3) wrap with Number()",
  "fixes": [
    {
      "action": "replace",
      "lineNumber": 52,
      "originalLine": "    const profile = await this.usersService.getProfile(user.id);",
      "fixedLine": "    const profile = await this.usersService.getProfile(Number(user.id));"
    }
  ],
  "summary": "Wrapped user.id with Number() on line 52",
  "confidence": 0.9
}
```

Two actions:
- `"replace"` — swap an existing line (must provide originalLine for verification)
- `"insert_after"` — add a NEW line after a given lineNumber (for missing imports etc.)

---

## Processor — How Fixes Are Applied

### Single Line Fix
1. Parse JSON array of fixes from LLM
2. Sort by lineNumber DESCENDING (bottom-to-top, so inserts don't shift line numbers)
3. For `replace`: verify `originalLine` matches actual content → skip if mismatch (safety)
4. For `insert_after`: splice new line into array after the specified position
5. Only listed lines change — impossible to delete unrelated code

### Multiple Errors in Same File
1. Group all fixes by file path
2. Fetch original content ONCE per file (cached)
3. Apply all fixes sequentially to ONE copy
4. Push single file with all fixes merged
5. Without this → second fix would overwrite the first

### Code Enrichment
- Replaces noisy CI log snippets with actual source code from GitHub
- Resolves monorepo paths (tries as-is, then `apps/backend/` prefix)
- Caches fetched files to avoid duplicate GitHub API calls

---

## Graph Flow

```
START → classify → scope_check → search_similar → generate_fix
                                                       ↓
                                              confidence ≥ 0.7?
                                              YES → END (auto-accept)
                                              NO  → evaluate_fix → retry/END
```

- maxAttempts: 1 (default)
- Auto-accept: confidence ≥ 0.7 skips evaluate_fix LLM call
- Similar fix overlap: 30% overlap required before applying cached fix
- `stripMarkdownFences()` handles OpenRouter wrapping JSON in ```json fences
