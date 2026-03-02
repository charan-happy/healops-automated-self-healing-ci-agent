# Intentional Error Examples

This document tracks intentionally broken examples used for debugging demos and error-handling exercises.

Location: `apps/backend/src/error-examples/`

## Case 1 - Common Code Errors

- Syntax error: `syntax-error.example.ts`
- Import error: `import-error.example.ts`
- DTO/Interface error: `dto-interface-error.example.ts`
- Type error: `type-error.example.ts`
- Export error: `export-error-source.example.ts` + `export-error-consumer.example.ts`
- Build/decorator issue: `build-issue.module.ts`
- Test failure: `test-failure.example.spec.ts`

## Case 2 - Dependency Issues

- Missing dependency import: `dependency-missing.example.ts`
- Dependency version conflict sample: `package.version-conflict.example.json`
- Malformed package.json sample: `package.malformed.example.json`
