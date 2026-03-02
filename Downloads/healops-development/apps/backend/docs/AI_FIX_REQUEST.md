# AI Fix Request (Queue + OpenRouter)

Minimal flow: report an API/runtime error with code context → job is queued → worker calls OpenRouter (Claude 3.5 Sonnet) → result is logged and stored on the job.

## Route (no auth)

- **Method/URL:** `POST /v1/healops/fix-request`
- **Auth:** None (`@Public()`)
- **Body:** JSON (see below)
- **Response:** `202 Accepted` with `{ "jobId": "<id>", "message": "..." }`

### Request body

| Field          | Type   | Required | Description                          |
|----------------|--------|----------|--------------------------------------|
| `errorMessage` | string | yes      | Error message from API/runtime       |
| `codeSnippet`  | string | yes      | Code where the error occurs          |
| `lineNumber`   | number | yes      | Line number where error was reported |
| `filePath`     | string | no       | e.g. `src/user.controller.ts`       |
| `language`     | string | no       | e.g. `typescript`                    |

## Flow

1. **API:** Request hits `POST /v1/healops/fix-request` → validated with `FixRequestDto` → job added to queue `healops-fix-request` with job name `fix-request` → returns `jobId`.
2. **Worker:** When the worker process runs, it picks the job, calls **OpenRouter** (`anthropic/claude-3.5-sonnet`) with a prompt that includes the error, code, and line number, and asks for a JSON with:
   - `summary` – short description of what was fixed
   - `errorType` – e.g. syntax, import, type
   - `confidence` – 0–1
   - `fixSuggestion` – brief text explanation or instruction
   - `fixedCode` – the actual corrected code that can be applied in place
3. **Result:** Worker logs a single line with `summary`, `errorType`, `confidence`, token counts, and writes the full result (including `fixedCode`) to the job log (Bull). The return value of the job is the same result object (visible in Bull Board).

## Environment (worker)

Set in `.env` (or env config):

- `OPENROUTER_API_KEY` – **required** for the worker; without it the job will throw.
- Optional: `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` (used by env config; processor currently uses a fixed OpenRouter URL and `anthropic/claude-3.5-sonnet`).

## Running

- **API only:** `pnpm start:dev` (or equivalent) – you can enqueue jobs; they will not be processed until a worker runs.
- **Worker:** `pnpm run worker:start:dev` (or run the worker process that imports `BackgroundModule`). Same app can run API + worker together if both are started.

## Monitoring

- **Bull Board:** `/admin/queues` – open the **HealOps Fix Request Queue** to see jobs, logs, and return value (summary, errorType, confidence, tokens, etc.).
- **Worker logs:** Look for `[HEALOPS_FIX_REQUEST] jobId=... summary="..." errorType=... confidence=... promptTokens=... completionTokens=... totalTokens=...`.

## Swagger

The route and body are documented in Swagger (tag **HealOps Fix Request**). Open `/api` (or your Swagger path) and use **POST /v1/healops/fix-request** to try it.

## Example: curl

See **[AI_FIX_REQUEST_EXAMPLES.md](./AI_FIX_REQUEST_EXAMPLES.md)** for one example per error type (syntax, import, DTO, type, export, build, test, missing dependency, version conflict, package.json syntax).

Minimal example:

```bash
curl -X POST http://localhost:3000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Cannot find module '\''./auth.guard'\''",
    "codeSnippet": "import { AuthGuard } from '\''./auth.guard'\'';\n\n@UseGuards(AuthGuard)\nexport class UserController {}",
    "lineNumber": 14,
    "filePath": "src/user.controller.ts",
    "language": "typescript"
  }'
```

Expected response (example):

```json
{
  "jobId": "1",
  "message": "Fix request queued. Run the worker (pnpm start:dev or pnpm run worker:start:dev) and check worker logs / Bull Board (admin/queues) for result."
}
```

Then start the worker and check Bull Board or worker logs for the AI result (summary, errorType, confidence, tokens).
