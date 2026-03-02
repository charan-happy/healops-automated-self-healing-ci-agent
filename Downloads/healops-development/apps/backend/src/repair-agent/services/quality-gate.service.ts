// ─── Quality Gate Service ───────────────────────────────────────────────────
// Deterministic validation of LLM-generated diffs BEFORE any code is pushed.
// This is the safety net — rules here are checked in code, not by the LLM.
//
// Design principle: Every rule that CAN be checked by regex/code SHOULD be.
// Don't rely on the LLM to follow prompt instructions for detectable patterns.

import { Injectable, Logger } from '@nestjs/common';
import type { ClaudeFixOutput } from '../interfaces/agent-state.interface';

export interface QualityGateResult {
  passed: boolean;
  violations: string[];
}

interface QualityGateContext {
  errorTypeCode: string;
  previousFixFingerprints: string[];
  previousFilesModified?: string[][];
  monorepoScope?: string;
}

// Prohibited patterns in diffs — each checked independently
const PROHIBITED_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bas\s+any\b/, label: 'Uses "as any" type assertion' },
  { pattern: /@ts-ignore/, label: 'Uses @ts-ignore directive' },
  { pattern: /@ts-nocheck/, label: 'Uses @ts-nocheck directive' },
  { pattern: /eslint-disable/, label: 'Uses eslint-disable comment' },
  { pattern: /\.skip\(/, label: 'Skips test with .skip()' },
  { pattern: /xit\(|xdescribe\(/, label: 'Skips test with xit()/xdescribe()' },
  { pattern: /test\.todo\(/, label: 'Converts test to todo' },
];

// Error types that are allowed to modify package.json
const DEPENDENCY_ERROR_TYPES = new Set([
  'MISSING_DEPENDENCY',
  'DEPENDENCY_VERSION_CONFLICT',
  'PACKAGE_JSON_ERROR',
  'SECURITY_VULNERABILITY',
]);

// Error types that MUST NOT be auto-fixed — always escalate
// These correspond to is_auto_fixable: false in the error_types seed
const ESCALATION_ONLY_TYPES = new Set([
  'ENV_CONFIG_ERROR',
  'COVERAGE_THRESHOLD',
  'DATABASE_MIGRATION_ERROR',
  'SECRET_DETECTED',
  'INFRASTRUCTURE_ERROR',
]);

// Error types that are allowed to modify test files
const TEST_ERROR_TYPES = new Set([
  'TEST_FAILURE',
  'TEST_TIMEOUT',
  'SNAPSHOT_MISMATCH',
]);

@Injectable()
export class QualityGateService {
  private readonly logger = new Logger(QualityGateService.name);

  /**
   * Validate an LLM-generated fix against deterministic quality rules.
   * Returns pass/fail with a list of specific violations.
   */
  validate(
    output: ClaudeFixOutput,
    ctx: QualityGateContext,
  ): QualityGateResult {
    const violations: string[] = [];

    // 0. Enforce escalation-only types — LLM must NOT attempt a fix
    if (ESCALATION_ONLY_TYPES.has(ctx.errorTypeCode) && output.can_fix) {
      this.logger.warn(
        `LLM attempted fix for escalation-only error type ${ctx.errorTypeCode} — overriding to can_fix: false`,
      );
      violations.push(
        `Error type ${ctx.errorTypeCode} is not auto-fixable — must escalate, not fix`,
      );
      return { passed: false, violations };
    }

    // 1. If the LLM says it can't fix, that's valid — pass through
    if (!output.can_fix) {
      return { passed: true, violations: [] };
    }

    // 2. Must have a non-empty diff
    if (!output.diff.trim()) {
      violations.push('can_fix is true but diff is empty');
    }

    // 3. Must have files_modified
    if (output.files_modified.length === 0 && output.diff.trim()) {
      violations.push('Diff present but files_modified is empty');
    }

    // 4. Check for prohibited patterns in the diff
    for (const { pattern, label } of PROHIBITED_PATTERNS) {
      if (pattern.test(output.diff)) {
        violations.push(label);
      }
    }

    // 5. Check for empty catch blocks in the diff
    if (/catch\s*\([^)]*\)\s*\{[\s]*\}/.test(output.diff)) {
      violations.push('Introduces empty catch block');
    }

    // 6. Disallow package.json changes unless the error is dependency-related
    const touchesPackageJson = output.files_modified.some(
      (f) => f.endsWith('package.json') || f.endsWith('package-lock.json'),
    );
    if (touchesPackageJson && !DEPENDENCY_ERROR_TYPES.has(ctx.errorTypeCode)) {
      violations.push(
        `Modifies package.json but error type is ${ctx.errorTypeCode}, not a dependency error`,
      );
    }

    // 7. Disallow tsconfig changes (strictness downgrade risk)
    const touchesTsconfig = output.files_modified.some((f) =>
      f.includes('tsconfig'),
    );
    if (touchesTsconfig) {
      violations.push('Modifies tsconfig — potential strictness downgrade');
    }

    // 8. Check for test expectation changes when error is NOT test-related
    if (!TEST_ERROR_TYPES.has(ctx.errorTypeCode)) {
      const touchesTestFile = output.files_modified.some((f) =>
        /\.(spec|test)\.(ts|js|tsx|jsx)$/.test(f),
      );
      if (touchesTestFile) {
        violations.push(
          `Modifies test file but error type is ${ctx.errorTypeCode}, not a test-related error`,
        );
      }
    }

    // 9. Circular fix detection — hash the diff and compare against previous attempts
    if (ctx.previousFixFingerprints.length > 0) {
      const currentFingerprint = this.hashDiff(output.diff);
      if (ctx.previousFixFingerprints.includes(currentFingerprint)) {
        violations.push(
          'Circular fix detected — this exact diff was already attempted',
        );
      }
    }

    // 10. Confidence sanity check
    if (output.confidence < 0 || output.confidence > 1) {
      violations.push(
        `Confidence ${String(output.confidence)} is outside valid range [0, 1]`,
      );
    }

    // 11. Test assertion-only change (EC-13): If error is TEST_FAILURE
    // and ONLY test files are modified (no implementation files), reject.
    // Does NOT apply to TEST_TIMEOUT or SNAPSHOT_MISMATCH — those may legitimately
    // need test-only changes (adding await, mocking dates, etc.)
    if (ctx.errorTypeCode === 'TEST_FAILURE') {
      const allTestFiles = output.files_modified.every((f) =>
        /\.(spec|test)\.(ts|js|tsx|jsx)$/.test(f),
      );
      if (allTestFiles && output.files_modified.length > 0) {
        violations.push(
          'Test assertion-only change — modifies tests but no implementation files for TEST_FAILURE',
        );
      }
    }

    // 12. Dependency version sanity (EC-15): Pre-1.0 versions in package.json changes
    if (touchesPackageJson && DEPENDENCY_ERROR_TYPES.has(ctx.errorTypeCode)) {
      if (/["']0\.\d+\.\d+["']/.test(output.diff)) {
        violations.push(
          'Introduces pre-1.0 dependency version (0.x.x) — potential instability',
        );
      }
    }

    // 13. Lockfile consistency (EC-16/27): If package.json changes, lockfile must also change
    if (touchesPackageJson) {
      const touchesLockfile = output.files_modified.some(
        (f) =>
          f.endsWith('package-lock.json') ||
          f.endsWith('pnpm-lock.yaml') ||
          f.endsWith('yarn.lock'),
      );
      if (!touchesLockfile) {
        violations.push(
          'Modifies package.json but no lockfile included — lockfile inconsistency',
        );
      }
    }

    // 14. Oscillation detection (EC-20): Same files modified as N-2 attempt
    if (ctx.previousFilesModified && ctx.previousFilesModified.length >= 2) {
      const prevN2 = ctx.previousFilesModified[ctx.previousFilesModified.length - 2];
      if (prevN2) {
        const currentSet = new Set(output.files_modified);
        const prevSet = new Set(prevN2);
        if (
          currentSet.size === prevSet.size &&
          [...currentSet].every((f) => prevSet.has(f))
        ) {
          violations.push(
            'Oscillation detected — same files modified as attempt N-2',
          );
        }
      }
    }

    // 15. Monorepo scope validation (EC-28): package.json outside monorepo scope
    if (ctx.monorepoScope) {
      const outOfScope = output.files_modified.some(
        (f) =>
          f.endsWith('package.json') && !f.startsWith(ctx.monorepoScope!),
      );
      if (outOfScope) {
        violations.push(
          `Modifies package.json outside monorepo scope "${ctx.monorepoScope}"`,
        );
      }
    }

    if (violations.length > 0) {
      this.logger.warn(
        `Quality gate FAILED with ${String(violations.length)} violation(s): ${violations.join('; ')}`,
      );
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Compute a SHA-256 fingerprint of a diff for circular fix detection.
   * Strips whitespace-only changes to avoid false negatives.
   */
  hashDiff(diff: string): string {
    const normalized = diff
      .split('\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'))
      .filter((line) => !line.startsWith('+++') && !line.startsWith('---'))
      .map((line) => line.trim())
      .join('\n');

    // Use Node.js built-in crypto
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256').update(normalized).digest('hex');
  }
}
