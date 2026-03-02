# Fix Request: Examples That Can Fail Attempt 1 Then Succeed on Attempt 2

These `curl` examples target **POST /v1/healops/fix-request**. The agent may **reject the first fix** (quality gate or self-evaluation) and **succeed on the second attempt**.

- **Quality gate** rejects: `as any`, `@ts-ignore`, `.skip()`, empty catch, etc.
- **Confidence** threshold (default 0.6) can reject low-confidence fixes.
- **Pre-check** (e.g. syntax) can reject a fix that doesn’t compile.

Use `BASE_URL=http://localhost:3000` (or `4000` if your API runs there).

---

## 1. Type error — LLM might suggest `as any` (rejected) then fix properly

**Why attempt 1 can fail:** Model often suggests `as number` or `as any` first; quality gate rejects `as any`. Second attempt usually fixes the value.

```bash
curl -s -X POST "http://localhost:3000/v1/healops/fix-request" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "TS2322: Type '\''string'\'' is not assignable to type '\''number'\''.",
    "codeSnippet": "interface User {\n  id: number;\n  name: string;\n}\n\nconst user: User = {\n  id: \"abc\",\n  name: \"John\"\n};",
    "lineNumber": 7,
    "branch": "feat/retry-type",
    "commitSha": "a1b2c3d4e5f6",
    "filePath": "src/models/user.ts",
    "language": "typescript"
  }'
```

---

## 2. Test failure — LLM might suggest `.skip()` (rejected) then fix the implementation

**Why attempt 1 can fail:** Model might suggest `it.skip()` or changing the expectation to match the wrong value; quality gate rejects `.skip()`. Second attempt often fixes the implementation.

```bash
curl -s -X POST "http://localhost:3000/v1/healops/fix-request" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "expect(received).toBe(expected)\n\nExpected: 5\nReceived: 4",
    "codeSnippet": "describe('\''add'\'', () => {\n  it('\''should add two numbers'\'', () => {\n    expect(add(2, 2)).toBe(5);\n  });\n});\n\nfunction add(a: number, b: number): number {\n  return a + b;\n}",
    "lineNumber": 3,
    "branch": "feat/retry-test",
    "commitSha": "b2c3d4e5f6a7",
    "filePath": "src/utils/math.spec.ts",
    "language": "typescript"
  }'
```

---

## 3. Import error — ambiguous path (first fix might be wrong, pre-check or evaluation fails)

**Why attempt 1 can fail:** First suggestion might be a wrong path or a fix that doesn’t resolve; pre-check or LLM evaluation can reject it. Second attempt may correct the path.

```bash
curl -s -X POST "http://localhost:3000/v1/healops/fix-request" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Cannot find module '\''./auth.guard'\'' or its corresponding type declarations.",
    "codeSnippet": "import { AuthGuard } from '\''./auth.guard'\'';\nimport { Injectable } from '\''@nestjs/common'\'';\n\n@Injectable()\nexport class UserService {\n  constructor(private guard: AuthGuard) {}\n}",
    "lineNumber": 1,
    "branch": "feat/retry-import",
    "commitSha": "c3d4e5f6a7b8",
    "filePath": "src/user/user.service.ts",
    "language": "typescript"
  }'
```

---

## 4. Syntax error — missing brace (first fix might introduce another syntax error)

**Why attempt 1 can fail:** First patch might be incomplete or introduce a new syntax error; pre-check fails. Second attempt can produce valid syntax.

```bash
curl -s -X POST "http://localhost:3000/v1/healops/fix-request" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "SyntaxError: Unexpected token, expected \"}\"",
    "codeSnippet": "function greet(name: string) {\n  console.log(`Hello, ${name}!`)\n",
    "lineNumber": 3,
    "branch": "feat/retry-syntax",
    "commitSha": "d4e5f6a7b8c9",
    "filePath": "src/utils/greet.ts",
    "language": "typescript"
  }'
```

---

## 5. Low-confidence scenario — DTO validation (attempt 1 might report low confidence)

**Why attempt 1 can fail:** Model might return a fix with confidence &lt; 0.6; agent rejects and retries. Second attempt may return a higher-confidence fix.

```bash
curl -s -X POST "http://localhost:3000/v1/healops/fix-request" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Property '\''email'\'' is missing in type '\''{}\'\'' but required in type '\''CreateUserDto'\''.",
    "codeSnippet": "const body = {};\nreturn this.userService.create(body);",
    "lineNumber": 2,
    "branch": "feat/retry-dto",
    "commitSha": "e5f6a7b8c9d0",
    "filePath": "src/user/user.controller.ts",
    "language": "typescript"
  }'
```

---

## Checking attempt counts

- **Bull Board:** `http://localhost:3000/admin/queues` → open **HealOps Fix Request** queue → job logs show attempt steps.
- **Database:** After the job completes, query `attempts` for the `job_id` (from the fix_request row) to see `attempt_number`, `analysis_output`, and `total_tokens`.

```bash
# After you have fix_request_id from the response or DB:
# psql $DATABASE_URL -c "SELECT id, status, job_id FROM fix_requests WHERE commit_sha = 'a1b2c3d4e5f6' ORDER BY created_at DESC LIMIT 1;"
# psql $DATABASE_URL -c "SELECT attempt_number, total_tokens FROM attempts WHERE job_id = '<job_id>' ORDER BY attempt_number;"
```
