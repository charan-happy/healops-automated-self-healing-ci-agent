#!/usr/bin/env bash
# ─── Similar Fix Retrieval Test ──────────────────────────────────────────────
# Tests that the AI agent finds and references similar past fixes.
#
# Flow:
#   1. Send a syntax error → first time, no similar fixes exist
#   2. Wait for processing (fix stored in vector_memory with embedding)
#   3. Send a SIMILAR syntax error → should find the previous fix
#   4. Compare the two runs

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ENDPOINT="$BASE_URL/v1/ai/fix-request"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# ═════════════════════════════════════════════════════════════════════════════
section "Step 0: Health Check"
# ═════════════════════════════════════════════════════════════════════════════

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "API is running"
else
  fail "API is not running at $BASE_URL. Start it with: pnpm start:dev"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "Step 1: First Run — Syntax Error (no similar fixes yet)"
# ═════════════════════════════════════════════════════════════════════════════

info "Sending syntax error — missing closing brace (FIRST time)"
RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "SyntaxError: Unexpected end of input, expected closing brace",
    "codeSnippet": "function calculateTotal(items: number[]) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item;\n",
    "lineNumber": 4,
    "branch": "feat/similar-test-1",
    "commitSha": "aaa111bbb222",
    "filePath": "src/utils/calculator.ts",
    "language": "typescript"
  }')

HTTP1=$(echo "$RESPONSE1" | tail -1)
BODY1=$(echo "$RESPONSE1" | sed '$d')
JOB_ID1=$(echo "$BODY1" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ "$HTTP1" = "202" ]; then
  pass "First syntax error queued — Bull Job ID: $JOB_ID1"
else
  fail "Expected 202, got $HTTP1"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "Step 2: Wait for first job to complete"
# ═════════════════════════════════════════════════════════════════════════════

info "Waiting 25s for the first job to process and store in vector_memory..."
for i in $(seq 1 5); do
  sleep 5
  printf "."
done
echo ""

# Check vector_memory via psql
info "Checking if fix was stored in vector_memory..."
VM_COUNT=$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -t -c \
  "SELECT COUNT(*) FROM vector_memory WHERE failure_type = 'syntax_error';" 2>/dev/null | tr -d ' ')

if [ "$VM_COUNT" -gt "0" ] 2>/dev/null; then
  pass "Found $VM_COUNT syntax_error entries in vector_memory"
else
  fail "No syntax_error entries found in vector_memory (count: $VM_COUNT)"
  info "The fix may not have been stored. Checking fix_requests status..."
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c \
    "SELECT id, status, classified_error_type, is_in_scope FROM fix_requests ORDER BY created_at DESC LIMIT 3;" 2>/dev/null
  info "Continuing anyway to see what happens..."
fi

# ═════════════════════════════════════════════════════════════════════════════
section "Step 3: Second Run — Similar Syntax Error (should find past fix)"
# ═════════════════════════════════════════════════════════════════════════════

info "Sending a SIMILAR syntax error — also a missing brace but different code"
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "SyntaxError: Unexpected end of input, expected closing brace }",
    "codeSnippet": "function processOrders(orders: Order[]) {\n  const results = [];\n  for (const order of orders) {\n    results.push(order.total);\n",
    "lineNumber": 4,
    "branch": "feat/similar-test-2",
    "commitSha": "ccc333ddd444",
    "filePath": "src/services/orders.ts",
    "language": "typescript"
  }')

HTTP2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')
JOB_ID2=$(echo "$BODY2" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ "$HTTP2" = "202" ]; then
  pass "Second syntax error queued — Bull Job ID: $JOB_ID2"
else
  fail "Expected 202, got $HTTP2"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "Step 4: Wait for second job and check results"
# ═════════════════════════════════════════════════════════════════════════════

info "Waiting 25s for the second job to process..."
for i in $(seq 1 5); do
  sleep 5
  printf "."
done
echo ""

# ═════════════════════════════════════════════════════════════════════════════
section "Step 5: Compare Results"
# ═════════════════════════════════════════════════════════════════════════════

info "Checking vector_memory entries..."
PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c \
  "SELECT id, failure_type, language, confidence, usage_count,
          LEFT(successful_patch, 80) as patch_preview,
          created_at
   FROM vector_memory
   WHERE failure_type = 'syntax_error'
   ORDER BY created_at DESC
   LIMIT 5;" 2>/dev/null

echo ""
info "Checking fix_requests for both runs..."
PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c \
  "SELECT id,
          LEFT(error_message, 60) as error,
          status,
          classified_error_type,
          is_in_scope,
          branch,
          created_at
   FROM fix_requests
   WHERE branch LIKE 'feat/similar-test%'
   ORDER BY created_at DESC;" 2>/dev/null

echo ""
info "Checking jobs with attempt counts..."
PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c \
  "SELECT j.id, j.status, j.classified_failure_type, j.confidence,
          j.current_retry as attempts, j.total_tokens_used as tokens,
          fr.branch
   FROM jobs j
   JOIN fix_requests fr ON j.fix_request_id = fr.id
   WHERE fr.branch LIKE 'feat/similar-test%'
   ORDER BY j.created_at DESC;" 2>/dev/null

echo ""
info "Checking if usage_count was incremented on similar fixes..."
PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c \
  "SELECT id, failure_type, usage_count, last_used_at
   FROM vector_memory
   WHERE failure_type = 'syntax_error'
   ORDER BY created_at ASC;" 2>/dev/null

# ═════════════════════════════════════════════════════════════════════════════
section "Summary"
# ═════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}What to look for in the WORKER LOGS:${NC}"
echo ""
echo "  First run (feat/similar-test-1):"
echo "    - [SimilarFixService] Found 0 similar fix(es)  ← no past fixes yet"
echo "    - [FixAgentService]   Stored successful fix in vector memory"
echo ""
echo "  Second run (feat/similar-test-2):"
echo "    - [SimilarFixService] Found 1 similar fix(es)  ← found the first fix!"
echo "    - The generate_fix prompt includes 'Similar Past Fixes' context"
echo "    - The AI uses the previous fix as reference for generating the new one"
echo ""
echo -e "${CYAN}To see the full logs, run:${NC}"
echo "  grep -E 'similar-test|SimilarFix|vector memory|similar fix' <worker-log-file>"
echo ""
echo -e "${YELLOW}Key behavior difference:${NC}"
echo "  - Without similar fixes: AI generates fix from scratch"
echo "  - With similar fixes: AI references past successful patches for better accuracy"
echo ""
