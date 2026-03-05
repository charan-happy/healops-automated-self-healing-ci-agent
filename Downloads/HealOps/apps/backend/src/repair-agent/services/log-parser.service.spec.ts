import { LogParserService } from './log-parser.service';

describe('LogParserService', () => {
  let service: LogParserService;

  beforeEach(() => {
    service = new LogParserService();
  });

  // ─── extractErrorSnippet ────────────────────────────────────────────────

  describe('extractErrorSnippet()', () => {
    it('should extract TypeScript tsc errors with surrounding context', () => {
      const lines = [
        ...Array.from({ length: 110 }, (_, i) => `line ${String(i)}: clean code`),
        'src/users/users.service.ts(42,5): error TS2339: Property "foo" does not exist on type "User".',
        ...Array.from({ length: 110 }, (_, i) => `after ${String(i)}: more code`),
      ];
      const result = service.extractErrorSnippet(lines.join('\n'), 'typescript');
      expect(result).toContain('error TS2339');
      expect(result.split('\n').length).toBeLessThanOrEqual(200);
    });

    it('should extract Python traceback', () => {
      const log = [
        'Running tests...',
        'Traceback (most recent call last):',
        '  File "app/main.py", line 42, in run',
        '    result = process(data)',
        '  File "app/process.py", line 10, in process',
        '    return data["missing_key"]',
        'KeyError: "missing_key"',
        '',
        'Some other output',
      ].join('\n');
      const result = service.extractErrorSnippet(log, 'python');
      expect(result).toContain('Traceback');
      expect(result).toContain('KeyError');
      expect(result).not.toContain('Some other output');
    });

    it('should extract Go build errors', () => {
      const log = [
        'go build ./...',
        './main.go:15:2: undefined: Config',
        './main.go:20:5: cannot use x (type int) as type string',
      ].join('\n');
      const result = service.extractErrorSnippet(log, 'go');
      expect(result).toContain('undefined: Config');
    });

    it('should use default extraction for unknown languages', () => {
      const log = [
        'Building project...',
        'ERROR: Something failed',
        'Details: missing configuration',
      ].join('\n');
      const result = service.extractErrorSnippet(log, 'rust');
      expect(result).toContain('ERROR: Something failed');
    });
  });

  // ─── classifyErrorType ──────────────────────────────────────────────────

  describe('classifyErrorType()', () => {
    it('should classify IMPORT_ERROR', () => {
      expect(service.classifyErrorType('Cannot find module "express"', 'typescript')).toBe('IMPORT_ERROR');
      expect(service.classifyErrorType('ModuleNotFoundError: No module named flask', 'python')).toBe('IMPORT_ERROR');
    });

    it('should classify SYNTAX_ERROR', () => {
      expect(service.classifyErrorType('SyntaxError: Unexpected token }', 'javascript')).toBe('SYNTAX_ERROR');
    });

    it('should classify TYPE_ERROR', () => {
      expect(service.classifyErrorType('error TS2339: Property "x" does not exist on type "Y"', 'typescript')).toBe('TYPE_ERROR');
      expect(service.classifyErrorType('Type "string" is not assignable to type "number"', 'typescript')).toBe('TYPE_ERROR');
    });

    it('should classify EXPORT_ERROR', () => {
      expect(service.classifyErrorType('error TS2305: Module has no exported member "Foo"', 'typescript')).toBe('EXPORT_ERROR');
    });

    it('should classify TEST_FAILURE', () => {
      expect(service.classifyErrorType('expect(received).toBe(expected)', 'typescript')).toBe('TEST_FAILURE');
    });

    it('should classify MISSING_DEPENDENCY', () => {
      expect(service.classifyErrorType('Cannot find package "lodash"', 'typescript')).toBe('MISSING_DEPENDENCY');
    });

    it('should classify DEPENDENCY_VERSION_CONFLICT', () => {
      expect(service.classifyErrorType('npm WARN peer dep missing: react@^18', 'javascript')).toBe('DEPENDENCY_VERSION_CONFLICT');
    });

    it('should classify PACKAGE_JSON_ERROR', () => {
      expect(service.classifyErrorType('package.json error: invalid JSON', 'javascript')).toBe('PACKAGE_JSON_ERROR');
    });

    it('should default to SYNTAX_ERROR for unrecognized errors', () => {
      expect(service.classifyErrorType('Something completely unknown happened', 'typescript')).toBe('SYNTAX_ERROR');
    });
  });

  // ─── parseErrorLocation ────────────────────────────────────────────────

  describe('parseErrorLocation()', () => {
    it('should parse TypeScript parenthesis format', () => {
      const log = 'src/users/users.service.ts(42,5): error TS2339: Property "foo" does not exist';
      const result = service.parseErrorLocation(log, 'typescript');
      expect(result.file).toBe('src/users/users.service.ts');
      expect(result.line).toBe(42);
      expect(result.message).toContain('error TS2339');
    });

    it('should parse TypeScript colon format', () => {
      const log = 'src/app.ts:10:3 Some error message';
      const result = service.parseErrorLocation(log, 'typescript');
      expect(result.file).toBe('src/app.ts');
      expect(result.line).toBe(10);
    });

    it('should parse Python traceback location', () => {
      const log = [
        'Traceback (most recent call last):',
        '  File "app/main.py", line 42, in run',
        '    result = process(data)',
        'KeyError: "missing_key"',
      ].join('\n');
      const result = service.parseErrorLocation(log, 'python');
      expect(result.file).toBe('app/main.py');
      expect(result.line).toBe(42);
    });

    it('should parse Go error location', () => {
      const log = './cmd/server/main.go:15:2: undefined: Config';
      const result = service.parseErrorLocation(log, 'go');
      expect(result.file).toBe('./cmd/server/main.go');
      expect(result.line).toBe(15);
      expect(result.message).toBe('undefined: Config');
    });

    it('should return defaults for unparseable errors', () => {
      const result = service.parseErrorLocation('Something went wrong', 'typescript');
      expect(result.file).toBe('unknown');
      expect(result.line).toBe(0);
    });
  });

  // ─── truncateToTokenBudget ─────────────────────────────────────────────

  describe('truncateToTokenBudget()', () => {
    it('should not truncate text within budget', () => {
      const text = 'Short text';
      expect(service.truncateToTokenBudget(text, 100)).toBe(text);
    });

    it('should truncate text exceeding budget and add marker', () => {
      const text = 'a'.repeat(1000);
      const result = service.truncateToTokenBudget(text, 50); // 50 tokens = 200 chars
      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain('[TRUNCATED]');
    });

    it('should keep the beginning of text (where first error appears)', () => {
      const text = 'ERROR: first error\n' + 'x'.repeat(1000);
      const result = service.truncateToTokenBudget(text, 10); // 10 tokens = 40 chars
      expect(result).toContain('ERROR: first error');
    });
  });

  // ─── parseLog (integration) ────────────────────────────────────────────

  describe('parseLog()', () => {
    it('should parse a Jest test failure output', () => {
      const log = [
        'npm warn optional dep',
        '> jest --coverage',
        '',
        'FAIL src/auth/auth.service.spec.ts',
        '  ● AuthService › login › should throw on invalid credentials',
        '',
        '    Error: src/auth/auth.service.spec.ts(42,5): expect(received).toThrow()',
        '',
        '    Expected: UnauthorizedException',
        '    Received: no error thrown',
        '',
        'Tests: 1 failed, 24 passed, 25 total',
      ].join('\n');

      const result = service.parseLog(log);
      expect(result.errorSnippet).toContain('FAIL');
      expect(result.affectedFile).toContain('auth.service.spec.ts');
      expect(result.language).toBe('typescript');
    });

    it('should parse a package.json error', () => {
      const log = [
        'npm ERR! package.json error: Unexpected token in JSON',
        'npm ERR! at position 42',
      ].join('\n');

      const result = service.parseLog(log);
      expect(result.rawErrorLines.length).toBeGreaterThan(0);
    });
  });
});
