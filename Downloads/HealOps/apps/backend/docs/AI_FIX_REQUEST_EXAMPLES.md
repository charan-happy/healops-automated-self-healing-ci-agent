# AI Fix Request – Test Examples by Error Type

Use `POST /v1/healops/fix-request` with the body below. Base URL: `http://localhost:3000`.

---

## Case 1 – Common Code Errors

### 1. Syntax errors (missing braces, parentheses, semicolons)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Expected \")\" or \",\" but found \"{\"",
    "codeSnippet": "function add(a: number, b: number {\n  return a + b;\n}",
    "lineNumber": 1,
    "filePath": "src/math/utils.ts",
    "language": "typescript"
  }'
```

---

### 2. Import errors (missing imports, incorrect module paths)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Cannot find module \"../guards/jwt-auth.guard\"",
    "codeSnippet": "import { JwtAuthGuard } from \"../guards/jwt-auth.guard\";\n\n@UseGuards(JwtAuthGuard)\nexport class ProfileController {}",
    "lineNumber": 1,
    "filePath": "src/profile/profile.controller.ts",
    "language": "typescript"
  }'
```

---

### 3. DTO/Interface errors (type mismatches, missing properties)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Property \"email\" is missing in type \"{}\" but required in type \"CreateUserDto\"",
    "codeSnippet": "export class CreateUserDto {\n  email: string;\n  name: string;\n}\n\nconst dto: CreateUserDto = {\n  name: \"John\"\n};",
    "lineNumber": 6,
    "filePath": "src/users/dto/create-user.dto.ts",
    "language": "typescript"
  }'
```

---

### 4. Type errors (TypeScript compilation failures)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Argument of type \"string\" is not assignable to parameter of type \"number\"",
    "codeSnippet": "function parseId(id: number): number { return id; }\nconst id = req.params[\"id\"];\nparseId(id);",
    "lineNumber": 3,
    "filePath": "src/users/users.controller.ts",
    "language": "typescript"
  }'
```

---

### 5. Export errors (functions not exported from modules)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Module \"../utils/format\" has no exported member \"formatDate\"",
    "codeSnippet": "function formatDate(d: Date): string {\n  return d.toISOString().split(\"T\")[0];\n}",
    "lineNumber": 1,
    "filePath": "src/utils/format.ts",
    "language": "typescript"
  }'
```

---

### 6. Build issues (framework decorators, configuration errors)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Decorator is not valid here. Nest decorators must be applied to class or method",
    "codeSnippet": "import { Controller, Get } from \"@nestjs/common\";\n\n@Controller(\"health\")\nconst health = \"ok\";\n\n@Get()\ngetHealth() { return health; }",
    "lineNumber": 4,
    "filePath": "src/health/health.controller.ts",
    "language": "typescript"
  }'
```

---

### 7. Test failures (incorrect assertions, wrong expected values)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Expected: 2, Received: 3. add(1, 2) should return 3",
    "codeSnippet": "describe(\"add\", () => {\n  it(\"should add two numbers\", () => {\n    expect(add(1, 2)).toBe(2);\n  });\n});\n\nfunction add(a: number, b: number) { return a + b; }",
    "lineNumber": 4,
    "filePath": "src/math/utils.spec.ts",
    "language": "typescript"
  }'
```

---

## Case 2 – Dependency Issues

### 8. Missing dependencies (packages used but not in package.json)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Cannot find module \"zod\". Did you mean \"node:zod\"? Or add \"zod\" to package.json?",
    "codeSnippet": "import { z } from \"zod\";\nconst Schema = z.object({ name: z.string() });",
    "lineNumber": 1,
    "filePath": "src/schema/validation.ts",
    "language": "typescript"
  }'
```

---

### 9. Dependency version conflicts (incompatible package versions)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "peer dependency \"react@^18\" required by \"@tanstack/react-query\" but found \"react@17.0.2\"",
    "codeSnippet": "{\n  \"dependencies\": {\n    \"react\": \"17.0.2\",\n    \"@tanstack/react-query\": \"^5.0.0\"\n  }\n}",
    "lineNumber": 4,
    "filePath": "package.json",
    "language": "json"
  }'
```

---

### 10. package.json errors (syntax errors, malformed configuration)

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Unexpected token \",\" at line 5. Trailing comma not allowed in JSON",
    "codeSnippet": "{\n  \"name\": \"my-app\",\n  \"scripts\": {\n    \"start\": \"node index.js\",\n  }\n}",
    "lineNumber": 5,
    "filePath": "package.json",
    "language": "json"
  }'
```

---

## Quick reference

| # | Type                    | Focus of fix                          |
|---|-------------------------|----------------------------------------|
| 1 | Syntax                  | Braces, parens, semicolons             |
| 2 | Import                  | Paths, missing modules                 |
| 3 | DTO/Interface           | Missing/extra properties, types        |
| 4 | Type                    | TS types, casts, generics              |
| 5 | Export                  | `export` keyword, barrel files        |
| 6 | Build / decorators      | Nest/class structure, config          |
| 7 | Test                    | Assertions, expected values             |
| 8 | Missing dependency      | Add to package.json / install          |
| 9 | Version conflict        | Bump/downgrade versions                |
|10 | package.json syntax     | Valid JSON, no trailing commas         |
