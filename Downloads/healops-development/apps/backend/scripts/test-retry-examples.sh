#!/usr/bin/env bash
# ─── Retry Examples: Tests that should trigger attempt 2 and 3 ────────────────
# These errors are complex enough that evaluate_fix rejects the first attempt.
#
# Prerequisites: API running at localhost:4000, psql available
#
# Usage:
#   chmod +x scripts/test-retry-examples.sh
#   ./scripts/test-retry-examples.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
ENDPOINT="$BASE_URL/v1/healops/fix-request"
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/healops}"
POLL_INTERVAL=3
MAX_WAIT=120

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

psql_query() {
  psql "$DB_URL" -t -A -F '|' -c "$1" 2>/dev/null
}

# ─── Send request and return fix_request_id via commit_sha ─────────────────────
send_and_get_id() {
  local description="$1"
  local payload="$2"
  local commit_sha="$3"

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
    echo ""
    return
  fi

  pass "$description — queued" >&2

  # Poll for fix_request row
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
    echo "  (not yet created — worker may be slow)" >&2
  fi
  echo "$fr_id"
}

# ─── Wait for terminal status and print full audit trail ───────────────────────
wait_and_check() {
  local description="$1"
  local fix_request_id="$2"

  if [ -z "$fix_request_id" ]; then
    fail "$description — no fix_request_id to poll"
    return 0
  fi

  info "Polling fix_request $fix_request_id (max ${MAX_WAIT}s)..."

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

  # Fix request summary
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

  # Job summary
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

  # Per-attempt details
  local attempts_data
  attempts_data=$(psql_query "SELECT attempt_number, analysis_output::text, total_tokens FROM attempts WHERE job_id = '$fr_job_id' ORDER BY attempt_number")
  if [ -n "$attempts_data" ]; then
    echo -e "  ${CYAN}Attempts:${NC}"
    while IFS='|' read -r a_num a_output a_tokens; do
      echo "    ── Attempt $a_num (tokens: $a_tokens) ──"
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

  echo ""
  pass "$description — final status: $fr_status (attempts: $job_retries)"
}

# ═══════════════════════════════════════════════════════════════════════════════
section "Health Check"
# ═══════════════════════════════════════════════════════════════════════════════

info "Checking API at $BASE_URL..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "API is running"
else
  fail "API not running at $BASE_URL (HTTP $HTTP_STATUS). Start with: pnpm start:dev"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "Example 1: Nested Generic Constraint Violation"
# ═══════════════════════════════════════════════════════════════════════════════

info "Attempt 1 usually fixes outer generic but misses inner Serializable constraint"

PAYLOAD1=$(cat <<'JSONEOF'
{
  "errorMessage": "TS2344: Type 'Record<string, unknown>' does not satisfy the constraint 'BaseEntity & Serializable<JSONOutput>'. Type 'Record<string, unknown>' is missing the following properties from type 'BaseEntity': id, createdAt, updatedAt. Also: Type 'Record<string, unknown>' does not satisfy the constraint 'Serializable<JSONOutput>': property 'toJSON' is missing.",
  "codeSnippet": "interface BaseEntity {\n  id: string;\n  createdAt: Date;\n  updatedAt: Date;\n}\n\ninterface JSONOutput {\n  [key: string]: string | number | boolean | null;\n}\n\ninterface Serializable<T> {\n  toJSON(): T;\n}\n\nclass Repository<T extends BaseEntity & Serializable<JSONOutput>> {\n  private items: Map<string, T> = new Map();\n\n  save(entity: T): void {\n    this.items.set(entity.id, entity);\n  }\n\n  findById(id: string): T | undefined {\n    return this.items.get(id);\n  }\n\n  toSnapshot(): JSONOutput[] {\n    return Array.from(this.items.values()).map(e => e.toJSON());\n  }\n}\n\nconst userRepo = new Repository<Record<string, unknown>>();",
  "lineNumber": 30,
  "branch": "feat/repo-generics",
  "commitSha": "retry_generic_001",
  "filePath": "src/common/repository.ts",
  "language": "typescript"
}
JSONEOF
)

FR1_ID=$(send_and_get_id "Nested generic constraint" "$PAYLOAD1" "retry_generic_001")
echo ""
wait_and_check "Example 1: Generic constraint" "$FR1_ID"

echo ""
sleep 2

# ═══════════════════════════════════════════════════════════════════════════════
section "Example 2: Mutually Dependent Type Guards"
# ═══════════════════════════════════════════════════════════════════════════════

info "Attempt 1 fixes processHighPriorityEvent call but misses event.userId on SystemEvent branch"

PAYLOAD2=$(cat <<'JSONEOF'
{
  "errorMessage": "TS2345: Argument of type 'AdminEvent | UserEvent | SystemEvent' is not assignable to parameter of type 'AdminEvent & { auditLevel: \"high\" }'. Type 'UserEvent' is not assignable to type 'AdminEvent'. Property 'adminId' is missing in type 'UserEvent' but required in type 'AdminEvent'. Also: TS2339: Property 'userId' does not exist on type 'never' in the else branch.",
  "codeSnippet": "interface AdminEvent {\n  type: \"admin\";\n  adminId: string;\n  action: string;\n  auditLevel: \"high\" | \"medium\" | \"low\";\n}\n\ninterface UserEvent {\n  type: \"user\";\n  userId: string;\n  action: string;\n}\n\ninterface SystemEvent {\n  type: \"system\";\n  service: string;\n  metric: number;\n}\n\ntype AppEvent = AdminEvent | UserEvent | SystemEvent;\n\nfunction processHighPriorityEvent(event: AdminEvent & { auditLevel: \"high\" }): void {\n  console.log(\"AUDIT: admin \" + event.adminId + \" did \" + event.action);\n}\n\nfunction routeEvent(event: AppEvent): void {\n  if (event.type === \"admin\") {\n    processHighPriorityEvent(event);\n  } else if (event.type === \"user\") {\n    console.log(\"User \" + event.userId + \" did \" + event.action);\n  } else {\n    console.log(\"System \" + event.service + \": \" + event.metric);\n    console.log(\"Triggered by \" + event.userId);\n  }\n}",
  "lineNumber": 27,
  "branch": "feat/event-routing",
  "commitSha": "retry_guards_002",
  "filePath": "src/events/event-router.ts",
  "language": "typescript"
}
JSONEOF
)

FR2_ID=$(send_and_get_id "Mutually dependent type guards" "$PAYLOAD2" "retry_guards_002")
echo ""
wait_and_check "Example 2: Type guards" "$FR2_ID"

echo ""
sleep 2

# ═══════════════════════════════════════════════════════════════════════════════
section "Example 3: Async Result Type Propagation"
# ═══════════════════════════════════════════════════════════════════════════════

info "Attempt 1 often changes repo return type (wrong) — evaluator rejects — attempt 2 adds mapping layer"

PAYLOAD3=$(cat <<'JSONEOF'
{
  "errorMessage": "TS2322: Type 'Promise<Result<User, DatabaseError>>' is not assignable to type 'Promise<Result<User, AppError>>'. Type 'Result<User, DatabaseError>' is not assignable to type 'Result<User, AppError>'. Type 'Failure<DatabaseError>' is not assignable to type 'Failure<AppError>'. Property 'statusCode' is missing in type 'DatabaseError' but required in type 'AppError'.",
  "codeSnippet": "type Result<T, E> = Success<T> | Failure<E>;\ninterface Success<T> { ok: true; value: T; }\ninterface Failure<E> { ok: false; error: E; }\n\ninterface AppError {\n  message: string;\n  statusCode: number;\n  code: string;\n}\n\ninterface DatabaseError {\n  message: string;\n  code: string;\n  query?: string;\n}\n\ninterface User {\n  id: string;\n  email: string;\n}\n\nclass UserRepository {\n  async findByEmail(email: string): Promise<Result<User, DatabaseError>> {\n    try {\n      const user = { id: \"1\", email };\n      return { ok: true, value: user };\n    } catch (err) {\n      return { ok: false, error: { message: String(err), code: \"DB_ERROR\" } };\n    }\n  }\n}\n\nclass UserService {\n  constructor(private repo: UserRepository) {}\n\n  async getUser(email: string): Promise<Result<User, AppError>> {\n    return this.repo.findByEmail(email);\n  }\n}",
  "lineNumber": 35,
  "branch": "feat/result-types",
  "commitSha": "retry_result_003",
  "filePath": "src/users/user.service.ts",
  "language": "typescript"
}
JSONEOF
)

FR3_ID=$(send_and_get_id "Async result type propagation" "$PAYLOAD3" "retry_result_003")
echo ""
wait_and_check "Example 3: Result type propagation" "$FR3_ID"

# ═══════════════════════════════════════════════════════════════════════════════
section "Summary"
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
info "Querying all attempts with rejection reasons..."
psql_query "
  SELECT a.attempt_number,
         j.fix_request_id,
         a.analysis_output->>'isCorrect' AS accepted,
         a.analysis_output->>'rejectionReason' AS rejection,
         a.analysis_output->>'approach' AS approach,
         a.total_tokens
  FROM attempts a
  JOIN jobs j ON a.job_id = j.id
  WHERE j.fix_request_id IN (
    SELECT id FROM fix_requests WHERE commit_sha IN ('retry_generic_001', 'retry_guards_002', 'retry_result_003')
  )
  ORDER BY j.created_at, a.attempt_number
" | while IFS='|' read -r anum frid accepted rejection approach tokens; do
  local label="✓"
  if [ "$accepted" = "false" ]; then
    label="✗"
  fi
  echo -e "  $label attempt=$anum fix_request=$frid"
  echo "    accepted=$accepted approach=${approach:-n/a}"
  [ -n "$rejection" ] && echo "    rejection: $rejection"
  echo "    tokens: $tokens"
done

echo ""
echo -e "${GREEN}Done.${NC} Check worker logs for [evaluate_fix] rejection details."
