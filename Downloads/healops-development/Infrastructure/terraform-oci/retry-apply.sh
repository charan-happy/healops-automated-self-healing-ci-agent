#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# OCI Free Tier — Retry terraform apply until capacity is available
# The "Out of host capacity" error is common for A1.Flex ARM instances.
# This script retries every 60 seconds until it succeeds.
#
# Usage: ./retry-apply.sh
# Stop:  Ctrl+C
# ─────────────────────────────────────────────────────────────────────────────

INTERVAL=60  # seconds between retries
MAX_ATTEMPTS=120  # max retries (120 × 60s = 2 hours)
ATTEMPT=0

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  OCI A1.Flex Capacity Retry — terraform apply               ║"
echo "║  Retrying every ${INTERVAL}s (max ${MAX_ATTEMPTS} attempts)                    ║"
echo "║  Press Ctrl+C to stop                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "──────────────────────────────────────────"
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS — $TIMESTAMP"
  echo "──────────────────────────────────────────"

  terraform apply -auto-approve 2>&1 | tee /tmp/tf-apply-output.txt

  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo ""
    echo "════════════════════════════════════════════"
    echo "  SUCCESS! Instance created on attempt $ATTEMPT"
    echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "════════════════════════════════════════════"
    exit 0
  fi

  # Check if it's actually a capacity error (not some other failure)
  if ! grep -q "Out of host capacity" /tmp/tf-apply-output.txt; then
    echo ""
    echo "ERROR: Failed with a non-capacity error. Stopping retries."
    echo "Check the output above for details."
    exit 1
  fi

  echo ""
  echo "⏳ Out of host capacity. Retrying in ${INTERVAL}s..."
  echo ""
  sleep $INTERVAL
done

echo "Exhausted $MAX_ATTEMPTS attempts. Try again later or switch regions."
exit 1
