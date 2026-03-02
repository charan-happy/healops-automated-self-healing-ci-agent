// ─── Log Parser Service ─────────────────────────────────────────────────────
// Extracts meaningful error information from raw CI/CD build logs.
// Removes noise (install logs, warnings, timestamps) and identifies
// failure boundaries to reduce token usage and improve LLM precision.

import { Injectable } from '@nestjs/common';

export interface ParsedLogOutput {
  errorSnippet: string;
  affectedFile: string;
  language: string;
  rawErrorLines: string[];
}

export interface ErrorLocation {
  file: string;
  line: number;
  message: string;
}

@Injectable()
export class LogParserService {

  /**
   * Truncate raw log to a maximum byte size.
   * Keeps first half + marker + last half to preserve both header and trailing errors.
   * Default: 5MB.
   */
  truncateRawLog(rawLog: string, maxBytes: number = 5 * 1024 * 1024): string {
    if (Buffer.byteLength(rawLog, 'utf8') <= maxBytes) return rawLog;

    const halfBytes = Math.floor((maxBytes - 50) / 2); // 50 bytes for marker
    // Use character-based approximation since 1 char ~ 1 byte for ASCII logs
    const firstHalf = rawLog.slice(0, halfBytes);
    const lastHalf = rawLog.slice(-halfBytes);
    return `${firstHalf}\n\n...[TRUNCATED — log exceeded ${String(Math.round(maxBytes / 1024 / 1024))}MB]...\n\n${lastHalf}`;
  }

  /**
   * Parse raw CI build log and extract relevant error information.
   */
  parseLog(rawLog: string, _language?: string): ParsedLogOutput {
    const lines = rawLog.split('\n');
    const errorLines: string[] = [];
    let affectedFile = '';
    let detectedLanguage = _language ?? 'typescript';

    for (const line of lines) {
      if (this.isNoiseLine(line)) continue;

      if (this.isErrorLine(line)) {
        errorLines.push(line.trim());

        if (!affectedFile) {
          const fileMatch = line.match(/(?:^|\s)([\w./\\-]+\.\w{1,4})(?::|\()/);
          if (fileMatch?.[1]) {
            affectedFile = fileMatch[1];
          }
        }
      }
    }

    if (affectedFile) {
      detectedLanguage = this.detectLanguageFromFile(affectedFile);
    }

    const maxLines = 50;
    const limitedErrors = errorLines.slice(0, maxLines);

    return {
      errorSnippet: limitedErrors.join('\n'),
      affectedFile,
      language: detectedLanguage,
      rawErrorLines: limitedErrors,
    };
  }

  /**
   * Extract ~200 lines around the first error occurrence, language-specific.
   */
  extractErrorSnippet(rawLog: string, language: string): string {
    const lines = rawLog.split('\n');

    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        return this.extractTypeScriptSnippet(lines);
      case 'python':
        return this.extractPythonSnippet(lines);
      case 'go':
        return this.extractGoSnippet(lines);
      default:
        return this.extractDefaultSnippet(lines);
    }
  }

  /**
   * Classify an error log into one of the 26 error_types.code values.
   * Uses regex priority matching — first match wins.
   * Order matters: most specific patterns before generic ones.
   *
   * Priority tiers:
   * 1. Infrastructure/platform (not code — escalate immediately)
   * 2. Security/secrets (critical — escalate)
   * 3. Database migrations (high risk — escalate)
   * 4. Framework-specific (Next.js, GraphQL, Docker, CI YAML, monorepo)
   * 5. Dependency/package errors
   * 6. Import/export errors
   * 7. Build/config errors
   * 8. Type system errors
   * 9. Syntax errors
   * 10. Test-related (timeout, snapshot, failure, coverage)
   * 11. Style/lint errors
   * 12. Runtime errors (most generic — last)
   */
  classifyErrorType(log: string, _language: string): string {
    const patterns: Array<{ regex: RegExp; code: string }> = [
      // ── Tier C: Escalation-only (check first to avoid misclassification) ──

      // Infrastructure errors (not fixable in code)
      // Require explicit infra keywords — avoid stealing from ENV_CONFIG_ERROR
      { regex: /OOMKilled|ENOMEM|ENOSPC|disk\s+space\s+(?:full|exhausted)|rate\s+limit\s+exceeded|429 Too Many Requests|runner\s+(?:error|failed)|artifact\s+(?:upload|download)\s+fail/i, code: 'INFRASTRUCTURE_ERROR' },

      // Secret detection (critical — needs rotation)
      // Require scanner-specific keywords to avoid matching config documentation
      { regex: /secret\s+detected\s+in|api[_-]?key\s+found\s+in\s+(?:file|source|code)|private[_-]?key\s+detected|password\s+hardcoded\s+in|truffleHog|detect-secrets|git-secrets|gitleaks/i, code: 'SECRET_DETECTED' },

      // Database migration errors (high risk of data loss)
      // Require failure context — avoid matching success logs
      { regex: /migration\s+(?:failed|error)|relation\s+"?\w+"?\s+already\s+exists|column\s+"?\w+"?\s+does\s+not\s+exist|cannot\s+drop.*dependent|migration\s+checksum\s+mismatch|pending\s+migration.*(?:error|fail)|flyway.*(?:error|fail)|prisma\s+migrate.*(?:error|fail)|drizzle.*migrate.*(?:error|fail)/i, code: 'DATABASE_MIGRATION_ERROR' },

      // ── Tier B: Framework-specific (before generic patterns) ──────────────

      // Next.js build errors — require error context, not just directive presence
      { regex: /next\s+build.*(?:error|fail)|Error:.*"use client"|Error:.*"use server"|(?:error|fail).*getServerSideProps|(?:error|fail).*getStaticProps|(?:error|fail).*generateStaticParams|Server\s+Component.*(?:cannot|error)|next\.config.*(?:error|invalid)/i, code: 'NEXT_BUILD_ERROR' },

      // GraphQL codegen errors
      { regex: /graphql\s+(?:validation|schema)\s+error|Unknown\s+type\s+"?\w+"?.*graphql|codegen.*(?:error|fail)|schema\s+(?:stitching|federation)\s+error|fragment\s+on\s+unknown\s+type/i, code: 'GRAPHQL_CODEGEN_ERROR' },

      // Docker build errors
      { regex: /COPY\s+failed|docker\s+build.*fail|failed\s+to\s+compute\s+cache\s+key|Dockerfile.*(?:syntax\s+error|not\s+found|invalid)|multi-stage.*target.*not\s+found|docker-compose.*(?:error|fail)/i, code: 'DOCKER_BUILD_ERROR' },

      // CI YAML errors
      { regex: /Invalid\s+workflow\s+file|workflow.*(?:syntax|validation)\s+error|\.github\/workflows.*(?:error|invalid)|action\s+.*version\s+not\s+found|job\s+dependency\s+cycle|invalid\s+expression.*\$\{\{/i, code: 'CI_YAML_ERROR' },

      // Monorepo configuration errors — require tool-specific context
      { regex: /project\s+graph.*fail|Cannot\s+find\s+project\s+"?\w+"?\s+in\s+workspace|nx\s+(?:error|cannot\s+resolve)|turbo(?:repo)?\s+(?:error|fail)|pnpm-workspace.*(?:error|invalid)|tsconfig.*project\s+reference.*(?:error|not\s+found)/i, code: 'MONOREPO_CONFIG_ERROR' },

      // CSS/Style errors — require compilation context, avoid matching ESLint style rules
      { regex: /(?:scss|sass|less)\s+(?:compilation\s+)?(?:error|fail)|Unknown\s+CSS\s+property|PostCSS\s+(?:plugin\s+)?error|tailwind.*(?:error|content\s+not\s+found|class\s+not\s+found)|styled-components\s+error|CSS\s+Module.*(?:not\s+found|error)|stylelint\s+(?:error|violation)/i, code: 'CSS_STYLE_ERROR' },

      // ── Tier A: Standard error types ──────────────────────────────────────

      // Dependency/package errors — reordered: version conflict before package.json
      { regex: /peer\s+dep|ERESOLVE|version\s+conflict|incompatible\s+(?:peer\s+)?version/i, code: 'DEPENDENCY_VERSION_CONFLICT' },
      { regex: /Cannot\s+find\s+package|package\s+"?\w+"?\s+not\s+found|missing\s+(?:peer\s+)?dependency/i, code: 'MISSING_DEPENDENCY' },
      { regex: /(?:invalid|malformed|Unexpected\s+token\s+in)\s+.*package\.json|package\.json\s+(?:syntax\s+error|parse\s+error|error)/i, code: 'PACKAGE_JSON_ERROR' },

      // Security vulnerability (audit failures)
      { regex: /npm\s+audit.*vulnerabilit|snyk\s+(?:test|found).*issue|CVE-\d{4}-\d+|(?:high|critical)\s+severity\s+vulnerabilit|dependabot\s+alert/i, code: 'SECURITY_VULNERABILITY' },

      // Import/export errors
      { regex: /Cannot\s+find\s+module|ModuleNotFoundError|No\s+module\s+named|TS2307/i, code: 'IMPORT_ERROR' },
      { regex: /TS2305|has\s+no\s+exported\s+member|is\s+not\s+exported|no\s+default\s+export/i, code: 'EXPORT_ERROR' },

      // Build/config errors (NestJS DI, decorators)
      { regex: /No\s+provider\s+for|Nest\s+can't\s+resolve|@Injectable|@Module|@Controller|decorator\s+metadata|circular\s+dependency/i, code: 'BUILD_CONFIGURATION_ERROR' },
      { regex: /process\.env\.\w+.*(?:undefined|missing)|ConfigService.*undefined|ENOENT.*\.env|(?:missing|undefined)\s+environment\s+variable/i, code: 'ENV_CONFIG_ERROR' },

      // Type system errors
      { regex: /interface.*missing\s+propert|property.*is\s+required|DTO\s+.*mismatch|Object\s+literal\s+may\s+only\s+specify/i, code: 'DTO_INTERFACE_ERROR' },
      { regex: /TS2339|TS2345|TS2322|TS2552|TS7006|TS18048|TS2532|type\s+['"].*['"]\s+is\s+not\s+assignable|Property\s+['"].*['"]\s+does\s+not\s+exist|implicit\s+.*any/i, code: 'TYPE_ERROR' },

      // Syntax errors
      { regex: /SyntaxError|Unexpected\s+token|Parse\s+error|missing\s+(?:closing\s+)?(?:semicolon|brace|bracket|paren)/i, code: 'SYNTAX_ERROR' },

      // Test-related errors
      { regex: /timeout.*async\s+callback|exceeded\s+timeout\s+of\s+\d+ms|did\s+not\s+exit.*after.*test|Async\s+.*timed\s+out|Vitest\s+timeout/i, code: 'TEST_TIMEOUT' },
      { regex: /snapshot\s+.*mismatch|does\s+not\s+match\s+.*stored\s+snapshot|Obsolete\s+snapshot|inline\s+snapshot.*mismatch/i, code: 'SNAPSHOT_MISMATCH' },
      { regex: /coverage\s+.*threshold|coverage\s+.*below|coverage\s+.*not\s+met|istanbul.*(?:check\s+)?fail|codecov.*fail|coveralls.*fail/i, code: 'COVERAGE_THRESHOLD' },
      { regex: /expect\(.*\)\.toBe|expect\(.*\)\.toEqual|AssertionError|assert.*failed|FAIL\s+.*(?:test|spec)|test\s+.*failed/i, code: 'TEST_FAILURE' },

      // Lint errors
      { regex: /eslint.*(?:error|warning)|prettier\s+.*(?:error|violation)|lint\s+.*error|@typescript-eslint|no-unused-vars|prefer-const/i, code: 'LINT_ERROR' },

      // Runtime errors (most generic — check last)
      { regex: /TypeError:|ReferenceError:|RangeError:|Maximum\s+call\s+stack|UnhandledPromiseRejection|undefined\s+is\s+not\s+a\s+function/i, code: 'RUNTIME_ERROR' },
    ];

    for (const { regex, code } of patterns) {
      if (regex.test(log)) return code;
    }

    return 'SYNTAX_ERROR';
  }

  /**
   * Extract the specific file, line number, and error message from a log.
   */
  parseErrorLocation(log: string, language: string): ErrorLocation {
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        return this.parseTypeScriptLocation(log);
      case 'python':
        return this.parsePythonLocation(log);
      case 'go':
        return this.parseGoLocation(log);
      default:
        return this.parseDefaultLocation(log);
    }
  }

  /**
   * Truncate text to fit within a token budget.
   * Rough estimate: 1 token ~ 4 characters.
   * Truncates from the END (keeps the beginning where the first error appears).
   */
  truncateToTokenBudget(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n... [TRUNCATED]';
  }

  // ─── Private: Language-specific snippet extraction ──────────────────────

  private extractTypeScriptSnippet(lines: string[]): string {
    const errorIndex = lines.findIndex((line) =>
      /TS\d+:|SyntaxError:|Error:|Cannot find|error TS/i.test(line),
    );
    if (errorIndex === -1) return this.extractDefaultSnippet(lines);

    const start = Math.max(0, errorIndex - 100);
    const end = Math.min(lines.length, errorIndex + 100);
    return lines.slice(start, end).join('\n');
  }

  private extractPythonSnippet(lines: string[]): string {
    const tracebackIndex = lines.findIndex((line) =>
      /Traceback \(most recent call last\)/i.test(line),
    );
    if (tracebackIndex !== -1) {
      // Find the end of the traceback (blank line or end of file)
      let endIndex = tracebackIndex + 1;
      while (endIndex < lines.length && lines[endIndex]?.trim() !== '') {
        endIndex++;
      }
      return lines.slice(tracebackIndex, endIndex).join('\n');
    }

    // Fall back to FAILED in pytest output
    const failedIndex = lines.findIndex((line) => /FAILED/i.test(line));
    if (failedIndex !== -1) {
      const start = Math.max(0, failedIndex - 100);
      const end = Math.min(lines.length, failedIndex + 100);
      return lines.slice(start, end).join('\n');
    }

    return this.extractDefaultSnippet(lines);
  }

  private extractGoSnippet(lines: string[]): string {
    const errorIndex = lines.findIndex((line) =>
      /\.\/[\w./\\-]+\.go:\d+:\d+:/i.test(line),
    );
    if (errorIndex === -1) {
      // Try "FAIL" in go test output
      const failIndex = lines.findIndex((line) => /^FAIL\s/i.test(line));
      if (failIndex !== -1) {
        const start = Math.max(0, failIndex - 100);
        const end = Math.min(lines.length, failIndex + 100);
        return lines.slice(start, end).join('\n');
      }
      return this.extractDefaultSnippet(lines);
    }

    const start = Math.max(0, errorIndex - 100);
    const end = Math.min(lines.length, errorIndex + 100);
    return lines.slice(start, end).join('\n');
  }

  private extractDefaultSnippet(lines: string[]): string {
    const errorIndex = lines.findIndex((line) =>
      /error|Error|ERROR|FAIL|fatal/i.test(line),
    );
    if (errorIndex === -1) {
      // No error found — return last 200 lines
      return lines.slice(-200).join('\n');
    }

    const start = Math.max(0, errorIndex - 100);
    const end = Math.min(lines.length, errorIndex + 100);
    return lines.slice(start, end).join('\n');
  }

  // ─── Private: Error location parsing ────────────────────────────────────

  private parseTypeScriptLocation(log: string): ErrorLocation {
    // Pattern 1: src/file.ts(N,M): error TS...
    const parenMatch = log.match(/([\w./\\-]+\.tsx?)\((\d+),\d+\):\s*(.*)/);
    if (parenMatch?.[1] && parenMatch[2] && parenMatch[3]) {
      return { file: parenMatch[1], line: parseInt(parenMatch[2], 10), message: parenMatch[3] };
    }

    // Pattern 2: src/file.ts:N:M - error TS...
    const colonMatch = log.match(/([\w./\\-]+\.tsx?)(?::(\d+):\d+)\s*-\s*(.*)/);
    if (colonMatch?.[1] && colonMatch[2]) {
      return { file: colonMatch[1], line: parseInt(colonMatch[2], 10), message: colonMatch[3] ?? '' };
    }

    // Pattern 3: src/file.ts:N:M (no separator)
    const colonMatchNoSep = log.match(/([\w./\\-]+\.tsx?)(?::(\d+):\d+)\s*(.*)/);
    if (colonMatchNoSep?.[1] && colonMatchNoSep[2]) {
      return { file: colonMatchNoSep[1], line: parseInt(colonMatchNoSep[2], 10), message: colonMatchNoSep[3] ?? '' };
    }

    return this.parseDefaultLocation(log);
  }

  private parsePythonLocation(log: string): ErrorLocation {
    // File "path", line N
    const match = log.match(/File "([^"]+)", line (\d+)/);
    if (match?.[1] && match[2]) {
      // Get the error message — usually the last non-empty line
      const lines = log.split('\n').filter((l) => l.trim());
      const message = lines[lines.length - 1] ?? '';
      return { file: match[1], line: parseInt(match[2], 10), message: message.trim() };
    }
    return this.parseDefaultLocation(log);
  }

  private parseGoLocation(log: string): ErrorLocation {
    // ./file.go:N:M: message
    const match = log.match(/(\.\/[\w./\\-]+\.go):(\d+):\d+:\s*(.*)/);
    if (match?.[1] && match[2] && match[3]) {
      return { file: match[1], line: parseInt(match[2], 10), message: match[3] };
    }
    return this.parseDefaultLocation(log);
  }

  private parseDefaultLocation(log: string): ErrorLocation {
    const errorLines = log.split('\n').filter((l) => /error|Error|ERROR/i.test(l));
    return {
      file: 'unknown',
      line: 0,
      message: errorLines[0]?.trim() ?? '',
    };
  }

  // ─── Private: Noise and error detection ─────────────────────────────────

  private isNoiseLine(line: string): boolean {
    const noisePatterns = [
      /^npm warn/i,
      /^npm notice/i,
      /^added \d+ packages/,
      /^up to date/,
      /^\s*$/,
      /^> [\w@/.-]+ /,
      /^::group::/,
      /^::endgroup::/,
      /^\[[\d:]+\]/,
      /^Downloading /,
      /^Installing /,
    ];
    return noisePatterns.some((p) => p.test(line));
  }

  private isErrorLine(line: string): boolean {
    const errorPatterns = [
      /error\s*(TS\d+|:)/i,
      /TypeError:/,
      /ReferenceError:/,
      /SyntaxError:/,
      /ModuleNotFoundError:/,
      /ImportError:/,
      /FAIL\s/,
      /FAILED/,
      /✕|✖|×/,
      /Error:/,
      /panic:/,
      /cannot find/i,
      /not found/i,
      /undefined is not/,
      // Docker/CI errors
      /COPY failed/i,
      /docker.*build.*fail/i,
      /Invalid workflow file/i,
      // Security/secret detection
      /secret.*detected/i,
      /vulnerabilit/i,
      /CVE-\d{4}/,
      // Migration errors
      /migration.*fail/i,
      // Coverage/snapshot
      /coverage.*threshold/i,
      /snapshot.*mismatch/i,
      // Timeout
      /exceeded timeout/i,
      /timed out/i,
      // Next.js / GraphQL
      /next build.*error/i,
      /graphql.*(?:validation|error)/i,
      // Monorepo
      /project graph.*fail/i,
      /workspace.*not found/i,
    ];
    return errorPatterns.some((p) => p.test(line));
  }

  private detectLanguageFromFile(filePath: string): string {
    if (/\.(ts|tsx)$/.test(filePath)) return 'typescript';
    if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) return 'javascript';
    if (/\.py$/.test(filePath)) return 'python';
    if (/\.go$/.test(filePath)) return 'go';
    if (/\.java$/.test(filePath)) return 'java';
    if (/\.rs$/.test(filePath)) return 'rust';
    if (/\.cs$/.test(filePath)) return 'csharp';
    if (/\.(css|scss|sass|less)$/.test(filePath)) return 'css';
    if (/\.(graphql|gql)$/.test(filePath)) return 'graphql';
    if (/\.(yml|yaml)$/.test(filePath)) return 'yaml';
    if (/Dockerfile/.test(filePath)) return 'docker';
    return 'typescript';
  }
}
