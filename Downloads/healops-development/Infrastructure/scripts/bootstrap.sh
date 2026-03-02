#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run this ONCE on your local machine before any terraform commands.
# Creates the S3 bucket and DynamoDB table for Terraform remote state.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${1:-ap-south-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="healops-tf-state-${ACCOUNT_ID}"
TABLE="healops-tf-locks"

echo "══════════════════════════════════════════════════"
echo " HealOps Terraform Bootstrap"
echo " Account : ${ACCOUNT_ID}"
echo " Region  : ${REGION}"
echo " Bucket  : ${BUCKET}"
echo " Table   : ${TABLE}"
echo "══════════════════════════════════════════════════"

# ── S3 Bucket for Terraform state ─────────────────────────────────────────────
echo ""
echo "▶ Creating S3 state bucket..."
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "  ✓ Bucket already exists"
else
  # ap-south-1 needs LocationConstraint
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi
  echo "  ✓ Bucket created"
fi

# Enable versioning (allows state recovery)
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled
echo "  ✓ Versioning enabled"

# Block all public access
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  ✓ Public access blocked"

# Enable AES-256 encryption
aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules":[{
      "ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}
    }]
  }'
echo "  ✓ Encryption enabled"

# ── DynamoDB Table for state locking ──────────────────────────────────────────
echo ""
echo "▶ Creating DynamoDB lock table..."
if aws dynamodb describe-table --table-name "${TABLE}" \
     --region "${REGION}" 2>/dev/null; then
  echo "  ✓ Table already exists"
else
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"
  echo "  ✓ Table created"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo " ✅ Bootstrap complete!"
echo ""
echo " Update Infrastructure/terraform/main.tf backend block:"
echo "   bucket = \"${BUCKET}\""
echo "   region = \"${REGION}\""
echo "══════════════════════════════════════════════════"
