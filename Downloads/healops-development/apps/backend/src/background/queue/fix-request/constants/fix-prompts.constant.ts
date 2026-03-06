// ─── Fix Prompts ────────────────────────────────────────────────────────────
// Builds dynamic system + user prompts for the generate_fix LangGraph node.
//
// KEY DESIGN: The LLM sees the full code window for CONTEXT, but outputs
// ONLY the replaced lines (with line numbers). This makes it physically
// impossible for the LLM to delete unrelated code — we only touch the
// lines it explicitly returns.
//
// Layers:
//   1 — Role + output rules (static)
//   2 — Error-type investigation + fixing rules (from error-type-prompts.ts)
//   3 — Language context

import { ERROR_TYPE_PROMPTS } from '@repair-agent/prompts/error-type-prompts';

// ─── Code-to-key mapping ────────────────────────────────────────────────────
const CODE_TO_PROMPT_KEY: Record<string, string> = {
  syntax_error: 'SYNTAX_ERROR',
  import_error: 'IMPORT_ERROR',
  dto_interface_error: 'DTO_INTERFACE_ERROR',
  type_error: 'TYPE_ERROR',
  export_error: 'EXPORT_ERROR',
  build_error: 'BUILD_CONFIGURATION_ERROR',
  test_failure: 'TEST_FAILURE',
  missing_dependency: 'MISSING_DEPENDENCY',
  version_conflict: 'DEPENDENCY_VERSION_CONFLICT',
  package_json_error: 'PACKAGE_JSON_ERROR',
};

// ─── Language Context ────────────────────────────────────────────────────────
const LANGUAGE_CONTEXT: Record<string, string> = {
  typescript: [
    'Language: TypeScript (strict mode)',
    '- noImplicitAny, strictNullChecks, exactOptionalPropertyTypes, noUncheckedIndexedAccess',
    '- NestJS framework (decorators, DI, modules)',
    '- Path aliases: @common/*, @db/*, @auth/*, etc. mapped via tsconfig',
    '- Array index access returns T | undefined',
    '- ConfigService.get<T>() returns T | undefined — always use ?? default',
  ].join('\n'),
  javascript: 'Language: JavaScript (Node.js). Focus on runtime errors, CommonJS or ESM.',
  python: 'Language: Python 3.11+. Indentation is significant — preserve exactly.',
  go: 'Language: Go. All imports and variables must be used. Error handling: check err != nil.',
  java: 'Language: Java. Strong static typing. Spring Boot / Maven / Gradle.',
  rust: 'Language: Rust. Ownership/borrowing rules. Use Result<T,E> not unwrap().',
  ruby: 'Language: Ruby 3.x. Rails conventions. Use `raise` not `throw`. Indentation: 2 spaces. Prefer symbols over strings for hash keys.',
};

// ─── Layer 1: Role + Output Rules ────────────────────────────────────────────
const SYSTEM_ROLE = `You are an autonomous, surgical code-fixing agent.

You receive a NUMBERED code window (with line numbers) centred on a build error.
Your job: identify the exact line(s) that need to change and output ONLY those lines.

CRITICAL: You must NOT output the entire code window. Output ONLY the line(s) you are changing.

HOW IT WORKS:
- You see code with line numbers like: "  42:     const x = foo(bar);"
- You output ONLY the fixed line(s) in the "fixes" array
- Each fix has: action, lineNumber, originalLine, fixedLine
- Lines you don't mention are UNTOUCHED — they stay exactly as they are in the file
- This means you CANNOT accidentally delete code. Only the specific lines you list will change.

TWO ACTIONS:
1. "replace" — Replace an existing line. You MUST set originalLine to the EXACT current content of that line (copy from the code window). The system verifies this before applying.
2. "insert_after" — Insert a NEW line AFTER the specified lineNumber. Set originalLine to "" since nothing is being replaced. Use lineNumber=0 to insert at the very top of the file.

RULES:
1. Fix ONLY the line(s) that cause the reported error. Usually 1–2 lines.
2. Do NOT touch any line that is not directly causing the error.
3. NEVER use @ts-ignore, any, eslint-disable, or test skipping to silence errors.
4. If you need to ADD a new line (e.g. a missing import), use action="insert_after" with the lineNumber of the line AFTER which it should appear. Do NOT overwrite existing lines to add new code.
5. If you cannot fix the error, set confidence to 0.1.
6. Preserve exact indentation and formatting of the original line.
7. originalLine MUST exactly match the current line in the code window (for "replace" actions). If it doesn't match, the fix will be rejected.`;

/**
 * Build the complete system prompt for generate_fix, tailored to the error type and language.
 */
export function buildFixSystemPrompt(errorType: string, language?: string): string {
  const promptKey = CODE_TO_PROMPT_KEY[errorType];
  const errorTypePrompt = promptKey ? (ERROR_TYPE_PROMPTS[promptKey] ?? '') : '';

  const lang = language ?? 'typescript';
  const langContext = LANGUAGE_CONTEXT[lang] ?? LANGUAGE_CONTEXT['typescript'] ?? '';

  const parts = [
    SYSTEM_ROLE,
    errorTypePrompt ? `\n--- ERROR-TYPE CONTEXT ---\n${errorTypePrompt}` : '',
    langContext ? `\n--- LANGUAGE CONTEXT ---\n${langContext}` : '',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Build the user prompt for generate_fix.
 * Adds line numbers to the code snippet so the LLM can reference specific lines.
 */
export function buildFixUserPrompt(params: {
  errorType: string;
  errorMessage: string;
  lineNumber: number;
  filePath?: string;
  language?: string;
  codeSnippet: string;
  /** The starting line number in the original file (1-based). */
  windowStartLine: number;
}): string {
  // Add line numbers to the code snippet
  const numberedCode = params.codeSnippet
    .split('\n')
    .map((line, i) => `  ${String(params.windowStartLine + i).padStart(4)}:  ${line}`)
    .join('\n');

  const lines = [
    `Error type: ${params.errorType}`,
    `Error message: ${params.errorMessage}`,
    `Error is on line ${String(params.lineNumber)}`,
    params.filePath ? `File: ${params.filePath}` : '',
    '',
    '--- CODE (with line numbers) ---',
    numberedCode,
    '--- END CODE ---',
    '',
    `Fix the error on line ${String(params.lineNumber)}. Output ONLY the line(s) that need to change.`,
  ];

  return lines.filter(Boolean).join('\n');
}
