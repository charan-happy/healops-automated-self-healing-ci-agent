// ─── Error-Type-Specific Prompt Templates ────────────────────────────────────
// Each template provides the LLM with targeted investigation steps, fixing rules,
// and constraints specific to the detected error category.
//
// These are injected into the system prompt by PromptBuilderService as "Layer 2"
// alongside the universal Layer 1 (role + constraints + output schema).
//
// The map key matches error_types.code in the database seed.

export const ERROR_TYPE_PROMPTS: Record<string, string> = {

  // ─── 1. Syntax Error ──────────────────────────────────────────────────────
  SYNTAX_ERROR: `ERROR TYPE: Syntax Error

OBJECTIVE:
Resolve a syntax error caused by malformed code structure.

INVESTIGATION STEPS:
1. Identify the exact line and column reported in the error log.
2. Check for:
   - Missing or extra: { } ( ) [ ]
   - Unclosed template literals (\` \`)
   - Missing commas in objects/arrays
   - Missing semicolons causing ASI conflicts
   - Unterminated strings
   - Incorrect JSX/TSX closing tags (if applicable)
3. If the error line looks correct, inspect previous 10–20 lines for an unclosed token.
4. Count opening and closing tokens in the affected block.
5. Ensure imports are syntactically valid.

FIXING RULES:
- Fix only the minimal structural issue.
- Do NOT rewrite the entire file.
- Do NOT reformat unrelated code.
- Do NOT change logic.
- Do NOT introduce new variables.
- If multiple syntax errors exist, fix only the first root cause error.

EDGE CASES:
- If error is caused by a previous automated patch, fix only the structural corruption.
- If file appears truncated or corrupted beyond recovery:
  set can_fix: false with reason "File appears truncated or structurally corrupted."`,

  // ─── 2. Import Error ──────────────────────────────────────────────────────
  IMPORT_ERROR: `ERROR TYPE: Import Error

OBJECTIVE:
Fix a module resolution or incorrect import error.

POSSIBLE ERROR PATTERNS:
- Cannot find module '...'
- Module has no exported member '...'
- Default export vs named export mismatch
- File extension mismatch (.js vs .ts)
- Incorrect relative path depth
- Path alias resolution failure

INVESTIGATION STEPS:
1. Identify the exact import statement referenced in the error.
2. Determine error category:

   A) Path Resolution Issue
      - Verify relative path depth (../)
      - Ensure file exists at resolved location
      - Check correct file name casing (case-sensitive environments)
      - Confirm index.ts usage where applicable

   B) Export Mismatch
      - Confirm whether source module uses export default or named exports.
      - Match import style accordingly.

   C) Alias Resolution Issue
      - If path uses alias (e.g., @/ or @app/):
        Ensure tsconfig.json contains correct "paths".
        Do NOT modify tsconfig unless clearly misconfigured.

3. Prefer correcting the import statement over modifying the source module.
4. Do NOT move files.
5. Do NOT create new files.
6. Do NOT change folder structure.

FIXING RULES:
- Fix only the failing import.
- Do NOT refactor unrelated imports.
- Do NOT auto-convert entire project to default exports.
- Do NOT introduce barrel files unless already used.
- Preserve existing architectural conventions.

SPECIAL CASES:
- If module truly does not exist:
  set can_fix: false with reason "Target module does not exist in provided context."
- If required context (target module content) is missing:
  set can_fix: false with reason "Source module content not provided to verify export."`,

  // ─── 3. DTO/Interface Mismatch ────────────────────────────────────────────
  DTO_INTERFACE_ERROR: `ERROR TYPE: DTO/Interface Mismatch

OBJECTIVE:
Fix a type incompatibility between a DTO, interface, or type and its usage.

COMMON ERROR PATTERNS:
- Property 'x' is missing in type ...
- Type 'A' is not assignable to type 'B'
- Object literal may only specify known properties
- Argument of type '...' is not assignable to parameter of type '...'

INVESTIGATION STEPS:
1. Identify the source type:
   - Is it a NestJS DTO class?
   - A TypeScript interface?
   - A shared contract type?

2. Compare:
   - Required vs optional properties
   - Property names (typos / casing differences)
   - Primitive mismatches (string vs number vs boolean)
   - Union type incompatibility
   - Enum mismatch
   - Null vs undefined handling

3. Backend-Specific (NestJS):
   - Check class-validator decorators (@IsString, @IsNumber, @IsOptional, etc.)
   - Ensure DTO matches actual runtime payload.
   - Do NOT remove validation decorators to silence errors.
   - Prefer adjusting the consuming code instead of weakening DTO.

4. Decide Fix Location:
   Priority: Fix incorrect usage > Fix wrong object construction > Adjust optionality only if logically valid > Modify DTO/interface only if clearly incorrect.

FIXING RULES:
- Do NOT add 'any' or use type assertion to bypass error.
- Do NOT remove required properties.
- Do NOT delete validation decorators.
- Do NOT change API contract unless clearly wrong.
- If mismatch is intentional but missing transformation, add minimal transformation logic.

SPECIAL CASES:
- If shared contract file is missing from context:
  set can_fix: false with reason "Shared contract definition not provided."
- If error cannot be resolved without business clarification:
  set can_fix: false with reason "Ambiguous DTO contract. Business rule required."`,

  // ─── 4. TypeScript Type Error ─────────────────────────────────────────────
  TYPE_ERROR: `ERROR TYPE: TypeScript Type Error

OBJECTIVE:
Fix a TypeScript static type mismatch without weakening type safety.

COMMON ERROR CODES:
- TS2322 (Type 'A' is not assignable to type 'B')
- TS2345 (Argument of type 'A' is not assignable to parameter of type 'B')
- TS2552 (Cannot find name)
- TS2339 (Property does not exist on type)
- TS7006 (Implicit any)
- TS18048 (Possibly undefined)
- TS2532 (Object is possibly undefined)

INVESTIGATION STEPS:
1. Read the exact TypeScript error message.
2. Identify expected type vs actual type.
3. Trace the type back to its source (interface, DTO, function signature, generic constraint, return type).
4. Determine whether the issue is:
   A) Incorrect usage
   B) Incorrect function signature
   C) Missing null/undefined guard
   D) Incorrect generic constraint
   E) Wrong return type
   F) Implicit any due to missing type annotation

FIXING PRIORITY:
1. Fix incorrect value or usage.
2. Add proper type narrowing (if undefined/null).
3. Correct function return type.
4. Correct generic constraint.
5. Adjust type definition only if clearly incorrect.

SAFE FIX STRATEGIES:
- Add proper null/undefined checks.
- Use type narrowing (typeof, in, instanceof).
- Add explicit return type if missing.
- Fix incorrect union handling.
- Adjust generic parameter constraints correctly.
- Ensure async functions return Promise<T>.

NEVER DO:
- Do NOT use 'any', 'as any', or broad type assertions.
- Do NOT disable strict mode.
- Do NOT suppress error via ts-ignore.
- Do NOT change business logic to satisfy types.

SPECIAL CASES:
- If error originates from missing external type definition:
  set can_fix: false with reason "External type definition not provided."
- If insufficient context to determine correct type:
  set can_fix: false with reason "Type source not provided in context."`,

  // ─── 5. Export Error ──────────────────────────────────────────────────────
  EXPORT_ERROR: `ERROR TYPE: Export Error

OBJECTIVE:
Fix a mismatch between exported symbols and how they are consumed.

COMMON ERROR PATTERNS:
- Module has no exported member 'X'
- 'X' is declared but not exported
- Attempted import of default export when none exists
- Attempted named import of default export
- Duplicate export declaration

INVESTIGATION STEPS:
1. Identify the failing import statement.
2. Inspect the source module where the symbol should be exported.
3. Determine:
   A) Missing Export — Symbol exists but is not exported. Add export keyword ONLY if logically correct.
   B) Named vs Default Mismatch — Match import style to export style.
   C) Incorrect Export Name — Verify spelling and casing.
   D) Duplicate or Conflicting Export — Remove duplicate ONLY if clearly redundant.

FIXING PRIORITY:
1. Correct the import statement if it is wrong.
2. Add missing export only if symbol is intended to be public.
3. Do NOT convert entire module to default export.
4. Do NOT create barrel files unless already part of project structure.

NEVER DO:
- Do NOT export everything using 'export *' unless already used.
- Do NOT modify unrelated exports.
- Do NOT rename public APIs unless clearly incorrect.
- Do NOT change architectural boundaries.

BACKEND-SPECIFIC (NestJS):
- Ensure providers, services, and modules export only required symbols.
- Do NOT expose private helpers unintentionally.

SPECIAL CASES:
- If the symbol does not exist in source module:
  set can_fix: false with reason "Symbol does not exist in source module."
- If module structure is incomplete in provided context:
  set can_fix: false with reason "Source module content not provided."`,

  // ─── 6. Build/Configuration Error ─────────────────────────────────────────
  BUILD_CONFIGURATION_ERROR: `ERROR TYPE: Build/Configuration Error

OBJECTIVE:
Fix NestJS build-time or dependency injection configuration errors without altering architecture or business logic.

COMMON ERROR PATTERNS:
- Nest can't resolve dependencies of ...
- Unknown element in module
- Provider not found
- Module not imported
- Decorator metadata missing
- Circular dependency detected
- Metadata reflection issues

INVESTIGATION STEPS:
1. Identify the exact error message.
2. Determine whether the error is:
   A) Missing Provider — Service not listed in providers[] or not exported from its module.
   B) Incorrect Module Wiring — Required module missing from imports[] or required export missing from exports[].
   C) Decorator Issue — Missing @Injectable(), @Controller(), @Module(), or incorrect constructor injection.
   D) Circular Dependency — Use forwardRef ONLY if clearly required.

3. Verify correct module imports, providers, and exports arrays.

FIXING PRIORITY:
1. Add missing provider to providers[].
2. Add missing export to exports[].
3. Add missing module to imports[].
4. Add missing @Injectable decorator.
5. Fix constructor injection signature.

NEVER DO:
- Do NOT restructure module hierarchy.
- Do NOT create new modules.
- Do NOT modify tsconfig unless explicitly required.
- Do NOT silence DI errors.

SPECIAL CASES:
- If dependency source module is missing from context:
  set can_fix: false with reason "Dependent module content not provided."
- If circular dependency is architectural and unclear:
  set can_fix: false with reason "Architectural circular dependency requires manual review."`,

  // ─── 7. Test Failure ──────────────────────────────────────────────────────
  TEST_FAILURE: `ERROR TYPE: Test Failure

OBJECTIVE:
Fix the root cause in the implementation that produces the incorrect behavior.

CRITICAL RULE: Never modify test expectations just to make the test pass.

COMMON FAILURE TYPES:
- Assertion mismatch (expected vs received)
- Deep equality mismatch
- Snapshot mismatch
- Promise rejection mismatch
- Incorrect mock behavior
- Async timing issues
- Undefined return value
- Off-by-one logic error

INVESTIGATION STEPS:
1. Identify the failing test case, the assertion message, expected value, and actual value.
2. Trace execution: Locate the function under test, inspect return value or side effects.
3. Determine failure category:
   A) Implementation Bug — Incorrect calculation, wrong conditional logic, missing transformation, incorrect async handling.
   B) Mock Setup Issue — Mock not matching real dependency, missing await, wrong mock return value.
   C) Outdated Test — Test expects old behavior, test setup inconsistent with current contract.

FIXING PRIORITY:
1. Fix implementation logic if incorrect.
2. Fix async handling (missing await, Promise misuse).
3. Fix mock setup ONLY if clearly incorrect.
4. Modify test ONLY if it contains a genuine bug or outdated assumption.

NEVER DO:
- Do NOT change expected values to match incorrect output.
- Do NOT remove assertions.
- Do NOT weaken assertion strictness.
- Do NOT skip tests.
- Do NOT convert strict equality to loose equality.
- Do NOT update snapshots blindly.

LOOP PREVENTION:
If failure appears caused by a previous automated patch, identify the patch in diagnosis and correct only the regression.

SPECIAL CASES:
- If test depends on missing external service:
  set can_fix: false with reason "External dependency context not provided."
- If business logic intent is ambiguous:
  set can_fix: false with reason "Expected behavior unclear from test and context."`,

  // ─── 8. Missing Dependency ────────────────────────────────────────────────
  MISSING_DEPENDENCY: `ERROR TYPE: Missing Dependency

OBJECTIVE:
Fix missing package dependency errors without breaking workspace structure or version compatibility.

COMMON ERROR PATTERNS:
- Cannot find module 'package-name'
- Cannot find type definition file for 'package-name'
- Module not found
- Peer dependency missing warning
- TS2307: Cannot find module

INVESTIGATION STEPS:
1. Identify the missing package name from the import statement and the workspace where the file belongs.
2. Determine monorepo structure (root vs workspace-level package.json).
3. Decide correct placement:
   A) Runtime dependency → "dependencies"
   B) Build/test tool → "devDependencies"
   C) Shared library → install at root if project uses hoisting
   D) Workspace-specific → install only in that workspace package.json

4. Version Selection Rules:
   - Prefer existing version if already installed in another workspace.
   - Match major version with peer dependencies if visible.
   - Do NOT upgrade unrelated packages.
   - Do NOT modify lockfile manually.

5. Type Definitions:
   - Install @types/package-name ONLY if package does not ship its own types.
   - Do NOT install @types if types already included.

FIXING RULES:
- Modify only the relevant package.json.
- Do NOT remove other dependencies.
- Do NOT change workspace configuration.
- Do NOT convert project to another package manager.

SPECIAL CASES:
- If dependency name cannot be determined from context:
  set can_fix: false with reason "Missing package name not identifiable."
- If version compatibility cannot be determined safely:
  set can_fix: false with reason "Cannot determine safe compatible version from context."`,

  // ─── 9. Dependency Version Conflict ───────────────────────────────────────
  DEPENDENCY_VERSION_CONFLICT: `ERROR TYPE: Dependency Version Conflict

OBJECTIVE:
Resolve peer dependency or version conflicts safely without breaking monorepo structure or unrelated packages.

COMMON ERROR PATTERNS:
- ERESOLVE unable to resolve dependency tree
- Peer dependency mismatch
- Requires a peer of X@^A.B.C but none is installed
- Conflicting peer dependency

INVESTIGATION STEPS:
1. Identify conflicting packages, required version ranges, and currently installed versions.
2. Determine conflict type:
   A) Missing peer dependency
   B) Incompatible major versions
   C) Root vs workspace version mismatch
   D) Multiple workspaces using incompatible versions
   E) Tooling conflict (eslint, jest, ts-node, etc.)

3. Version Resolution Strategy:
   - Identify overlapping version range (if any).
   - Prefer minimal upgrade/downgrade that satisfies all peers.
   - Prefer upgrading the more isolated package over shared core dependency.
   - Do NOT blindly upgrade everything to latest.

NEVER DO:
- Do NOT use resolutions field unless already used in project.
- Do NOT force install flags.
- Do NOT downgrade Node or TypeScript globally.
- Do NOT remove peer dependency requirements.

SAFE FIX STRATEGIES:
- Align versions across workspaces.
- Install missing peer dependency at correct level.
- Adjust version to common compatible range.
- Upgrade secondary package instead of core framework.

SPECIAL CASES:
- If no overlapping compatible version exists:
  set can_fix: false with reason "No compatible version range satisfies all peer dependencies."
- If insufficient version information:
  set can_fix: false with reason "Insufficient version context to determine safe resolution."`,

  // ─── 10. package.json Error ───────────────────────────────────────────────
  PACKAGE_JSON_ERROR: `ERROR TYPE: package.json Error

OBJECTIVE:
Fix structural or syntax errors inside a package.json file without modifying unrelated configuration or dependencies.

COMMON ERROR PATTERNS:
- Unexpected token in JSON
- Trailing comma
- Duplicate key
- Missing comma
- Incorrect nesting
- Invalid JSON format
- Value type mismatch (string vs object vs array)

INVESTIGATION STEPS:
1. Validate JSON structure:
   - Ensure proper braces and brackets.
   - Remove trailing commas.
   - Fix missing commas.
   - Fix improper quotes (must use double quotes).
2. Check for:
   - Duplicate keys (keep only the correct one if clearly duplicated).
   - Incorrect value types (e.g., scripts should be string values).
   - Misplaced fields inside wrong object.
3. Monorepo Awareness:
   - Identify whether file is root or workspace-level package.json.
   - Do NOT modify workspace configuration unless clearly broken.

FIXING RULES:
- Fix only syntax or structural issue.
- Do NOT add or remove dependencies unless required to resolve duplicate key.
- Do NOT change scripts unless clearly malformed.
- Do NOT modify engines, resolutions, or workspace fields unless syntactically invalid.
- Preserve formatting style if possible.
- Do NOT rewrite entire file.

SPECIAL CASES:
- If JSON structure appears severely corrupted:
  set can_fix: false with reason "package.json appears structurally corrupted beyond safe repair."
- If error originates from lockfile instead of package.json:
  set can_fix: false with reason "Error originates from lockfile, not package.json."`,

  // ─── 11. Runtime Error ────────────────────────────────────────────────────
  RUNTIME_ERROR: `ERROR TYPE: Runtime Error

OBJECTIVE:
Fix a runtime error (TypeError, ReferenceError, null dereference, etc.) that occurs during CI test execution or build scripts.

COMMON ERROR PATTERNS:
- TypeError: Cannot read properties of undefined (reading 'x')
- TypeError: X is not a function
- ReferenceError: X is not defined
- RangeError: Maximum call stack size exceeded
- UnhandledPromiseRejection
- Segmentation fault / out of memory

INVESTIGATION STEPS:
1. Identify the exact error type, message, and stack trace.
2. Locate the line in the source code where the error originates.
3. Determine root cause:
   A) Null/Undefined Access — Missing null check before property access or function call.
   B) Wrong Type at Runtime — Variable holds unexpected type (e.g., string instead of object).
   C) Missing Function/Method — Called function does not exist on the object.
   D) Infinite Recursion — Recursive call without proper base case.
   E) Async Error — Missing await, unhandled rejection, callback called with error.
   F) Incorrect Initialization — Service/variable used before being initialized.

FIXING PRIORITY:
1. Add null/undefined guard at the point of failure.
2. Fix initialization order if variable is used before assignment.
3. Fix async handling (add await, add .catch, fix Promise chain).
4. Fix recursive base case if stack overflow.
5. Fix argument types passed to the function.

NEVER DO:
- Do NOT swallow errors with empty catch blocks.
- Do NOT add 'any' type to bypass runtime type checks.
- Do NOT add try/catch without handling the error meaningfully.
- Do NOT suppress the error — fix the root cause.

SPECIAL CASES:
- If error is caused by missing environment variable or external service:
  set can_fix: false with reason "Error depends on runtime environment configuration not available in code context."
- If stack trace points to node_modules:
  set can_fix: false with reason "Error originates from external dependency, not application code."`,

  // ─── 12. Linting Error ────────────────────────────────────────────────────
  LINT_ERROR: `ERROR TYPE: Linting Error

OBJECTIVE:
Fix ESLint, Prettier, or other linter violations that cause CI to fail.

COMMON ERROR PATTERNS:
- ESLint rule violations (no-unused-vars, no-explicit-any, prefer-const, etc.)
- Prettier formatting violations
- Stylelint violations (CSS/SCSS)
- Import ordering violations

INVESTIGATION STEPS:
1. Identify the exact rule name from the error log (e.g., @typescript-eslint/no-unused-vars).
2. Determine the file and line where the violation occurs.
3. Classify the violation:
   A) Unused Variable/Import — Remove the unused declaration or prefix with underscore if parameter.
   B) Style Violation — Fix formatting to match project convention.
   C) Code Quality Rule — Fix the actual code pattern (e.g., use const instead of let).
   D) Import Order — Reorder imports to match configured sort order.

FIXING RULES:
- Fix the code to satisfy the linter rule, NOT disable the rule.
- Do NOT add eslint-disable comments.
- Do NOT modify .eslintrc or prettier config.
- If fixing unused variable: remove it if safe, prefix with _ if it's a required parameter.
- If fixing formatting: apply only the exact formatting change required.
- Do NOT reformat the entire file.

NEVER DO:
- Do NOT add eslint-disable, eslint-disable-next-line, or @ts-ignore.
- Do NOT change eslint or prettier configuration files.
- Do NOT remove linter rules.
- Do NOT change unrelated code to satisfy linter.

SPECIAL CASES:
- If the lint rule requires architectural change beyond a single file:
  set can_fix: false with reason "Lint fix requires architectural change beyond file scope."
- If the lint rule conflicts with project conventions visible in provided files:
  set can_fix: false with reason "Lint rule conflicts with project conventions."`,

  // ─── 13. Environment/Config Error ─────────────────────────────────────────
  ENV_CONFIG_ERROR: `ERROR TYPE: Environment/Configuration Error

OBJECTIVE:
Fix configuration-related build failures — missing env vars in code references, incorrect config file structure, or misconfigured framework settings.

COMMON ERROR PATTERNS:
- Property 'X' does not exist on type 'ProcessEnv'
- ConfigService.get returns undefined for required key
- Module initialization fails due to missing config
- Docker build fails due to missing ARG/ENV
- CI workflow references non-existent secret

INVESTIGATION STEPS:
1. Identify whether the error is:
   A) Code accessing env var incorrectly — fix the code access pattern (add fallback, fix key name).
   B) Missing type declaration for env var — add to env.d.ts or equivalent type file.
   C) Config module not importing required config — add to ConfigModule imports.
   D) Default value missing — add sensible default with ?? operator.

2. Check for:
   - Typos in env var names (DATBASE_URL vs DATABASE_URL).
   - Missing ConfigModule.forRoot() or registerAs() setup.
   - Missing @nestjs/config injection in the consuming service.

FIXING RULES:
- Fix the code to handle missing config gracefully (add defaults, null checks).
- Do NOT hardcode secrets or credentials.
- Do NOT create .env files in the diff.
- Do NOT expose sensitive configuration in error messages or logs.
- Prefer adding default values over requiring new env vars.

NEVER DO:
- Do NOT hardcode API keys, passwords, or tokens.
- Do NOT modify CI/CD workflow files unless explicitly related.
- Do NOT change environment variable names that are already in use.
- Do NOT remove validation on required config values.

SPECIAL CASES:
- If the fix requires adding a new environment variable that must be set by the operator:
  set can_fix: false with reason "Fix requires new environment variable to be configured in deployment."
- If error is in CI workflow YAML, not application code:
  set can_fix: false with reason "Error is in CI/CD configuration, not application code."`,

  // ─── 14. Test Timeout ────────────────────────────────────────────────────
  TEST_TIMEOUT: `ERROR TYPE: Test Timeout

OBJECTIVE:
Fix a test that exceeds its timeout threshold during CI execution.

COMMON ERROR PATTERNS:
- Timeout - Async callback was not invoked within the 5000ms timeout
- exceeded timeout of 30000ms
- Jest did not exit one second after the test run has completed
- Async operation timed out
- Vitest timeout exceeded

INVESTIGATION STEPS:
1. Identify the specific test that timed out (file, describe block, test name).
2. Determine root cause:
   A) Missing await — async function called without await, test completes before promise resolves.
   B) Missing done() callback — callback-style test never calls done().
   C) Unresolved Promise — Promise never resolves/rejects (e.g., missing mock response).
   D) Infinite loop — Logic bug causing infinite iteration in tested code.
   E) Resource deadlock — Test waiting for resource held by another test or mock.
   F) Event listener leak — Listener registered but event never fires.

3. Check for:
   - Missing .mockResolvedValue() or .mockRejectedValue() on async mocks.
   - HTTP/DB mocks that don't respond.
   - setInterval/setTimeout without cleanup.
   - EventEmitter.once() waiting for events that never emit.

FIXING PRIORITY:
1. Add missing await to async calls.
2. Add missing mock return values for async dependencies.
3. Fix infinite loop logic.
4. Add afterEach cleanup for timers (jest.useRealTimers()).
5. Increase timeout ONLY as absolute last resort, with justification.

NEVER DO:
- Do NOT increase timeout without fixing the underlying cause.
- Do NOT skip the test.
- Do NOT add arbitrary delays (setTimeout in tests).
- Do NOT remove the async operation — fix why it hangs.

SPECIAL CASES:
- If timeout is caused by external service dependency not mockable from context:
  set can_fix: false with reason "Test depends on external service that cannot be mocked from provided context."
- If root cause is database connection pool exhaustion:
  set can_fix: false with reason "Timeout caused by resource exhaustion, not fixable in application code."`,

  // ─── 15. Docker Build Error ──────────────────────────────────────────────
  DOCKER_BUILD_ERROR: `ERROR TYPE: Docker Build Error

OBJECTIVE:
Fix errors in Dockerfile or docker-compose configuration that cause CI build failures.

COMMON ERROR PATTERNS:
- COPY failed: file not found
- RUN command returned non-zero exit status
- failed to solve: failed to compute cache key
- Cannot locate specified Dockerfile
- Invalid Dockerfile syntax
- Multi-stage build target not found
- ARG/ENV variable not set
- WORKDIR path issues

INVESTIGATION STEPS:
1. Identify the failing Dockerfile instruction (COPY, RUN, FROM, etc.).
2. Determine root cause:
   A) COPY/ADD path mismatch — Source file doesn't exist at build context path.
   B) RUN command failure — Script or command fails during build (missing deps, wrong OS).
   C) Multi-stage reference — FROM ... AS stage referenced incorrectly.
   D) Build ARG missing — Required build argument not passed.
   E) Layer caching issue — .dockerignore excluding needed files.
   F) Base image issue — Image tag doesn't exist or architecture mismatch.

3. Check for:
   - .dockerignore excluding files the COPY instruction needs.
   - Relative path issues (build context vs Dockerfile location).
   - Missing package.json or lockfile in COPY instruction.
   - Wrong base image tag or deprecated image.

FIXING RULES:
- Fix only the specific failing instruction.
- Do NOT restructure the entire Dockerfile.
- Do NOT change the base image unless it's clearly wrong (e.g., nonexistent tag).
- Do NOT add unnecessary layers.
- Preserve multi-stage build structure.

NEVER DO:
- Do NOT add --no-cache flags as a workaround.
- Do NOT bypass security scanning steps.
- Do NOT run as root unless already running as root.
- Do NOT expose additional ports.

SPECIAL CASES:
- If error requires changing the base image to a different OS/architecture:
  set can_fix: false with reason "Base image change requires infrastructure decision."
- If COPY source file genuinely doesn't exist in the repository:
  set can_fix: false with reason "Required file does not exist in repository."`,

  // ─── 16. CI YAML Configuration Error ─────────────────────────────────────
  CI_YAML_ERROR: `ERROR TYPE: CI/CD YAML Configuration Error

OBJECTIVE:
Fix errors in GitHub Actions workflow YAML files (.github/workflows/*.yml).

COMMON ERROR PATTERNS:
- Invalid workflow file
- Unexpected value 'X'
- Required property is missing
- Invalid type: expected mapping/sequence
- Unrecognized named-value
- Action version not found
- Secret or variable not found
- Job dependency cycle detected
- Invalid expression syntax in \${{ }}

INVESTIGATION STEPS:
1. Identify the exact YAML parsing or validation error.
2. Determine root cause:
   A) YAML Syntax — Indentation, missing colons, bad quoting, tabs instead of spaces.
   B) Schema Violation — Missing required fields (runs-on, steps, uses/run).
   C) Expression Error — Invalid \${{ }} expression, wrong context variable.
   D) Action Reference — Non-existent action version or deprecated action.
   E) Job Dependency — Circular needs or referencing non-existent job.
   F) Environment — Referencing undefined secret or environment variable.

3. Check for:
   - Indentation errors (YAML is indent-sensitive).
   - Missing 'runs-on' in jobs.
   - Invalid 'uses' action references (owner/repo@ref format).
   - Incorrect matrix strategy syntax.
   - Shell script escaping issues in 'run' blocks.

FIXING RULES:
- Fix only the reported YAML error.
- Preserve workflow logic and job structure.
- Do NOT add new jobs, steps, or triggers.
- Do NOT change action versions unless clearly wrong (nonexistent tag).
- Use consistent indentation (2 spaces, no tabs).

NEVER DO:
- Do NOT change workflow triggers (on: push, on: pull_request, etc.).
- Do NOT modify environment secrets or variables.
- Do NOT remove security scanning or approval steps.
- Do NOT change deployment targets or environments.

SPECIAL CASES:
- If error references a missing secret or environment variable:
  set can_fix: false with reason "CI error requires secret/variable configuration, not code change."
- If error is in a reusable workflow call:
  set can_fix: false with reason "Error is in referenced reusable workflow, not local configuration."`,

  // ─── 17. CSS/Style Error ─────────────────────────────────────────────────
  CSS_STYLE_ERROR: `ERROR TYPE: CSS/Style Build Error

OBJECTIVE:
Fix CSS, SCSS, Tailwind, or CSS-in-JS compilation errors that fail the build.

COMMON ERROR PATTERNS:
- Unknown CSS property
- Invalid CSS selector syntax
- SCSS compilation error (undefined variable, mixin not found)
- Tailwind class not recognized / purge error
- PostCSS plugin error
- CSS Module type error (*.module.css import mismatch)
- Styled-components template literal error

INVESTIGATION STEPS:
1. Identify the CSS preprocessor or framework in use (vanilla CSS, SCSS, Tailwind, CSS Modules, styled-components).
2. Determine root cause:
   A) Syntax Error — Missing semicolons, unclosed braces, invalid selectors.
   B) Missing Variable/Mixin — SCSS variable or mixin not imported or defined.
   C) Tailwind Config — Class not included in content paths, custom utility missing.
   D) CSS Module Mismatch — Import doesn't match exported class names.
   E) PostCSS Plugin — Plugin configuration error or missing plugin.

3. Check for:
   - Browser-prefixed properties that need autoprefixer.
   - Deprecated CSS features.
   - SCSS @use vs @import migration issues.
   - Tailwind v3→v4 migration breaking changes.

FIXING RULES:
- Fix only the failing CSS/style code.
- Do NOT restructure stylesheets.
- Do NOT change CSS methodology (BEM, modules, etc.).
- Do NOT modify tailwind.config.js unless clearly misconfigured.
- Preserve existing naming conventions.

NEVER DO:
- Do NOT add !important as a fix.
- Do NOT inline styles to bypass CSS issues.
- Do NOT remove entire style blocks.
- Do NOT change the CSS preprocessor.

SPECIAL CASES:
- If error requires tailwind.config.js changes not provided in context:
  set can_fix: false with reason "Tailwind configuration file not provided in context."
- If error is in a third-party CSS library:
  set can_fix: false with reason "Error originates from third-party CSS, not application styles."`,

  // ─── 18. GraphQL Codegen Error ───────────────────────────────────────────
  GRAPHQL_CODEGEN_ERROR: `ERROR TYPE: GraphQL Codegen Error

OBJECTIVE:
Fix errors in GraphQL schema, queries, or code generation configuration.

COMMON ERROR PATTERNS:
- GraphQL validation error
- Unknown type "X"
- Field "x" not found in type "Y"
- Duplicate type definition
- codegen.ts/yml configuration error
- Schema stitching/federation error
- Fragment on unknown type

INVESTIGATION STEPS:
1. Identify whether error is in:
   A) Schema Definition — Invalid SDL, missing types, circular references.
   B) Query/Mutation — Referencing fields or types that don't exist in schema.
   C) Codegen Config — Wrong schema path, missing plugin, output misconfiguration.
   D) Fragment — Fragment on type that doesn't exist or wrong type condition.

2. Check for:
   - Typos in type or field names.
   - Missing input types for mutations.
   - Enum values that don't match schema.
   - Schema file path resolution in codegen config.

FIXING RULES:
- Fix the specific GraphQL error reported.
- Do NOT restructure the schema.
- Do NOT add new resolvers.
- Do NOT modify codegen plugins unless clearly misconfigured.
- Match existing naming conventions (camelCase vs snake_case).

NEVER DO:
- Do NOT change the GraphQL schema to match incorrect client queries (fix the query instead).
- Do NOT remove schema validation rules.
- Do NOT merge separate schemas without understanding federation boundaries.

SPECIAL CASES:
- If error requires schema changes in a federated service not in context:
  set can_fix: false with reason "Error is in federated subgraph schema not provided in context."
- If codegen configuration references external schema URL:
  set can_fix: false with reason "Schema source is external URL, cannot validate locally."`,

  // ─── 19. Next.js Build Error ─────────────────────────────────────────────
  NEXT_BUILD_ERROR: `ERROR TYPE: Next.js Build Error

OBJECTIVE:
Fix Next.js-specific build errors (App Router, Pages Router, SSR, ISR, middleware).

COMMON ERROR PATTERNS:
- "use client" / "use server" directive errors
- getServerSideProps / getStaticProps type errors
- Dynamic import issues
- Image optimization errors
- Middleware configuration errors
- Route conflict (app router vs pages router)
- Server Component importing client-only code
- Missing generateStaticParams for dynamic routes
- next.config.js misconfiguration

INVESTIGATION STEPS:
1. Identify the Next.js version and router type (App Router vs Pages Router).
2. Determine root cause:
   A) Server/Client boundary violation — Server Component using useState/useEffect, or Client Component using server-only APIs.
   B) Data fetching error — Wrong export (getServerSideProps vs generateStaticParams), incorrect return type.
   C) Config error — Invalid next.config.js option, wrong image domain, incorrect redirect.
   D) Route conflict — Same route defined in both /app and /pages directories.
   E) Middleware error — Invalid middleware export, wrong matcher config.
   F) Dynamic route error — Missing generateStaticParams for output: 'export'.

3. Check for:
   - "use client" directive missing on components using React hooks.
   - Server Actions not properly marked with "use server".
   - Barrel file importing client components into server context.

FIXING RULES:
- Fix the specific Next.js build error.
- Respect Server/Client Component boundaries.
- Do NOT convert entire pages between App Router and Pages Router.
- Do NOT change the rendering strategy (SSR → SSG or vice versa).
- Do NOT modify next.config.js unless clearly misconfigured.

NEVER DO:
- Do NOT add "use client" to every file indiscriminately.
- Do NOT bypass image optimization with unoptimized prop.
- Do NOT disable TypeScript strict mode in Next config.
- Do NOT remove middleware for convenience.

SPECIAL CASES:
- If error requires changing the routing paradigm (App Router ↔ Pages Router):
  set can_fix: false with reason "Routing paradigm change requires architectural decision."
- If error is in next.config.js and config file not provided:
  set can_fix: false with reason "next.config.js not provided in context."`,

  // ─── 20. Monorepo Configuration Error ────────────────────────────────────
  MONOREPO_CONFIG_ERROR: `ERROR TYPE: Monorepo Configuration Error

OBJECTIVE:
Fix build errors caused by monorepo tooling misconfiguration (Nx, Turborepo, Lerna, pnpm workspaces).

COMMON ERROR PATTERNS:
- Project graph creation failed
- Cannot find project 'X' in workspace
- Workspace package not found
- Circular dependency between projects
- Task pipeline misconfiguration
- tsconfig paths not resolving across workspace boundaries
- Shared dependency version mismatch across workspaces

INVESTIGATION STEPS:
1. Identify the monorepo tool (Nx, Turborepo, Lerna, pnpm workspaces).
2. Determine root cause:
   A) Project Reference — Project not registered in workspace config (nx.json, turbo.json, pnpm-workspace.yaml).
   B) Path Resolution — TypeScript path aliases not resolving across package boundaries.
   C) Build Order — Task dependencies not correctly configured (dependsOn, pipeline).
   D) Shared Dependency — Different versions of same package across workspaces.
   E) Package Export — Internal package not exporting correctly (missing main/exports in package.json).

3. Check for:
   - Missing entry in pnpm-workspace.yaml packages array.
   - Wrong tsconfig extends or references path.
   - Missing composite: true in referenced tsconfig.
   - Incorrect package.json "main" or "exports" field in shared library.

FIXING RULES:
- Fix only the specific workspace configuration error.
- Do NOT restructure the monorepo layout.
- Do NOT move packages between directories.
- Do NOT change the monorepo tool (Nx → Turborepo, etc.).
- Preserve existing workspace conventions.

NEVER DO:
- Do NOT flatten the monorepo into a single project.
- Do NOT add workspace-level overrides unless already used.
- Do NOT modify CI pipeline configuration.
- Do NOT change package manager (pnpm → npm, etc.).

SPECIAL CASES:
- If error requires restructuring project boundaries:
  set can_fix: false with reason "Fix requires monorepo project restructuring beyond single config change."
- If workspace config file not provided:
  set can_fix: false with reason "Workspace configuration file not provided in context."`,

  // ─── 21. Security Vulnerability ──────────────────────────────────────────
  SECURITY_VULNERABILITY: `ERROR TYPE: Security Vulnerability (CI Audit/Scan Failure)

OBJECTIVE:
Fix security audit failures (npm audit, Snyk, Dependabot, CodeQL) that block CI.

COMMON ERROR PATTERNS:
- npm audit found X vulnerabilities
- Snyk test found N issues
- CVE-XXXX-XXXXX in package X
- High/Critical severity vulnerability
- Prototype pollution
- ReDoS vulnerability
- Path traversal vulnerability

INVESTIGATION STEPS:
1. Identify the vulnerability:
   - Package name, version, and CVE/advisory ID.
   - Severity level (low, medium, high, critical).
   - Whether it's a direct or transitive dependency.

2. Determine fix approach:
   A) Direct dependency — Upgrade to patched version if available.
   B) Transitive dependency — Check if upgrading the direct parent resolves it.
   C) No patch available — Check if overrides/resolutions can force the fixed transitive version.
   D) Breaking change — If upgrade requires code changes, assess scope.

3. Check for:
   - Available patched version in npm registry.
   - Whether the vulnerability is exploitable in the project's context.
   - Peer dependency conflicts from upgrading.

FIXING RULES:
- Prefer minimal version bump that resolves the vulnerability.
- Only modify package.json dependencies/devDependencies.
- Use overrides (npm) or resolutions (pnpm/yarn) only for transitive deps.
- Do NOT ignore vulnerabilities with audit exceptions unless clearly false positive.

NEVER DO:
- Do NOT downgrade packages to avoid the vulnerability check.
- Do NOT remove the security scanning step from CI.
- Do NOT add blanket audit exceptions.
- Do NOT upgrade to major versions without assessing breaking changes.

SPECIAL CASES:
- If no patched version exists:
  set can_fix: false with reason "No patched version available for CVE. Manual review required."
- If fix requires major version upgrade with breaking changes:
  set can_fix: false with reason "Fix requires major version upgrade with potential breaking changes."`,

  // ─── 22. Snapshot Mismatch ───────────────────────────────────────────────
  SNAPSHOT_MISMATCH: `ERROR TYPE: Snapshot Mismatch

OBJECTIVE:
Fix test failures caused by snapshot mismatches (Jest, Vitest, Storybook).

COMMON ERROR PATTERNS:
- Snapshot mismatch
- Received value does not match stored snapshot
- Obsolete snapshot
- Missing snapshot file
- Inline snapshot mismatch

INVESTIGATION STEPS:
1. Identify the snapshot type:
   A) Component snapshot (rendered HTML/JSX output).
   B) Data snapshot (serialized object).
   C) Inline snapshot (embedded in test file).
   D) Storybook snapshot (story rendering).

2. Determine whether mismatch is:
   A) Expected — Code change legitimately changed the output → snapshot needs updating.
   B) Regression — Unintended output change → fix the implementation.
   C) Flaky — Non-deterministic output (dates, IDs, random values) → fix the test setup.

3. Check for:
   - Date/time values in snapshot (should be mocked).
   - Random IDs or UUIDs (should use deterministic test values).
   - Environment-dependent output (platform, locale).
   - CSS class name changes from CSS Modules or styled-components.

FIXING RULES:
- If the code change is intentional: indicate that snapshots need updating (the validation pipeline will handle this).
- If the snapshot mismatch is due to non-deterministic values: fix the test setup to mock/freeze those values.
- If the mismatch indicates a regression: fix the implementation, not the snapshot.

NEVER DO:
- Do NOT blindly update snapshots without verifying the change is correct.
- Do NOT delete snapshot files.
- Do NOT convert snapshot tests to assertion tests just to avoid the mismatch.
- Do NOT add snapshot serializers to hide differences.

SPECIAL CASES:
- If snapshot change is clearly from an intentional code update:
  set can_fix: true with diagnosis explaining snapshot needs regeneration and diff showing necessary code fix if any.
- If snapshot includes non-deterministic data that should be mocked:
  set can_fix: true with fix adding proper mocking for dates/IDs.`,

  // ─── 23. Coverage Threshold Failure ──────────────────────────────────────
  COVERAGE_THRESHOLD: `ERROR TYPE: Code Coverage Threshold Failure

OBJECTIVE:
Identify and report coverage threshold failures. These generally cannot be auto-fixed safely.

COMMON ERROR PATTERNS:
- Jest: Global coverage threshold not met
- Coverage for branches/statements/functions/lines below X%
- Istanbul coverage check failed
- Codecov/Coveralls check failed

INVESTIGATION STEPS:
1. Identify which coverage metric failed (branches, statements, functions, lines).
2. Determine the gap (required % vs actual %).
3. If the gap is small (<2%), check if recently added code is missing tests.
4. If the gap is large, this likely requires new test files — cannot auto-fix.

ASSESSMENT:
- Coverage failures require writing new tests, which requires deep understanding of business logic.
- Auto-generated tests risk being meaningless (testing implementation, not behavior).
- Only trivially small gaps might be addressable by adding obvious missing test cases.

FIXING RULES:
- In most cases, set can_fix: false — writing meaningful tests requires human judgment.
- If a single uncovered function is trivially testable (pure function, no dependencies), you MAY add a minimal test.

NEVER DO:
- Do NOT lower coverage thresholds.
- Do NOT add empty tests to inflate coverage.
- Do NOT add tests that only call functions without asserting behavior.
- Do NOT modify coverage configuration.

SPECIAL CASES:
- Nearly always:
  set can_fix: false with reason "Coverage threshold failure requires new tests that need business logic understanding."`,

  // ─── 24. Database Migration Error ────────────────────────────────────────
  DATABASE_MIGRATION_ERROR: `ERROR TYPE: Database Migration Error

OBJECTIVE:
Identify and report database migration errors. These are high-risk and should be escalated.

COMMON ERROR PATTERNS:
- Migration failed: relation "X" already exists
- Column "X" does not exist
- Cannot drop column with dependent objects
- Migration checksum mismatch
- Pending migrations detected
- Foreign key constraint violation during migration
- Type mismatch in migration (e.g., altering column type)

INVESTIGATION STEPS:
1. Identify the migration tool (Drizzle, Prisma, TypeORM, Knex, Flyway).
2. Determine the specific SQL statement that failed.
3. Assess whether the error is:
   A) Idempotency issue — Migration already partially applied (re-run safe?).
   B) Schema conflict — Migration assumes state that doesn't match actual DB.
   C) Data loss risk — Migration drops columns/tables with data.
   D) Dependency issue — Migration depends on another migration not yet applied.

ASSESSMENT:
- Migration errors are inherently dangerous — incorrect fixes can cause data loss.
- Modifying migration files that may have already been partially applied is risky.
- Creating new "fix" migrations is safer but requires understanding the intended schema.

FIXING RULES:
- Almost always set can_fix: false — migrations require manual review.
- ONLY fix if the error is clearly a typo in an unapplied migration (e.g., table name spelling).

NEVER DO:
- Do NOT modify migrations that may have already been applied to any environment.
- Do NOT add DROP TABLE or DROP COLUMN without explicit approval.
- Do NOT change column types that may cause data truncation.
- Do NOT skip migration checksums.

SPECIAL CASES:
- Nearly always:
  set can_fix: false with reason "Database migration error requires manual review to prevent data loss."`,

  // ─── 25. Secret/Credential Detected ──────────────────────────────────────
  SECRET_DETECTED: `ERROR TYPE: Secret/Credential Detected in Code

OBJECTIVE:
Identify and report CI failures caused by secret detection scanners (git-secrets, truffleHog, detect-secrets, GitHub secret scanning).

COMMON ERROR PATTERNS:
- Secret detected in file X
- API key found in source code
- Private key detected
- Password hardcoded
- Token found in configuration file
- .env file committed

INVESTIGATION STEPS:
1. Identify the detected secret type (API key, password, token, private key).
2. Determine the file and line where the secret was found.
3. Assess whether it's:
   A) True positive — Actual credential in code.
   B) False positive — Test fixture, example value, hash, or non-secret string matching pattern.
   C) Historical — Secret in git history, not in current code.

ASSESSMENT:
- If true positive: the secret must be rotated AND removed. Code fix alone is insufficient.
- If false positive: can add inline exception or adjust test fixture.

FIXING RULES:
- For true positives: ALWAYS set can_fix: false — requires secret rotation.
- For false positives: replace with placeholder value or add scanner exception comment.

NEVER DO:
- Do NOT just delete the line containing the secret — it's still in git history.
- Do NOT replace with a different real credential.
- Do NOT disable the secret scanner.
- Do NOT encode/obfuscate the secret to bypass detection.

SPECIAL CASES:
- True positive (real credential):
  set can_fix: false with reason "Real credential detected. Must be rotated by operator and removed from git history."
- If cannot determine whether secret is real:
  set can_fix: false with reason "Potential credential detected. Manual verification required before removal."`,

  // ─── 26. Infrastructure/Platform Error ───────────────────────────────────
  INFRASTRUCTURE_ERROR: `ERROR TYPE: Infrastructure/Platform Error

OBJECTIVE:
Identify and report CI failures caused by infrastructure issues, not code.

COMMON ERROR PATTERNS:
- ECONNREFUSED / ENOTFOUND (network failures)
- Container OOMKilled (out of memory)
- Disk space exhausted
- Docker daemon not running
- GitHub Actions runner error
- Rate limit exceeded (npm, Docker Hub, GitHub API)
- TLS/SSL certificate error
- DNS resolution failure
- Permission denied (file system)
- Artifact upload/download failure

INVESTIGATION STEPS:
1. Identify whether the failure is:
   A) Transient — Network blip, rate limit, runner overload (retry may fix).
   B) Configuration — Wrong runner, missing service container, insufficient resources.
   C) Platform issue — GitHub Actions outage, Docker Hub rate limit, npm registry down.
   D) Resource exhaustion — OOM, disk full, too many open files.

2. Check for:
   - HTTP status codes in error messages (429 = rate limit, 503 = service unavailable).
   - Container exit codes (137 = OOMKilled, 139 = segfault).
   - "ECONNREFUSED" on localhost (missing service container in CI).

ASSESSMENT:
- Infrastructure errors are NOT fixable in application code.
- They require CI configuration changes, resource adjustments, or simply retrying.

FIXING RULES:
- ALWAYS set can_fix: false for infrastructure errors.
- Provide clear diagnosis explaining the infrastructure root cause.

NEVER DO:
- Do NOT try to fix infrastructure issues with code changes.
- Do NOT add retry logic in application code to work around CI infrastructure failures.
- Do NOT increase timeouts to mask resource exhaustion.

SPECIAL CASES:
- Always:
  set can_fix: false with reason describing the specific infrastructure issue (e.g., "CI runner OOMKilled — requires increasing memory allocation in workflow configuration.")`,
};
