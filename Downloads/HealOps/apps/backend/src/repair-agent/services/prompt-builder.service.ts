// ─── Prompt Builder Service ──────────────────────────────────────────────────
// Constructs structured prompts for Claude via OpenRouter.
//
// Prompt Architecture:
// ┌─────────────────────────────────────────────────────────────┐
// │ SYSTEM PROMPT                                               │
// │ ├── Layer 1: Role + Constraints (hardcoded, every request)  │
// │ ├── Layer 2: Error-Type-Specific Prompt (per error type)    │
// │ ├── Layer 3: Language Context (per detected language)        │
// │ ├── Layer 4: Error Classification (per request)             │
// │ └── Layer 5: Output Schema (hardcoded, every request)       │
// ├─────────────────────────────────────────────────────────────┤
// │ USER PROMPT                                                 │
// │ ├── RAG Examples (if available, from vector memory)         │
// │ ├── Retry History (if retrying, previous failed attempts)   │
// │ ├── Affected File (truncated to MAX_AFFECTED_FILE_LINES)    │
// │ ├── Related Files (truncated to MAX_RELATED_FILE_LINES)     │
// │ └── CI Failure Log (error snippet from CI logs)             │
// └─────────────────────────────────────────────────────────────┘
//
// Design: Only include rules here that REQUIRE LLM reasoning.
// Deterministic rules (no @ts-ignore, no eslint-disable, etc.) are enforced
// by the QualityGateService — the LLM doesn't need to be told about those.

import { Injectable, Logger } from '@nestjs/common';
import { ERROR_TYPE_PROMPTS } from '../prompts/error-type-prompts';
import { scrubSecrets } from '@common/utils/secret-scrubber';

// ─── Truncation Constants ────────────────────────────────────────────────────
// Prevent prompt bloat from large files

/** Max lines for the primary affected file */
const MAX_AFFECTED_FILE_LINES = 500;

/** Max lines per related file */
const MAX_RELATED_FILE_LINES = 200;

/** Max number of related files to include */
const MAX_RELATED_FILES = 5;

/** Max total chars for the entire user prompt (~8K tokens) */
const MAX_USER_PROMPT_CHARS = 32000;

// ─── Layer 1: System Prompt — Role and Constraints ──────────────────────────
// Sent with EVERY request. Defines the agent's identity and strict rules.

const SYSTEM_PROMPT_ROLE = `You are an autonomous code-fixing agent for NestJS + TypeScript projects running in CI.

Your job is to fix a single reported error with the smallest safe change possible.

CORE OBJECTIVE:
Fix the exact reported error without introducing new issues.

STRICT RULES:

1. Scope Control
   - Fix ONLY the reported error.
   - Do NOT refactor, reformat, or improve unrelated code.
   - Do NOT rename variables, move files, or restructure architecture unless absolutely required to fix the error.
   - Keep changes minimal and localized.

2. Safety Rules
   - NEVER use:
     - @ts-ignore
     - @ts-nocheck
     - any
     - eslint-disable
     - test expectation modification
     - skipping tests
   - NEVER silence the error. Fix the root cause.
   - NEVER modify package.json unless the error is dependency-related.
   - NEVER downgrade TypeScript strictness.

3. Test Integrity
   - If tests fail, fix implementation — not the test.
   - Do not change expected values just to pass tests.
   - Preserve intended business logic.

4. Determinism
   - Do not guess missing business rules.
   - If required information is missing, set can_fix: false with a clear reason.

5. Idempotency
   - If the provided code is already correct, set can_fix: false with reason "Code already correct or error not reproducible from provided context."

6. Multi-File Awareness
   - Only include files that require changes.
   - Do NOT return unchanged files.
   - Do NOT rewrite entire files if only a small block changes.
   - Preserve imports and formatting style.

7. Loop Prevention
   - If the error appears to be caused by a previous automated fix, explicitly mention it in diagnosis.
   - Avoid reverting working logic unless clearly incorrect.
   - Do NOT repeat a fix strategy that already failed in previous attempts.`;

// ─── Layer 3: Language Context ──────────────────────────────────────────────

const LANGUAGE_CONTEXT: Record<string, string> = {
  typescript: `Language: TypeScript
- Uses strict mode with noImplicitAny, strictNullChecks, exactOptionalPropertyTypes, noUncheckedIndexedAccess
- Framework: NestJS (decorators, dependency injection, modules)
- Build: tsc --noEmit for compilation check
- Imports use @/ path aliases mapped via tsconfig.json paths
- Prefer 'import type' for type-only imports
- Use 'unknown' with type guards instead of 'any'
- Array index access returns T | undefined due to noUncheckedIndexedAccess
- ConfigService.get<T>() returns T | undefined — always use ?? defaultValue`,

  javascript: `Language: JavaScript (Node.js)
- CommonJS require() or ES module import/export
- No type annotations — focus on runtime errors
- Check for undefined/null access patterns
- Verify module.exports match what consumers expect`,

  python: `Language: Python 3.11+
- Uses type hints (PEP 484) but runtime errors may not match hints
- Framework clues: FastAPI (Pydantic), Django, Flask
- Import resolution: relative imports, __init__.py, sys.path
- Indentation is syntactically significant — preserve exactly
- Check for missing __init__.py in package directories`,

  go: `Language: Go
- Strict compiler — all imports must be used, all variables must be used
- Error handling: check err != nil after every call that returns error
- Package structure: one package per directory, package name matches directory
- Interface satisfaction is implicit — no 'implements' keyword
- Use gofmt-compatible formatting in the diff`,

  java: `Language: Java
- Strong static typing with generics
- Framework clues: Spring Boot, Maven/Gradle
- Import every class explicitly — no wildcard imports in strict projects
- Check classpath and dependency scope (compile vs runtime vs test)
- Null safety: use Optional<T> or @Nullable/@NonNull annotations`,

  rust: `Language: Rust
- Strict ownership and borrowing rules enforced by the compiler
- Common errors: borrow checker violations, lifetime mismatches, type mismatches
- Error handling: use Result<T, E> and the ? operator, not unwrap() in library code
- Match exhaustiveness is required — all enum variants must be handled
- Cargo.toml for dependencies — check feature flags`,

  csharp: `Language: C#
- Framework: .NET / ASP.NET Core
- Strong static typing with nullable reference types (NRT)
- Dependency injection via IServiceCollection
- Check for CS8600 (nullable assignment), CS8602 (nullable dereference)
- Async methods must return Task<T> — check for missing await`,

  css: `Language: CSS / SCSS / Sass / Less
- CSS syntax: selectors, properties, values with semicolons
- SCSS/Sass: nesting, variables ($var), mixins (@mixin/@include), @use/@forward
- Tailwind: utility classes, @apply directive, content paths in config
- CSS Modules: class names exported as JavaScript objects (*.module.css)
- PostCSS: plugin pipeline, autoprefixer, custom transforms
- Indentation matters for Sass (indented syntax), not for SCSS
- Check for vendor-prefixed properties, deprecated features, and browser compatibility`,

  graphql: `Language: GraphQL (SDL + Queries)
- Schema Definition Language: type, input, enum, interface, union, scalar
- Queries, mutations, subscriptions with proper field selection
- Fragment definitions must reference valid types
- Directives: @deprecated, @auth, custom directives
- Codegen tools (graphql-codegen) generate TypeScript types from schema
- Check for: unknown types, missing fields, invalid input types, enum mismatches`,

  yaml: `Language: YAML (Configuration)
- YAML is whitespace-sensitive — indentation defines structure (2 spaces typical)
- No tabs allowed — only spaces for indentation
- Strings may be unquoted, single-quoted, or double-quoted
- Colons must be followed by a space in key-value pairs
- GitHub Actions: jobs, steps, uses/run, matrix, expressions (\${{ }})
- Docker Compose: services, volumes, networks, environment
- Check for: incorrect indentation, missing colons, unquoted special chars`,

  docker: `Language: Dockerfile
- Instructions: FROM, RUN, COPY, ADD, ENV, ARG, WORKDIR, EXPOSE, ENTRYPOINT, CMD
- Multi-stage builds: FROM ... AS stage, COPY --from=stage
- Build context: COPY paths are relative to build context, not Dockerfile location
- .dockerignore controls what files are available during COPY/ADD
- Layer caching: order instructions from least to most frequently changing
- Check for: missing files in COPY, wrong base image tags, RUN command failures`,
};

// ─── Layer 4: Error Classification ──────────────────────────────────────────

function buildErrorClassification(ctx: { errorTypeCode: string; language: string }): string {
  return `Error Classification:
- Detected error type: ${ctx.errorTypeCode}
- Language: ${ctx.language}
- Focus your diagnosis on this error category first, then look for related issues.`;
}

// ─── Layer 5: Output Schema ─────────────────────────────────────────────────

const OUTPUT_SCHEMA = `RESPONSE FORMAT (STRICT JSON ONLY):
Respond with a JSON object ONLY. No preamble, no markdown fences, no explanation outside the JSON.

{
  "diagnosis": "string — one-line root cause of the error (max 200 chars)",
  "fix_strategy": "string — how you will fix it (max 300 chars)",
  "confidence": "number between 0.0 and 1.0 — how confident you are in this fix",
  "can_fix": "boolean — false if you cannot fix with confidence",
  "cannot_fix_reason": "string if can_fix is false, else empty string",
  "diff": "string — unified diff (git diff format) if can_fix is true, else empty string",
  "files_modified": ["array of file paths changed in the diff"]
}

IMPORTANT:
- Output valid JSON only.
- No explanations outside JSON.
- No markdown.
- No comments.
- No additional keys.`;

// ─── RAG Examples ───────────────────────────────────────────────────────────

function buildRagExamples(ragExamples: string[]): string {
  if (ragExamples.length === 0) return '';
  return `--- SIMILAR PAST FIXES (for reference — adapt, do not copy blindly) ---
${ragExamples.map((ex, i) => `Example ${String(i + 1)}:\n${ex}`).join('\n\n')}
--- END SIMILAR FIXES ---`;
}

// ─── Retry History ──────────────────────────────────────────────────────────

interface PreviousAttempt {
  attemptNumber: number;
  diagnosis: string;
  fixStrategy: string;
  confidence: number;
  diffContent: string;
  validationError: string;
}

function buildRetryHistory(attempts: PreviousAttempt[]): string {
  if (attempts.length === 0) return '';

  const history = attempts
    .map(
      a => `Attempt ${String(a.attemptNumber)}:
  Diagnosis: ${a.diagnosis}
  Strategy: ${a.fixStrategy}
  Confidence: ${String(a.confidence)}
  Result: FAILED
  Error: ${a.validationError}
  Diff tried:
${truncateText(a.diffContent, 2000)}`
    )
    .join('\n\n');

  return `--- PREVIOUS ATTEMPTS (these FAILED — do NOT repeat the same fix or strategy) ---
${history}
--- END PREVIOUS ATTEMPTS ---`;
}

// ─── Utility: Truncation ────────────────────────────────────────────────────

function truncateLines(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  const kept = lines.slice(0, maxLines);
  kept.push(`\n... (truncated — ${String(lines.length - maxLines)} more lines)`);
  return kept.join('\n');
}

function truncateText(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n... (truncated)';
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────

export interface PromptContext {
  language: string;
  errorTypeCode: string;
  affectedFile: string;
  fileContents: Record<string, string>;
  errorSnippet: string;
  ragExamples: string[];
  previousAttempts: PreviousAttempt[];
}

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  buildPrompt(ctx: PromptContext): { system: string; user: string } {
    // ──── Build System Prompt ──────────────────────────────────────────────
    const languageContext = LANGUAGE_CONTEXT[ctx.language] ?? LANGUAGE_CONTEXT['typescript'] ?? '';
    const errorTypePrompt = ERROR_TYPE_PROMPTS[ctx.errorTypeCode] ?? '';

    const systemParts = [
      SYSTEM_PROMPT_ROLE,
      errorTypePrompt,
      languageContext,
      buildErrorClassification(ctx),
      OUTPUT_SCHEMA,
    ];

    const system = systemParts.filter(Boolean).join('\n\n');

    // ──── Build User Prompt ───────────────────────────────────────────────
    // Scrub secrets from all content before including in prompts
    const scrubbed = this.scrubFileContents(ctx.fileContents);
    const scrubbedSnippet = scrubSecrets(ctx.errorSnippet).cleaned;

    const affectedFileContent = scrubbed[ctx.affectedFile] ?? '';
    const truncatedAffectedFile = truncateLines(affectedFileContent, MAX_AFFECTED_FILE_LINES);

    const relatedFiles = Object.entries(scrubbed)
      .filter(([path]) => path !== ctx.affectedFile)
      .slice(0, MAX_RELATED_FILES)
      .map(
        ([path, content]) =>
          `--- RELATED FILE: ${path} ---\n${truncateLines(content, MAX_RELATED_FILE_LINES)}`,
      )
      .join('\n\n');

    const userParts = [
      ctx.ragExamples.length > 0 ? buildRagExamples(ctx.ragExamples) : '',
      ctx.previousAttempts.length > 0 ? buildRetryHistory(ctx.previousAttempts) : '',
      `--- AFFECTED FILE: ${ctx.affectedFile} ---`,
      truncatedAffectedFile,
      relatedFiles,
      `--- CI FAILURE LOG (extract) ---`,
      scrubbedSnippet,
    ].filter(Boolean);

    let user = userParts.join('\n\n');

    // Final total length cap
    if (user.length > MAX_USER_PROMPT_CHARS) {
      this.logger.warn(
        `User prompt exceeds ${String(MAX_USER_PROMPT_CHARS)} chars (${String(user.length)}), truncating`,
      );
      user = truncateText(user, MAX_USER_PROMPT_CHARS);
    }

    return { system, user };
  }

  /**
   * Scrub secrets from all file contents before including in prompts.
   * Returns a new map with cleaned content.
   */
  private scrubFileContents(
    fileContents: Record<string, string>,
  ): Record<string, string> {
    const cleaned: Record<string, string> = {};
    let totalRedacted = 0;

    for (const [path, content] of Object.entries(fileContents)) {
      const result = scrubSecrets(content);
      cleaned[path] = result.cleaned;
      totalRedacted += result.count;
    }

    if (totalRedacted > 0) {
      this.logger.warn(`Scrubbed ${String(totalRedacted)} secret(s) from file contents before prompt assembly`);
    }

    return cleaned;
  }
}
