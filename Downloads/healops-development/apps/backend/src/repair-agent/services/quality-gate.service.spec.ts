import { QualityGateService } from './quality-gate.service';
import type { ClaudeFixOutput } from '../interfaces/agent-state.interface';

describe('QualityGateService', () => {
  let service: QualityGateService;

  beforeEach(() => {
    service = new QualityGateService();
  });

  // Helper to build a valid fix output
  function validFix(overrides?: Partial<ClaudeFixOutput>): ClaudeFixOutput {
    return {
      diagnosis: 'Missing import',
      fix_strategy: 'Add import statement',
      confidence: 0.9,
      can_fix: true,
      cannot_fix_reason: '',
      diff: `--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,4 @@\n+import { Foo } from './foo';\n const bar = 1;`,
      files_modified: ['src/app.ts'],
      ...overrides,
    };
  }

  const defaultCtx = {
    errorTypeCode: 'IMPORT_ERROR',
    previousFixFingerprints: [] as string[],
  };

  // ─── can_fix: false passthrough ─────────────────────────────────────────

  it('should pass when can_fix is false', () => {
    const output = validFix({ can_fix: false, diff: '', files_modified: [] });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ─── Valid fix passthrough ──────────────────────────────────────────────

  it('should pass a valid minimal fix', () => {
    const result = service.validate(validFix(), defaultCtx);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ─── Empty diff check ──────────────────────────────────────────────────

  it('should fail when can_fix is true but diff is empty', () => {
    const output = validFix({ diff: '   ', files_modified: [] });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('can_fix is true but diff is empty');
  });

  // ─── Empty files_modified check ────────────────────────────────────────

  it('should fail when diff is present but files_modified is empty', () => {
    const output = validFix({ files_modified: [] });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(
      'Diff present but files_modified is empty',
    );
  });

  // ─── Prohibited patterns ───────────────────────────────────────────────

  describe('prohibited patterns', () => {
    it('should reject "as any" type assertion', () => {
      const output = validFix({
        diff: '+const x = foo as any;',
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Uses "as any" type assertion');
    });

    it('should reject @ts-ignore', () => {
      const output = validFix({
        diff: '+// @ts-ignore\n+const x = 1;',
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Uses @ts-ignore directive');
    });

    it('should reject @ts-nocheck', () => {
      const output = validFix({
        diff: '+// @ts-nocheck',
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Uses @ts-nocheck directive');
    });

    it('should reject eslint-disable', () => {
      const output = validFix({
        diff: '+/* eslint-disable no-unused-vars */',
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Uses eslint-disable comment');
    });

    it('should reject .skip()', () => {
      const output = validFix({
        diff: "+it.skip('should work', () => {});",
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Skips test with .skip()');
    });

    it('should reject xit() and xdescribe()', () => {
      const output = validFix({
        diff: "+xit('should work', () => {});",
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Skips test with xit()/xdescribe()',
      );
    });

    it('should reject test.todo()', () => {
      const output = validFix({
        diff: "+test.todo('implement later');",
      });
      const result = service.validate(output, defaultCtx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain('Converts test to todo');
    });
  });

  // ─── Empty catch block ─────────────────────────────────────────────────

  it('should reject empty catch blocks', () => {
    const output = validFix({
      diff: '+try { foo(); } catch (e) { }',
    });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Introduces empty catch block');
  });

  it('should allow catch blocks with content', () => {
    const output = validFix({
      diff: '+try { foo(); } catch (e) { console.error(e); }',
    });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(true);
  });

  // ─── package.json guard ────────────────────────────────────────────────

  it('should reject package.json changes for non-dependency errors', () => {
    const output = validFix({
      files_modified: ['package.json', 'src/app.ts'],
    });
    const ctx = { errorTypeCode: 'TYPE_ERROR', previousFixFingerprints: [] };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('Modifies package.json');
  });

  it('should allow package.json changes for MISSING_DEPENDENCY (with lockfile)', () => {
    const output = validFix({
      files_modified: ['package.json', 'package-lock.json', 'src/app.ts'],
    });
    const ctx = {
      errorTypeCode: 'MISSING_DEPENDENCY',
      previousFixFingerprints: [],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(true);
  });

  it('should allow package.json changes for DEPENDENCY_VERSION_CONFLICT (with lockfile)', () => {
    const output = validFix({
      files_modified: ['package.json', 'package-lock.json'],
    });
    const ctx = {
      errorTypeCode: 'DEPENDENCY_VERSION_CONFLICT',
      previousFixFingerprints: [],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(true);
  });

  it('should allow package.json changes for PACKAGE_JSON_ERROR (with lockfile)', () => {
    const output = validFix({
      files_modified: ['package.json', 'package-lock.json'],
    });
    const ctx = {
      errorTypeCode: 'PACKAGE_JSON_ERROR',
      previousFixFingerprints: [],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(true);
  });

  // ─── tsconfig guard ────────────────────────────────────────────────────

  it('should reject tsconfig modifications', () => {
    const output = validFix({
      files_modified: ['tsconfig.json'],
    });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(
      'Modifies tsconfig — potential strictness downgrade',
    );
  });

  it('should reject tsconfig.build.json modifications', () => {
    const output = validFix({
      files_modified: ['tsconfig.build.json'],
    });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(
      'Modifies tsconfig — potential strictness downgrade',
    );
  });

  // ─── Test file guard ───────────────────────────────────────────────────

  it('should reject test file changes for non-TEST_FAILURE errors', () => {
    const output = validFix({
      files_modified: ['src/users/users.service.spec.ts'],
    });
    const ctx = { errorTypeCode: 'TYPE_ERROR', previousFixFingerprints: [] };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('Modifies test file');
  });

  it('should allow test file changes for TEST_FAILURE errors when impl files also modified', () => {
    const output = validFix({
      files_modified: ['src/users/users.service.spec.ts', 'src/users/users.service.ts'],
    });
    const ctx = {
      errorTypeCode: 'TEST_FAILURE',
      previousFixFingerprints: [],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(true);
  });

  // ─── Circular fix detection ────────────────────────────────────────────

  it('should detect circular fixes via diff fingerprint', () => {
    const output = validFix();
    const fingerprint = service.hashDiff(output.diff);
    const ctx = {
      errorTypeCode: 'IMPORT_ERROR',
      previousFixFingerprints: [fingerprint],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(
      'Circular fix detected — this exact diff was already attempted',
    );
  });

  it('should pass when fingerprint does not match previous attempts', () => {
    const output = validFix();
    const ctx = {
      errorTypeCode: 'IMPORT_ERROR',
      previousFixFingerprints: ['abc123def456'],
    };
    const result = service.validate(output, ctx);
    expect(result.passed).toBe(true);
  });

  // ─── Confidence range ──────────────────────────────────────────────────

  it('should reject confidence below 0', () => {
    const output = validFix({ confidence: -0.1 });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('outside valid range');
  });

  it('should reject confidence above 1', () => {
    const output = validFix({ confidence: 1.5 });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('outside valid range');
  });

  it('should accept confidence at boundaries (0 and 1)', () => {
    expect(
      service.validate(validFix({ confidence: 0 }), defaultCtx).passed,
    ).toBe(true);
    expect(
      service.validate(validFix({ confidence: 1 }), defaultCtx).passed,
    ).toBe(true);
  });

  // ─── Test assertion-only change (EC-13) ────────────────────────────────

  describe('test assertion-only change (EC-13)', () => {
    it('should reject when TEST_FAILURE modifies only test files', () => {
      const output = validFix({
        files_modified: ['src/users/users.service.spec.ts', 'src/auth/auth.spec.ts'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'TEST_FAILURE' };
      const result = service.validate(output, ctx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Test assertion-only change — modifies tests but no implementation files for TEST_FAILURE',
      );
    });

    it('should pass when TEST_FAILURE modifies both test and impl files', () => {
      const output = validFix({
        files_modified: ['src/users/users.service.spec.ts', 'src/users/users.service.ts'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'TEST_FAILURE' };
      const result = service.validate(output, ctx);
      expect(result.violations).not.toContain(
        'Test assertion-only change — modifies tests but no implementation files for TEST_FAILURE',
      );
    });
  });

  // ─── Dependency version sanity (EC-15) ──────────────────────────────

  describe('dependency version sanity (EC-15)', () => {
    it('should reject pre-1.0 versions in dependency fix diffs', () => {
      const output = validFix({
        diff: '+  "some-lib": "0.3.2"',
        files_modified: ['package.json', 'package-lock.json'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'MISSING_DEPENDENCY' };
      const result = service.validate(output, ctx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Introduces pre-1.0 dependency version (0.x.x) — potential instability',
      );
    });

    it('should pass for stable versions in dependency fix diffs', () => {
      const output = validFix({
        diff: '+  "some-lib": "1.2.3"',
        files_modified: ['package.json', 'package-lock.json'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'MISSING_DEPENDENCY' };
      const result = service.validate(output, ctx);
      expect(result.violations).not.toContain(
        'Introduces pre-1.0 dependency version (0.x.x) — potential instability',
      );
    });
  });

  // ─── Lockfile consistency (EC-16/27) ─────────────────────────────────

  describe('lockfile consistency (EC-16/27)', () => {
    it('should reject package.json changes without lockfile', () => {
      const output = validFix({
        files_modified: ['package.json', 'src/app.ts'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'MISSING_DEPENDENCY' };
      const result = service.validate(output, ctx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Modifies package.json but no lockfile included — lockfile inconsistency',
      );
    });

    it('should pass package.json changes with pnpm-lock.yaml', () => {
      const output = validFix({
        files_modified: ['package.json', 'pnpm-lock.yaml'],
      });
      const ctx = { ...defaultCtx, errorTypeCode: 'MISSING_DEPENDENCY' };
      const result = service.validate(output, ctx);
      expect(result.violations).not.toContain(
        'Modifies package.json but no lockfile included — lockfile inconsistency',
      );
    });
  });

  // ─── Oscillation detection (EC-20) ──────────────────────────────────

  describe('oscillation detection (EC-20)', () => {
    it('should detect oscillation when files match attempt N-2', () => {
      // Current attempt modifies ['src/other.ts'] which matches index[length-2]
      const output = validFix({
        files_modified: ['src/other.ts'],
      });
      const ctx = {
        ...defaultCtx,
        previousFilesModified: [
          ['src/app.ts'],       // attempt 1
          ['src/other.ts'],     // attempt 2 — this is N-2 from current
          ['src/app.ts'],       // attempt 3 — this is N-1
        ],
      };
      // current is attempt 4, N-2 is attempt 2 = previousFilesModified[1]
      const result = service.validate(output, ctx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Oscillation detected — same files modified as attempt N-2',
      );
    });

    it('should pass when files differ from N-2', () => {
      const output = validFix({
        files_modified: ['src/app.ts'],
      });
      const ctx = {
        ...defaultCtx,
        previousFilesModified: [
          ['src/other.ts'],
          ['src/different.ts'],
        ],
      };
      const result = service.validate(output, ctx);
      expect(result.violations).not.toContain(
        'Oscillation detected — same files modified as attempt N-2',
      );
    });
  });

  // ─── Monorepo scope validation (EC-28) ──────────────────────────────

  describe('monorepo scope validation (EC-28)', () => {
    it('should reject package.json outside monorepo scope', () => {
      const output = validFix({
        files_modified: ['libs/other-package/package.json'],
      });
      const ctx = {
        ...defaultCtx,
        errorTypeCode: 'MISSING_DEPENDENCY',
        monorepoScope: 'apps/backend',
      };
      const result = service.validate(output, ctx);
      expect(result.passed).toBe(false);
      expect(result.violations).toContain(
        'Modifies package.json outside monorepo scope "apps/backend"',
      );
    });

    it('should pass package.json within monorepo scope', () => {
      const output = validFix({
        files_modified: ['apps/backend/package.json', 'apps/backend/pnpm-lock.yaml'],
      });
      const ctx = {
        ...defaultCtx,
        errorTypeCode: 'MISSING_DEPENDENCY',
        monorepoScope: 'apps/backend',
      };
      const result = service.validate(output, ctx);
      expect(result.violations).not.toContain(
        'Modifies package.json outside monorepo scope "apps/backend"',
      );
    });
  });

  // ─── Multiple violations ───────────────────────────────────────────────

  it('should collect multiple violations in a single validation', () => {
    const output = validFix({
      diff: '+const x = foo as any;\n+// @ts-ignore\n+const y = 1;',
      files_modified: ['tsconfig.json'],
      confidence: 2.0,
    });
    const result = service.validate(output, defaultCtx);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  // ─── hashDiff ──────────────────────────────────────────────────────────

  describe('hashDiff()', () => {
    it('should produce consistent hashes for identical diffs', () => {
      const diff = '+import { Foo } from "./foo";\n-const bar = 1;';
      expect(service.hashDiff(diff)).toBe(service.hashDiff(diff));
    });

    it('should produce different hashes for different diffs', () => {
      const diff1 = '+import { Foo } from "./foo";';
      const diff2 = '+import { Bar } from "./bar";';
      expect(service.hashDiff(diff1)).not.toBe(service.hashDiff(diff2));
    });

    it('should ignore context lines (no + or - prefix)', () => {
      const diff1 = 'context line\n+added line';
      const diff2 = 'different context\n+added line';
      expect(service.hashDiff(diff1)).toBe(service.hashDiff(diff2));
    });

    it('should ignore --- and +++ header lines', () => {
      const diff1 = '--- a/file.ts\n+++ b/file.ts\n+added line';
      const diff2 = '+added line';
      expect(service.hashDiff(diff1)).toBe(service.hashDiff(diff2));
    });

    it('should return a 64-character hex SHA-256 hash', () => {
      const hash = service.hashDiff('+some change');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
