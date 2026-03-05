#!/usr/bin/env bash
# ─── HealOps Fix Request Test Script ────────────────────────────────────────
# Tests the /v1/healops/fix-request endpoint end-to-end.
#
# Prerequisites:
#   1. PostgreSQL running with DB created
#   2. Redis running
#   3. Run migration:  pnpm db:migrate
#   4. Start API:      pnpm start:dev  (or run API + worker separately)
#   5. Ensure .env has: ANTHROPIC_API_KEY or OPENAI_API_KEY (for AI provider)
#                       OPENAI_API_KEY (for embeddings)
#   6. psql CLI available (used by Tests 11-15 for DB polling and audit)
#
# Environment variables:
#   BASE_URL       — API base URL (default: http://localhost:4000)
#   DATABASE_URL   — PostgreSQL connection string (default: postgresql://postgres:postgres@localhost:5432/healops)
#
# Usage:
#   chmod +x scripts/test-fix-request.sh
#   ./scripts/test-fix-request.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
ENDPOINT="$BASE_URL/v1/healops/fix-request"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# ─── DB connection (used by wait_and_check / summary) ─────────────────────────
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/healops}"
POLL_INTERVAL=3
MAX_WAIT=120

psql_query() {
  psql "$DB_URL" -t -A -F '|' -c "$1" 2>/dev/null
}

# ─── Helper: wait for fix request to reach terminal status, then print audit ──
wait_and_check() {
  local description="$1"
  local fix_request_id="$2"

  if [ -z "$fix_request_id" ]; then
    fail "$description — no fix_request_id to poll"
    return 0
  fi

  info "Polling fix_request $fix_request_id until terminal status (max ${MAX_WAIT}s)..."

  local elapsed=0
  local status=""
  while [ $elapsed -lt $MAX_WAIT ]; do
    status=$(psql_query "SELECT status FROM fix_requests WHERE id = '$fix_request_id'" | tr -d '[:space:]')
    if [[ "$status" == "completed" || "$status" == "failed" || "$status" == "out_of_scope" ]]; then
      break
    fi
    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))
    echo -ne "  ⏳ ${elapsed}s (status: ${status:-pending})...\r"
  done
  echo ""

  if [[ "$status" != "completed" && "$status" != "failed" && "$status" != "out_of_scope" ]]; then
    fail "$description — timed out after ${MAX_WAIT}s (last status: $status)"
    return 0
  fi

  # ── Fix request summary ──
  local fr_row
  fr_row=$(psql_query "SELECT status, classified_error_type, is_in_scope, scope_reason, job_id FROM fix_requests WHERE id = '$fix_request_id'")
  local fr_status fr_error_type fr_in_scope fr_scope_reason fr_job_id
  fr_status=$(echo "$fr_row" | cut -d'|' -f1)
  fr_error_type=$(echo "$fr_row" | cut -d'|' -f2)
  fr_in_scope=$(echo "$fr_row" | cut -d'|' -f3)
  fr_scope_reason=$(echo "$fr_row" | cut -d'|' -f4)
  fr_job_id=$(echo "$fr_row" | cut -d'|' -f5)

  echo -e "  ${CYAN}Fix Request:${NC}"
  echo "    Status:       $fr_status"
  echo "    Error Type:   $fr_error_type"
  echo "    In Scope:     $fr_in_scope"
  [ -n "$fr_scope_reason" ] && echo "    Scope Reason: $fr_scope_reason"

  if [ -z "$fr_job_id" ]; then
    info "No job created (out_of_scope or failed early)"
    return 0
  fi

  # ── Job summary ──
  local job_row
  job_row=$(psql_query "SELECT status, current_retry, total_tokens_used, max_retries FROM jobs WHERE id = '$fr_job_id'")
  local job_status job_retries job_tokens job_max_retries
  job_status=$(echo "$job_row" | cut -d'|' -f1)
  job_retries=$(echo "$job_row" | cut -d'|' -f2)
  job_tokens=$(echo "$job_row" | cut -d'|' -f3)
  job_max_retries=$(echo "$job_row" | cut -d'|' -f4)

  echo -e "  ${CYAN}Job:${NC}"
  echo "    Status:       $job_status"
  echo "    Attempts:     $job_retries / $job_max_retries"
  echo "    Total Tokens: $job_tokens"

  # ── Per-attempt details ──
  local attempts_data
  attempts_data=$(psql_query "SELECT attempt_number, analysis_output::text, total_tokens FROM attempts WHERE job_id = '$fr_job_id' ORDER BY attempt_number")
  if [ -n "$attempts_data" ]; then
    echo -e "  ${CYAN}Attempts:${NC}"
    while IFS='|' read -r a_num a_output a_tokens; do
      echo "    ── Attempt $a_num (tokens: $a_tokens) ──"
      # Extract key fields from analysis_output JSON
      local is_correct evaluation approach rejection used_ids
      is_correct=$(echo "$a_output" | grep -o '"isCorrect":[^,}]*' | head -1 | cut -d':' -f2)
      evaluation=$(echo "$a_output" | grep -o '"evaluationFeedback":"[^"]*"' | head -1 | cut -d'"' -f4)
      approach=$(echo "$a_output" | grep -o '"approach":"[^"]*"' | head -1 | cut -d'"' -f4)
      rejection=$(echo "$a_output" | grep -o '"rejectionReason":"[^"]*"' | head -1 | cut -d'"' -f4)
      used_ids=$(echo "$a_output" | grep -o '"usedSimilarFixIds":\[[^]]*\]' | head -1)
      echo "      Accepted:     ${is_correct:-n/a}"
      [ -n "$evaluation" ] && echo "      Evaluation:   $evaluation"
      [ -n "$approach" ] && echo "      Approach:     $approach"
      [ -n "$rejection" ] && echo "      Rejection:    $rejection"
      [ -n "$used_ids" ] && echo "      Similar IDs:  $used_ids"
    done <<< "$attempts_data"
  fi

  # ── Semantic search audit logs ──
  local search_logs
  search_logs=$(psql_query "SELECT metadata::text FROM healops_audit_logs WHERE entity_type = 'fix_request' AND entity_id = '$fix_request_id' AND action = 'agent.search_similar' ORDER BY created_at")
  if [ -n "$search_logs" ]; then
    echo -e "  ${CYAN}Semantic Search (agent.search_similar):${NC}"
    while IFS= read -r meta; do
      local usable excluded
      usable=$(echo "$meta" | grep -o '"usableCount":[0-9]*' | head -1 | cut -d':' -f2)
      excluded=$(echo "$meta" | grep -o '"excludedCount":[0-9]*' | head -1 | cut -d':' -f2)
      echo "      Usable: ${usable:-0}, Excluded: ${excluded:-0}"
    done <<< "$search_logs"
  fi

  # ── Vector memory entry ──
  local vm_count
  vm_count=$(psql_query "SELECT COUNT(*) FROM vector_memory WHERE job_id = '$fr_job_id'")
  if [ "${vm_count:-0}" -gt 0 ]; then
    echo -e "  ${CYAN}Vector Memory: ${vm_count} entry(s) stored${NC}"
  fi

  echo ""
  pass "$description — final status: $fr_status (attempts: $job_retries)"
}

# ─── Helper: send fix request and resolve fix_request_id via commit_sha ───────
# The API returns a BullMQ jobId, but we need the DB fix_request UUID.
# Since each test uses a unique commitSha, we poll for the fix_request row.
send_request_get_fr_id() {
  local description="$1"
  local payload="$2"
  local commit_sha="$3"

  # All informational output goes to stderr so only the fr_id is on stdout
  info "Sending: $description" >&2

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$payload")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  echo "  HTTP Status: $http_code" >&2
  echo "  Response: $(echo "$body" | head -c 200)" >&2

  if [ "$http_code" != "202" ]; then
    fail "$description — expected 202, got $http_code" >&2
    echo "" >&2
    echo ""
    return
  fi

  pass "$description — queued successfully" >&2

  # Poll for the fix_request row by commit_sha (created by the worker)
  local fr_id=""
  local wait=0
  while [ $wait -lt 30 ]; do
    fr_id=$(psql_query "SELECT id FROM fix_requests WHERE commit_sha = '$commit_sha' ORDER BY created_at DESC LIMIT 1" | tr -d '[:space:]')
    if [ -n "$fr_id" ]; then
      break
    fi
    sleep 2
    wait=$((wait + 2))
  done

  if [ -n "$fr_id" ]; then
    echo "  Fix Request ID: $fr_id" >&2
  else
    echo "  Fix Request ID: (not yet created — worker may be slow)" >&2
  fi
  echo "$fr_id"
}

# ─── Helper: send fix request and capture response ───────────────────────────
send_request() {
  local description="$1"
  local payload="$2"

  info "Sending: $description"

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$payload")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  echo "  HTTP Status: $http_code"
  echo "  Response: $(echo "$body" | head -c 200)"

  if [ "$http_code" = "202" ]; then
    pass "$description — queued successfully"
    local job_id
    job_id=$(echo "$body" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
    echo "  Job ID: $job_id"
    echo "$job_id"
  else
    fail "$description — expected 202, got $http_code"
    echo ""
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
section "Test 0: Health Check"
# ═════════════════════════════════════════════════════════════════════════════

info "Checking API is running at $BASE_URL..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "API is running"
else
  fail "API is not running at $BASE_URL (HTTP $HTTP_STATUS). Start it with: pnpm start:dev"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "Test 1: Syntax Error (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Syntax error — missing closing brace" '{
  "errorMessage": "SyntaxError: Unexpected token, expected \"}\"",
  "codeSnippet": "function greet(name: string) {\n  console.log(`Hello, ${name}!`)\n",
  "lineNumber": 3,
  "branch": "feat/greeting",
  "commitSha": "abc123def456",
  "filePath": "src/utils/greet.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 2: Import Error (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Import error — wrong module path" '{
  "errorMessage": "Cannot find module '\''./auth.guard'\'' or its corresponding type declarations.",
  "codeSnippet": "import { AuthGuard } from '\''./auth.guard'\'';\nimport { Injectable } from '\''@nestjs/common'\'';\n\n@Injectable()\nexport class UserService {\n  constructor(private guard: AuthGuard) {}\n}",
  "lineNumber": 1,
  "branch": "feat/auth",
  "commitSha": "def456abc789",
  "filePath": "src/user/user.service.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 3: Type Error (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Type error — type mismatch" '{
  "errorMessage": "TS2322: Type '\''string'\'' is not assignable to type '\''number'\''.",
  "codeSnippet": "interface User {\n  id: number;\n  name: string;\n}\n\nconst user: User = {\n  id: \"abc\",\n  name: \"John\"\n};",
  "lineNumber": 7,
  "branch": "feat/users",
  "commitSha": "111222333444",
  "filePath": "src/models/user.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 4: Missing Dependency (in-scope — dependency issue)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Missing dependency — lodash not installed" '{
  "errorMessage": "Cannot find module '\''lodash'\'' or its corresponding type declarations. ts(2307)",
  "codeSnippet": "import _ from '\''lodash'\'';\n\nexport function deepClone<T>(obj: T): T {\n  return _.cloneDeep(obj);\n}",
  "lineNumber": 1,
  "branch": "feat/utils",
  "commitSha": "aaa111bbb222",
  "filePath": "src/utils/clone.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 5: Test Failure (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Test failure — wrong expected value" '{
  "errorMessage": "expect(received).toBe(expected)\n\nExpected: 5\nReceived: 4",
  "codeSnippet": "describe('\''add'\'', () => {\n  it('\''should add two numbers'\'', () => {\n    expect(add(2, 2)).toBe(5);\n  });\n});\n\nfunction add(a: number, b: number): number {\n  return a + b;\n}",
  "lineNumber": 3,
  "branch": "feat/math",
  "commitSha": "ccc333ddd444",
  "filePath": "src/utils/math.spec.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 6: Out of Scope Error"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Out of scope — database connection error" '{
  "errorMessage": "FATAL: password authentication failed for user \"postgres\"",
  "codeSnippet": "const pool = new Pool({\n  host: '\''localhost'\'',\n  port: 5432,\n  user: '\''postgres'\'',\n  password: '\''wrong_password'\'',\n  database: '\''mydb'\''\n});",
  "lineNumber": 1,
  "branch": "main",
  "commitSha": "eee555fff666",
  "filePath": "src/db/connection.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 7: Build Error (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Build error — missing decorator metadata" '{
  "errorMessage": "Error: Nest cannot resolve dependencies of the UserService (?). Please make sure that the argument UserRepository at index [0] is available in the UserModule context.",
  "codeSnippet": "import { Injectable } from '\''@nestjs/common'\'';\nimport { UserRepository } from '\''./user.repository'\'';\n\n@Injectable()\nexport class UserService {\n  constructor(private readonly userRepo: UserRepository) {}\n}",
  "lineNumber": 6,
  "branch": "feat/di-fix",
  "commitSha": "ggg777hhh888",
  "filePath": "src/user/user.service.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 8: Export Error (in-scope — code error)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "Export error — function not exported" '{
  "errorMessage": "Module '\''./utils'\'' has no exported member '\''formatDate'\''.",
  "codeSnippet": "// utils.ts\nfunction formatDate(date: Date): string {\n  return date.toISOString().split('\''T'\'')[0];\n}\n\nfunction formatTime(date: Date): string {\n  return date.toISOString().split('\''T'\'')[1];\n}",
  "lineNumber": 2,
  "branch": "feat/dates",
  "commitSha": "iii999jjj000",
  "filePath": "src/utils/utils.ts",
  "language": "typescript"
}'

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 9: Validation — Missing Required Fields"
# ═════════════════════════════════════════════════════════════════════════════

info "Sending request missing required fields (branch, commitSha)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Some error",
    "codeSnippet": "const x = 1;",
    "lineNumber": 1
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "400" ]; then
  pass "Validation rejected missing fields (HTTP 400)"
else
  fail "Expected 400 for missing fields, got $HTTP_CODE"
fi

echo ""

# ═════════════════════════════════════════════════════════════════════════════
section "Test 10: Package.json Error (in-scope — dependency issue)"
# ═════════════════════════════════════════════════════════════════════════════

send_request "package.json parse error" '{
  "errorMessage": "EJSONPARSE: Unexpected token in JSON at position 145 while parsing near '\''...\"lodash\": \"^4.17.21\",}'\''",
  "codeSnippet": "{\n  \"name\": \"my-app\",\n  \"dependencies\": {\n    \"express\": \"^4.18.0\",\n    \"lodash\": \"^4.17.21\",\n  }\n}",
  "lineNumber": 6,
  "branch": "fix/package",
  "commitSha": "kkk111lll222",
  "filePath": "package.json",
  "language": "json"
}'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
section "Test 11: Retry — Ambiguous DTO/Interface Error"
# ═════════════════════════════════════════════════════════════════════════════

info "Complex interrelated type mismatches — should trigger evaluate_fix rejection + retry"
TEST11_FR_ID=$(send_request_get_fr_id "DTO/Interface type mismatch — multi-interface error" '{
  "errorMessage": "TS2345: Argument of type '\''{ userId: string; role: AdminRole; permissions: ReadonlyArray<Permission>; metadata: UserMeta }'\'' is not assignable to parameter of type '\''CreateUserInput'\''. Types of property '\''permissions'\'' are incompatible. Type '\''ReadonlyArray<Permission>'\'' is not assignable to type '\''Permission[]'\''. The type '\''readonly Permission[]'\'' is '\''readonly'\'' and cannot be assigned to the mutable type '\''Permission[]'\''.",
  "codeSnippet": "interface Permission {\n  resource: string;\n  action: \"read\" | \"write\" | \"delete\";\n  conditions?: Record<string, unknown>;\n}\n\ninterface AdminRole {\n  name: string;\n  level: number;\n  permissions: Permission[];\n}\n\ninterface UserMeta {\n  lastLogin: Date;\n  preferences: Map<string, string>;\n}\n\ninterface CreateUserInput {\n  userId: string;\n  role: AdminRole;\n  permissions: Permission[];\n  metadata: UserMeta;\n}\n\nfunction createUser(input: CreateUserInput): void {\n  console.log(input);\n}\n\nconst perms: ReadonlyArray<Permission> = [\n  { resource: \"posts\", action: \"read\" },\n  { resource: \"users\", action: \"write\" }\n];\n\nconst meta: UserMeta = {\n  lastLogin: new Date(),\n  preferences: new Map([[\"theme\", \"dark\"]])\n};\n\ncreateUser({\n  userId: \"usr_123\",\n  role: { name: \"admin\", level: 1, permissions: [...perms] },\n  permissions: perms,\n  metadata: meta\n});",
  "lineNumber": 39,
  "branch": "feat/rbac",
  "commitSha": "retry11aaa111",
  "filePath": "src/auth/services/user-factory.ts",
  "language": "typescript"
}' "retry11aaa111")

echo ""
wait_and_check "Test 11: DTO/Interface retry" "$TEST11_FR_ID"

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 12: Retry — Circular Dependency Build Error"
# ═════════════════════════════════════════════════════════════════════════════

info "NestJS circular dependency — first fix likely incomplete → evaluate_fix rejects → retry"
TEST12_FR_ID=$(send_request_get_fr_id "Circular dependency — module graph error" '{
  "errorMessage": "Error: A circular dependency has been detected between modules: OrderModule → PaymentModule → NotificationModule → OrderModule. Please, make sure that each side of a bi-directional relationship is decorated with \"forwardRef()\".",
  "codeSnippet": "// order.module.ts\nimport { Module } from \"@nestjs/common\";\nimport { PaymentModule } from \"../payment/payment.module\";\nimport { OrderService } from \"./order.service\";\nimport { OrderController } from \"./order.controller\";\n\n@Module({\n  imports: [PaymentModule],\n  controllers: [OrderController],\n  providers: [OrderService],\n  exports: [OrderService],\n})\nexport class OrderModule {}\n\n// payment.module.ts\nimport { Module } from \"@nestjs/common\";\nimport { NotificationModule } from \"../notification/notification.module\";\nimport { PaymentService } from \"./payment.service\";\n\n@Module({\n  imports: [NotificationModule],\n  providers: [PaymentService],\n  exports: [PaymentService],\n})\nexport class PaymentModule {}\n\n// notification.module.ts\nimport { Module } from \"@nestjs/common\";\nimport { OrderModule } from \"../order/order.module\";\nimport { NotificationService } from \"./notification.service\";\n\n@Module({\n  imports: [OrderModule],\n  providers: [NotificationService],\n  exports: [NotificationService],\n})\nexport class NotificationModule {}",
  "lineNumber": 8,
  "branch": "feat/orders",
  "commitSha": "retry12bbb222",
  "filePath": "src/order/order.module.ts",
  "language": "typescript"
}' "retry12bbb222")

echo ""
wait_and_check "Test 12: Circular dependency retry" "$TEST12_FR_ID"

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 13: Semantic Search — Seed Vector Memory"
# ═════════════════════════════════════════════════════════════════════════════

info "Clear TS2345 argument type mismatch — should complete and store in vector_memory"
TEST13_FR_ID=$(send_request_get_fr_id "TS2345 type error — seed for semantic search" '{
  "errorMessage": "TS2345: Argument of type '\''string'\'' is not assignable to parameter of type '\''number'\''.",
  "codeSnippet": "function calculateTotal(price: number, quantity: number): number {\n  return price * quantity;\n}\n\nconst userInput = \"42\";\nconst qty = 5;\nconst total = calculateTotal(userInput, qty);",
  "lineNumber": 7,
  "branch": "feat/cart",
  "commitSha": "seed13ccc333",
  "filePath": "src/shop/cart.service.ts",
  "language": "typescript"
}' "seed13ccc333")

echo ""
wait_and_check "Test 13: Seed vector memory" "$TEST13_FR_ID"

# Verify vector_memory entry was stored
if [ -n "$TEST13_FR_ID" ]; then
  info "Querying vector_memory for seeded entry..."
  local_job_id=$(psql_query "SELECT job_id FROM fix_requests WHERE id = '$TEST13_FR_ID'" | tr -d '[:space:]')
  if [ -n "$local_job_id" ]; then
    vm_entry=$(psql_query "SELECT id, failure_type, language, confidence, usage_count, LENGTH(error_embedding::text) AS emb_len FROM vector_memory WHERE job_id = '$local_job_id'")
    if [ -n "$vm_entry" ]; then
      echo -e "  ${GREEN}Vector memory entry confirmed:${NC}"
      echo "    $vm_entry"
    else
      echo -e "  ${YELLOW}No vector_memory entry found (job may not have succeeded)${NC}"
    fi
  fi
fi

echo ""
sleep 5  # Give embeddings time to settle

# ═════════════════════════════════════════════════════════════════════════════
section "Test 14: Semantic Search — Similar Error Retrieval"
# ═════════════════════════════════════════════════════════════════════════════

info "Similar TS2345 error (same pattern, different names) — should find Test 13 via cosine similarity"
TEST14_FR_ID=$(send_request_get_fr_id "TS2345 similar error — semantic retrieval" '{
  "errorMessage": "TS2345: Argument of type '\''string'\'' is not assignable to parameter of type '\''number'\''.",
  "codeSnippet": "function computeDiscount(originalPrice: number, discountPercent: number): number {\n  return originalPrice * (discountPercent / 100);\n}\n\nconst rawPrice = \"99.99\";\nconst percent = 15;\nconst discount = computeDiscount(rawPrice, percent);",
  "lineNumber": 7,
  "branch": "feat/pricing",
  "commitSha": "similar14ddd444",
  "filePath": "src/shop/pricing.service.ts",
  "language": "typescript"
}' "similar14ddd444")

echo ""
wait_and_check "Test 14: Similar error retrieval" "$TEST14_FR_ID"

# Check search_similar audit for usable hits
if [ -n "$TEST14_FR_ID" ]; then
  info "Checking agent.search_similar audit for usableCount > 0..."
  search_audit=$(psql_query "SELECT metadata::text FROM healops_audit_logs WHERE entity_type = 'fix_request' AND entity_id = '$TEST14_FR_ID' AND action = 'agent.search_similar' ORDER BY created_at LIMIT 1")
  if [ -n "$search_audit" ]; then
    usable=$(echo "$search_audit" | grep -o '"usableCount":[0-9]*' | head -1 | cut -d':' -f2)
    if [ "${usable:-0}" -gt 0 ]; then
      pass "Test 14: search_similar found $usable usable fix(es) from vector memory"
    else
      echo -e "  ${YELLOW}search_similar returned 0 usable (similarity may be below threshold)${NC}"
    fi
  else
    echo -e "  ${YELLOW}No agent.search_similar audit log found${NC}"
  fi
fi

echo ""
sleep 2

# ═════════════════════════════════════════════════════════════════════════════
section "Test 15: Semantic Search — No Match (unrelated error)"
# ═════════════════════════════════════════════════════════════════════════════

info "Completely unrelated error — search_similar should return 0 usable fixes"
TEST15_FR_ID=$(send_request_get_fr_id "Unrelated syntax error — no semantic match" '{
  "errorMessage": "SyntaxError: Unexpected token '\''<'\''. Expected identifier but found '\''<'\''.",
  "codeSnippet": "export function renderPage() {\n  const title = \"Welcome\";\n  return <div className=\"page\">\n    <h1>{title}</h1>\n    <p>Hello world</p>\n  </div>;\n}",
  "lineNumber": 3,
  "branch": "feat/react-pages",
  "commitSha": "nomatch15eee555",
  "filePath": "src/pages/home.tsx",
  "language": "typescript"
}' "nomatch15eee555")

echo ""
wait_and_check "Test 15: No semantic match" "$TEST15_FR_ID"

# Check search_similar audit for zero usable
if [ -n "$TEST15_FR_ID" ]; then
  info "Checking agent.search_similar audit for usableCount = 0..."
  search_audit=$(psql_query "SELECT metadata::text FROM healops_audit_logs WHERE entity_type = 'fix_request' AND entity_id = '$TEST15_FR_ID' AND action = 'agent.search_similar' ORDER BY created_at LIMIT 1")
  if [ -n "$search_audit" ]; then
    usable=$(echo "$search_audit" | grep -o '"usableCount":[0-9]*' | head -1 | cut -d':' -f2)
    if [ "${usable:-0}" -eq 0 ]; then
      pass "Test 15: search_similar found 0 usable fixes (correct — unrelated error)"
    else
      echo -e "  ${YELLOW}Unexpected: search_similar found $usable usable fix(es)${NC}"
    fi
  else
    echo -e "  ${YELLOW}No agent.search_similar audit log found${NC}"
  fi
fi

echo ""

# ═════════════════════════════════════════════════════════════════════════════
section "DB Summary"
# ═════════════════════════════════════════════════════════════════════════════

info "Querying database for aggregate results..."

echo ""
echo -e "${CYAN}── Fix Requests ──${NC}"
psql_query "SELECT status, COUNT(*) AS cnt FROM fix_requests GROUP BY status ORDER BY status" | while IFS='|' read -r st cnt; do
  echo "  $st: $cnt"
done

echo ""
echo -e "${CYAN}── Vector Memory Entries ──${NC}"
vm_total=$(psql_query "SELECT COUNT(*) FROM vector_memory WHERE deleted_at IS NULL")
echo "  Total entries: ${vm_total:-0}"
psql_query "SELECT failure_type, language, confidence, usage_count FROM vector_memory WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10" | while IFS='|' read -r ft lang conf usage; do
  echo "  [$ft] lang=$lang confidence=$conf usage_count=$usage"
done

echo ""
echo -e "${CYAN}── Semantic Search Audit (agent.search_similar) ──${NC}"
search_total=$(psql_query "SELECT COUNT(*) FROM healops_audit_logs WHERE action = 'agent.search_similar'")
echo "  Total search events: ${search_total:-0}"
psql_query "SELECT entity_id, metadata::text FROM healops_audit_logs WHERE action = 'agent.search_similar' ORDER BY created_at DESC LIMIT 10" | while IFS='|' read -r eid meta; do
  usable=$(echo "$meta" | grep -o '"usableCount":[0-9]*' | head -1 | cut -d':' -f2)
  excluded=$(echo "$meta" | grep -o '"excludedCount":[0-9]*' | head -1 | cut -d':' -f2)
  echo "  fix_request=$eid → usable=${usable:-0}, excluded=${excluded:-0}"
done

echo ""
echo -e "${CYAN}── Attempts with Rejection Reasons ──${NC}"
psql_query "
  SELECT a.attempt_number,
         j.fix_request_id,
         a.analysis_output->>'isCorrect' AS accepted,
         a.analysis_output->>'rejectionReason' AS rejection,
         a.total_tokens
  FROM attempts a
  JOIN jobs j ON a.job_id = j.id
  WHERE j.fix_request_id IS NOT NULL
    AND (a.analysis_output->>'isCorrect') = 'false'
  ORDER BY j.created_at, a.attempt_number
" | while IFS='|' read -r anum frid accepted rejection tokens; do
  echo "  fix_request=$frid attempt=$anum rejected: ${rejection:-no reason} (tokens: $tokens)"
done

echo ""
echo -e "${CYAN}── All Tests Summary ──${NC}"
echo "  Test 1-3:   Code errors (syntax, import, type) → classify in-scope, generate fix"
echo "  Test 4:     Dependency issue (missing dep) → classify in-scope, suggest install"
echo "  Test 5:     Test failure → classify in-scope, fix assertion"
echo "  Test 6:     Out of scope (DB auth error) → classify out_of_scope"
echo "  Test 7:     Build error (NestJS DI) → classify in-scope, fix module config"
echo "  Test 8:     Export error → classify in-scope, add export keyword"
echo "  Test 9:     Validation → reject with 400 (missing required fields)"
echo "  Test 10:    package.json error → classify in-scope, fix JSON syntax"
echo "  Test 11:    Retry — DTO/interface mismatch → multi-attempt with rejection"
echo "  Test 12:    Retry — Circular dependency → multi-attempt with different approaches"
echo "  Test 13:    Semantic search — Seed vector memory with TS2345 fix"
echo "  Test 14:    Semantic search — Retrieve similar TS2345 via cosine similarity"
echo "  Test 15:    Semantic search — No match for unrelated error type"
echo ""
echo -e "${CYAN}Manual verification:${NC}"
echo "  1. Bull Board:    $BASE_URL/admin/queues"
echo "  2. Worker logs:   check for [search_similar], [evaluate_fix], [generate_fix] entries"
echo "  3. DB queries:"
echo "     SELECT * FROM vector_memory ORDER BY created_at DESC;"
echo "     SELECT * FROM healops_audit_logs WHERE action = 'agent.search_similar' ORDER BY created_at DESC;"
echo "     SELECT a.attempt_number, a.analysis_output->>'isCorrect', a.analysis_output->>'rejectionReason' FROM attempts a JOIN jobs j ON a.job_id = j.id WHERE j.fix_request_id IS NOT NULL ORDER BY j.created_at, a.attempt_number;"
echo ""
echo -e "${YELLOW}Note: Worker must be running to process queued jobs.${NC}"
echo -e "${YELLOW}AI processing takes 10-30s per request. Retry tests may take 30-90s.${NC}"
