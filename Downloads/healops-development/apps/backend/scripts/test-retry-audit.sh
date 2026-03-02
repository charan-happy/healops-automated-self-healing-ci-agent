#!/usr/bin/env bash
# ─── Retry Flow & Audit Logging Test ────────────────────────────────────────
# Tests the redesigned AI fix retry flow with:
#   1. Vector memory re-search on retry (not just generate_fix)
#   2. Exclusion of previously-used similar fixes
#   3. Rich audit logging at every step (agent.search_similar, agent.generate_fix,
#      agent.evaluate_fix, agent.attempt_persisted, agent.vector_memory_stored)
#   4. Enriched attempt records with searchResults, approach, reasoning, etc.
#
# Prerequisites:
#   - PostgreSQL running (port 5433)
#   - Redis running
#   - API + Worker running (pnpm start:dev)
#   - DB migrations applied (pnpm db:migrate)
#
# Usage:
#   bash scripts/test-retry-audit.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ENDPOINT="$BASE_URL/v1/ai/fix-request"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
PGPASS="${PGPASSWORD:-postgres}"
PGDB="${PGDB:-postgres}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass()    { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail()    { echo -e "${RED}✗ FAIL${NC}: $1"; }
info()    { echo -e "${CYAN}→${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

run_sql() {
  PGPASSWORD="$PGPASS" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDB" -t -A "$@" 2>/dev/null
}

run_sql_pretty() {
  PGPASSWORD="$PGPASS" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDB" "$@" 2>/dev/null
}

wait_with_dots() {
  local total=$1
  local interval=5
  local steps=$((total / interval))
  for i in $(seq 1 "$steps"); do
    sleep "$interval"
    printf "."
  done
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
header "AI Fix Retry Flow & Audit Logging Test"
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Step 0: Health Check ─────────────────────────────────────────────────────
section "Step 0: Health Check"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "API is running at $BASE_URL"
else
  fail "API is not running at $BASE_URL (got HTTP $HTTP_STATUS)"
  echo -e "  Start it with: ${CYAN}pnpm start:dev${NC}"
  exit 1
fi

# Check DB connectivity
DB_OK=$(run_sql -c "SELECT 1;" 2>/dev/null || echo "0")
if [ "$DB_OK" = "1" ]; then
  pass "Database connection OK"
else
  fail "Cannot connect to PostgreSQL at $PGHOST:$PGPORT"
  exit 1
fi

# ─── Step 1: Clean up previous test data ──────────────────────────────────────
section "Step 1: Clean up previous test data"

info "Removing previous retry-test data..."
run_sql -c "
  DELETE FROM healops_audit_logs WHERE entity_id IN (
    SELECT id FROM fix_requests WHERE branch LIKE 'feat/retry-test%'
  );
  DELETE FROM patches WHERE attempt_id IN (
    SELECT a.id FROM attempts a
    JOIN jobs j ON a.job_id = j.id
    JOIN fix_requests fr ON j.fix_request_id = fr.id
    WHERE fr.branch LIKE 'feat/retry-test%'
  );
  DELETE FROM attempts WHERE job_id IN (
    SELECT j.id FROM jobs j
    JOIN fix_requests fr ON j.fix_request_id = fr.id
    WHERE fr.branch LIKE 'feat/retry-test%'
  );
  DELETE FROM jobs WHERE fix_request_id IN (
    SELECT id FROM fix_requests WHERE branch LIKE 'feat/retry-test%'
  );
  DELETE FROM fix_requests WHERE branch LIKE 'feat/retry-test%';
  DELETE FROM vector_memory WHERE failure_type = 'syntax_error'
    AND context_hash LIKE '%retry-test%';
" > /dev/null 2>&1 || true
pass "Cleaned up previous test data"

# ─── Step 2: Send first fix request ──────────────────────────────────────────
section "Step 2: Send first fix request (syntax error)"

info "Sending syntax error — missing closing brace"
RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "SyntaxError: Unexpected end of input, expected closing brace",
    "codeSnippet": "function calculateTotal(items: number[]) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item;\n",
    "lineNumber": 4,
    "branch": "feat/retry-test-1",
    "commitSha": "retry111aaa",
    "filePath": "src/utils/calculator.ts",
    "language": "typescript"
  }')

HTTP1=$(echo "$RESPONSE1" | tail -1)
BODY1=$(echo "$RESPONSE1" | sed '$d')
JOB_ID1=$(echo "$BODY1" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ "$HTTP1" = "202" ]; then
  pass "Fix request queued — Bull Job ID: $JOB_ID1"
else
  fail "Expected HTTP 202, got $HTTP1"
  echo "Response: $BODY1"
  exit 1
fi

# ─── Step 3: Wait for processing ─────────────────────────────────────────────
section "Step 3: Wait for first job to complete"

info "Waiting 25s for job to process..."
wait_with_dots 25

# ─── Step 4: Verify audit logs ───────────────────────────────────────────────
section "Step 4: Verify audit logs for first request"

FIX_REQ_ID=$(run_sql -c "
  SELECT id FROM fix_requests
  WHERE branch = 'feat/retry-test-1'
  ORDER BY created_at DESC LIMIT 1;
")

if [ -z "$FIX_REQ_ID" ]; then
  fail "No fix_request found for branch feat/retry-test-1"
  exit 1
fi
info "Fix request ID: $FIX_REQ_ID"

# Check for agent.* audit logs
info "Checking for agent audit log entries..."
AUDIT_ACTIONS=$(run_sql -c "
  SELECT action FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID'
  ORDER BY created_at ASC;
")

echo -e "\n${BOLD}Audit log actions:${NC}"
echo "$AUDIT_ACTIONS" | while IFS= read -r line; do
  [ -n "$line" ] && echo "  - $line"
done

# Check for specific agent.* entries
for ACTION in "agent.search_similar" "agent.generate_fix" "agent.evaluate_fix"; do
  COUNT=$(run_sql -c "
    SELECT COUNT(*) FROM healops_audit_logs
    WHERE entity_id = '$FIX_REQ_ID' AND action = '$ACTION';
  ")
  if [ "$COUNT" -gt "0" ] 2>/dev/null; then
    pass "Found $COUNT $ACTION audit log(s)"
  else
    fail "Missing $ACTION audit log"
  fi
done

# Check for agent.attempt_persisted
ATTEMPT_LOGS=$(run_sql -c "
  SELECT COUNT(*) FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID' AND action = 'agent.attempt_persisted';
")
if [ "$ATTEMPT_LOGS" -gt "0" ] 2>/dev/null; then
  pass "Found $ATTEMPT_LOGS agent.attempt_persisted log(s)"
else
  fail "Missing agent.attempt_persisted logs"
fi

# ─── Step 5: Verify enriched audit metadata ──────────────────────────────────
section "Step 5: Verify enriched audit metadata"

info "Checking agent.search_similar metadata..."
run_sql_pretty -c "
  SELECT action,
         metadata->>'usableCount' as usable,
         metadata->>'excludedCount' as excluded,
         metadata->>'totalRetrieved' as total_retrieved,
         metadata->>'topSimilarity' as top_similarity
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID' AND action = 'agent.search_similar'
  ORDER BY created_at ASC;
"

info "Checking agent.generate_fix metadata (approach & reasoning)..."
run_sql_pretty -c "
  SELECT action,
         metadata->>'attemptNumber' as attempt,
         metadata->>'approach' as approach,
         metadata->>'reasoning' as reasoning,
         metadata->>'confidence' as confidence
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID' AND action = 'agent.generate_fix'
  ORDER BY created_at ASC;
"

info "Checking agent.evaluate_fix metadata..."
run_sql_pretty -c "
  SELECT action,
         metadata->>'attemptNumber' as attempt,
         metadata->>'accepted' as accepted,
         metadata->>'approach' as approach,
         LEFT(metadata->>'rejectionReason', 100) as rejection_reason
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID' AND action = 'agent.evaluate_fix'
  ORDER BY created_at ASC;
"

# ─── Step 6: Verify enriched attempt records ─────────────────────────────────
section "Step 6: Verify enriched attempt records"

info "Checking attempts with new fields..."
run_sql_pretty -c "
  SELECT a.attempt_number,
         a.analysis_output::jsonb->>'approach' as approach,
         LEFT(a.analysis_output::jsonb->>'reasoning', 100) as reasoning,
         LEFT(a.analysis_output::jsonb->>'rejectionReason', 80) as rejection_reason,
         jsonb_array_length(COALESCE(a.analysis_output::jsonb->'searchResults', '[]'::jsonb)) as search_results_count,
         jsonb_array_length(COALESCE(a.analysis_output::jsonb->'usedSimilarFixIds', '[]'::jsonb)) as used_similar_count,
         jsonb_array_length(COALESCE(a.analysis_output::jsonb->'discardedSimilarFixIds', '[]'::jsonb)) as discarded_count
  FROM attempts a
  JOIN jobs j ON a.job_id = j.id
  JOIN fix_requests fr ON j.fix_request_id = fr.id
  WHERE fr.branch = 'feat/retry-test-1'
  ORDER BY a.attempt_number ASC;
"

# ─── Step 7: Check vector memory storage ─────────────────────────────────────
section "Step 7: Check vector memory storage"

FIX_STATUS=$(run_sql -c "
  SELECT status FROM fix_requests
  WHERE id = '$FIX_REQ_ID';
")
info "Fix request status: $FIX_STATUS"

if [ "$FIX_STATUS" = "completed" ]; then
  VM_STORED=$(run_sql -c "
    SELECT COUNT(*) FROM healops_audit_logs
    WHERE entity_id = '$FIX_REQ_ID' AND action = 'agent.vector_memory_stored';
  ")
  if [ "$VM_STORED" -gt "0" ] 2>/dev/null; then
    pass "agent.vector_memory_stored audit log present"
  else
    fail "Missing agent.vector_memory_stored audit log"
  fi

  VM_COUNT=$(run_sql -c "
    SELECT COUNT(*) FROM vector_memory WHERE failure_type = 'syntax_error';
  ")
  info "Total syntax_error entries in vector_memory: $VM_COUNT"
fi

# ─── Step 8: Send similar request (test exclusion on retry) ──────────────────
section "Step 8: Send similar fix request (tests exclusion behavior)"

info "Sending similar syntax error — different code, same error type"
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "SyntaxError: Unexpected end of input, expected closing brace }",
    "codeSnippet": "function processOrders(orders: Order[]) {\n  const results = [];\n  for (const order of orders) {\n    results.push(order.total);\n",
    "lineNumber": 4,
    "branch": "feat/retry-test-2",
    "commitSha": "retry222bbb",
    "filePath": "src/services/orders.ts",
    "language": "typescript"
  }')

HTTP2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')
JOB_ID2=$(echo "$BODY2" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ "$HTTP2" = "202" ]; then
  pass "Second fix request queued — Bull Job ID: $JOB_ID2"
else
  fail "Expected HTTP 202, got $HTTP2"
  echo "Response: $BODY2"
  exit 1
fi

info "Waiting 25s for second job to process..."
wait_with_dots 25

# ─── Step 9: Verify second request found similar fixes ───────────────────────
section "Step 9: Verify second request found similar fixes"

FIX_REQ_ID2=$(run_sql -c "
  SELECT id FROM fix_requests
  WHERE branch = 'feat/retry-test-2'
  ORDER BY created_at DESC LIMIT 1;
")

if [ -z "$FIX_REQ_ID2" ]; then
  fail "No fix_request found for branch feat/retry-test-2"
  exit 1
fi

info "Checking agent.search_similar for second request..."
run_sql_pretty -c "
  SELECT action,
         metadata->>'attemptNumber' as attempt,
         metadata->>'usableCount' as usable,
         metadata->>'excludedCount' as excluded,
         metadata->>'topSimilarity' as top_similarity
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID2' AND action = 'agent.search_similar'
  ORDER BY created_at ASC;
"

USABLE_COUNT=$(run_sql -c "
  SELECT metadata->>'usableCount'
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID2' AND action = 'agent.search_similar'
  ORDER BY created_at ASC LIMIT 1;
")

if [ "$USABLE_COUNT" -gt "0" ] 2>/dev/null; then
  pass "Second request found $USABLE_COUNT usable similar fix(es) from vector memory"
else
  info "No similar fixes found (vector memory may not have been populated from first request)"
fi

# Check if second request has multiple search_similar entries (indicating retries)
SEARCH_COUNT=$(run_sql -c "
  SELECT COUNT(*) FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID2' AND action = 'agent.search_similar';
")
info "Number of search_similar calls for second request: $SEARCH_COUNT"
if [ "$SEARCH_COUNT" -gt "1" ] 2>/dev/null; then
  pass "Multiple search_similar calls detected — retry re-search is working!"

  # Check if later searches have exclusions
  EXCLUDED_LATER=$(run_sql -c "
    SELECT metadata->>'excludedCount'
    FROM healops_audit_logs
    WHERE entity_id = '$FIX_REQ_ID2' AND action = 'agent.search_similar'
    ORDER BY created_at DESC LIMIT 1;
  ")
  if [ "$EXCLUDED_LATER" -gt "0" ] 2>/dev/null; then
    pass "Later retry search excluded $EXCLUDED_LATER previously-used fix(es)"
  fi
else
  info "Only 1 search_similar call (fix accepted on first attempt, no retry needed)"
fi

# ─── Step 10: Check usage_count increment ────────────────────────────────────
section "Step 10: Check usage_count on vector memory entries"

run_sql_pretty -c "
  SELECT id,
         failure_type,
         usage_count,
         last_used_at,
         confidence,
         created_at
  FROM vector_memory
  WHERE failure_type = 'syntax_error'
  ORDER BY created_at ASC;
"

# ═══════════════════════════════════════════════════════════════════════════════
header "Summary"
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}Full audit trail for first request:${NC}"
run_sql_pretty -c "
  SELECT action,
         LEFT(metadata::text, 120) as metadata_preview,
         created_at
  FROM healops_audit_logs
  WHERE entity_id = '$FIX_REQ_ID'
  ORDER BY created_at ASC;
"

echo ""
echo -e "${BOLD}Fix request statuses:${NC}"
run_sql_pretty -c "
  SELECT id,
         branch,
         status,
         classified_error_type,
         is_in_scope,
         created_at
  FROM fix_requests
  WHERE branch LIKE 'feat/retry-test%'
  ORDER BY created_at ASC;
"

echo ""
echo -e "${CYAN}What was tested:${NC}"
echo "  1. Audit logs: agent.search_similar, agent.generate_fix, agent.evaluate_fix"
echo "  2. Audit metadata: approach, reasoning, exclusion counts, confidence"
echo "  3. Enriched attempts: searchResults, usedSimilarFixIds, discardedSimilarFixIds"
echo "  4. Vector memory: similar fix retrieval on second request"
echo "  5. Retry re-search: if retries occurred, search_similar was called again"
echo "  6. Exclusion: later searches excluded previously-used fix IDs"
echo ""
echo -e "${CYAN}Worker logs to verify (grep the worker output):${NC}"
echo "  grep -E 'retry-test|SimilarFix|usable|excluded|vector memory' <worker-log>"
echo ""
