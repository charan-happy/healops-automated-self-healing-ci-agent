// ─── Error Extractor Service ────────────────────────────────────────────────
// Provider-agnostic error extraction from CI build logs.
// Extracts build errors (TypeScript, ESLint, Jest, etc.) from raw log text.

import { Injectable, Logger } from '@nestjs/common';
import { LogParserService } from '../repair-agent/services/log-parser.service';

export interface ExtractedBuildError {
  errorMessage: string;
  extractedErrorMessage: string;
  errorFile: string;
  errorLine: number;
  language: string;
  codeSnippet: string;
}

@Injectable()
export class ErrorExtractorService {
  private readonly logger = new Logger(ErrorExtractorService.name);

  constructor(private readonly logParserService: LogParserService) {}

  /**
   * Extract build errors from raw CI log text.
   * Works with any CI provider's log output (GitHub Actions, GitLab CI, Jenkins).
   */
  extractBuildErrors(
    rawLogs: string,
    language: string = 'typescript',
  ): ExtractedBuildError[] {
    if (!rawLogs) return [];

    // Strip ANSI codes and timestamps
    const cleanLines = rawLogs.split('\n').map((l) =>
      l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, ''),
    );

    // Find ALL real build error lines — deduplicate by stripped content
    const errorIndices: number[] = [];
    const seenErrors = new Set<string>();

    for (let i = 0; i < cleanLines.length; i++) {
      const cl = cleanLines[i] ?? '';
      if (/error\s*TS\d+|Type error:|ERROR in|SyntaxError:|ReferenceError:|TypeError:/i.test(cl)) {
        // Skip [WORKER] lines — same errors are reported by [API] in a cleaner format
        if (/\[WORKER\]/.test(cl) || /##\[error\].*\[WORKER\]/.test(cl)) continue;
        const dedupKey = cl.replace(/^\[[\w]+\]\s*/, '').replace(/^##\[error\]/, '').trim();
        if (!seenErrors.has(dedupKey)) {
          seenErrors.add(dedupKey);
          errorIndices.push(i);
        }
      }
    }

    if (errorIndices.length === 0) {
      this.logger.debug('No build errors found in logs');
      return [];
    }

    this.logger.log(`Found ${String(errorIndices.length)} build error(s) in logs`);

    const buildErrors: ExtractedBuildError[] = [];

    for (let errNum = 0; errNum < errorIndices.length; errNum++) {
      const errorIdx = errorIndices[errNum]!;
      const prevEnd = errNum > 0 ? Math.min(errorIndices[errNum - 1]! + 11, errorIdx) : 0;
      const nextErrorIdx = errNum + 1 < errorIndices.length ? errorIndices[errNum + 1]! : cleanLines.length;
      const start = Math.max(prevEnd, errorIdx - 5);
      const end = Math.min(cleanLines.length, errorIdx + 11, nextErrorIdx);
      const snippet = cleanLines.slice(start, end);

      const errorLine = cleanLines[errorIdx] ?? '';
      const fullMessage = errorLine.replace(/^##\[error\]/, '').trim();
      const strippedForParsing = fullMessage.replace(/^\[[\w]+\]\s*/, '');
      const location = this.logParserService.parseErrorLocation(strippedForParsing, language);

      // Build code snippet with line numbers
      const codeSnippet = snippet
        .map((line, idx) => {
          const lineNum = start + idx + 1;
          const marker = lineNum === errorIdx + 1 ? '>>>' : '   ';
          return `${marker} ${String(lineNum).padStart(4)}: ${line}`;
        })
        .join('\n');

      buildErrors.push({
        errorMessage: fullMessage,
        extractedErrorMessage: location.message,
        errorFile: location.file,
        errorLine: location.line,
        language,
        codeSnippet,
      });
    }

    return buildErrors;
  }
}
