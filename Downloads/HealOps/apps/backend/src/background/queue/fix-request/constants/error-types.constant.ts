// ─── Supported Error Types ──────────────────────────────────────────────────
// The 10 error types that the AI fix system can handle.
// Any error outside these types is returned as "out of scope".

export enum ErrorCategory {
  CODE_ERROR = 'code_error',
  DEPENDENCY_ISSUE = 'dependency_issue',
  OUT_OF_SCOPE = 'out_of_scope',
}

export interface SupportedErrorType {
  code: string;
  description: string;
  category: ErrorCategory;
  severity: 'low' | 'medium' | 'high';
  keywords: string[];
}

export const SUPPORTED_ERROR_TYPES: SupportedErrorType[] = [
  // ─── Case 1: Common Code Errors (7 types) ────────────────────────────────
  {
    code: 'syntax_error',
    description: 'Syntax errors (missing braces, parentheses, semicolons)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'medium',
    keywords: ['SyntaxError', 'Unexpected token', 'missing', 'expected', 'unterminated', 'unexpected end'],
  },
  {
    code: 'import_error',
    description: 'Import errors (missing imports, incorrect module paths)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'medium',
    keywords: ['Cannot find module', 'Module not found', 'import', 'require', 'resolve', 'ERR_MODULE_NOT_FOUND'],
  },
  {
    code: 'dto_interface_error',
    description: 'DTO/Interface errors (type mismatches, missing properties)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'medium',
    keywords: ['missing property', 'not assignable', 'interface', 'DTO', 'property', 'does not exist on type'],
  },
  {
    code: 'type_error',
    description: 'Type errors (TypeScript compilation failures)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'medium',
    keywords: ['TypeError', 'Type', 'is not assignable', 'TS2', 'TS7', 'compilation', 'tsc'],
  },
  {
    code: 'export_error',
    description: 'Export errors (functions not exported from modules)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'low',
    keywords: ['export', 'is not exported', 'has no exported member', 'Module has no'],
  },
  {
    code: 'build_error',
    description: 'Build issues (framework decorators, configuration errors)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'high',
    keywords: ['decorator', 'metadata', 'reflect-metadata', 'webpack', 'esbuild', 'nest', 'build failed', 'configuration'],
  },
  {
    code: 'test_failure',
    description: 'Test failures (incorrect assertions, wrong expected values)',
    category: ErrorCategory.CODE_ERROR,
    severity: 'medium',
    keywords: ['expect', 'assertion', 'toBe', 'toEqual', 'test failed', 'FAIL', 'jest', 'vitest', 'AssertionError'],
  },
  // ─── Case 2: Dependency Issues (3 types) ─────────────────────────────────
  {
    code: 'missing_dependency',
    description: 'Missing dependencies (packages used but not in package.json)',
    category: ErrorCategory.DEPENDENCY_ISSUE,
    severity: 'high',
    keywords: ['Cannot find module', 'not installed', 'missing peer', 'ENOENT', 'ERR_MODULE_NOT_FOUND'],
  },
  {
    code: 'version_conflict',
    description: 'Dependency version conflicts (incompatible package versions)',
    category: ErrorCategory.DEPENDENCY_ISSUE,
    severity: 'high',
    keywords: ['version', 'conflict', 'peer dep', 'ERESOLVE', 'incompatible', 'requires a peer'],
  },
  {
    code: 'package_json_error',
    description: 'package.json errors (syntax errors, malformed configuration)',
    category: ErrorCategory.DEPENDENCY_ISSUE,
    severity: 'medium',
    keywords: ['package.json', 'JSON', 'parse error', 'EJSONPARSE', 'malformed', 'invalid package'],
  },
];

export const SUPPORTED_ERROR_CODES = SUPPORTED_ERROR_TYPES.map((t) => t.code);

export function isErrorTypeSupported(code: string): boolean {
  return SUPPORTED_ERROR_CODES.includes(code);
}

export function getErrorTypeByCode(code: string): SupportedErrorType | undefined {
  return SUPPORTED_ERROR_TYPES.find((t) => t.code === code);
}
