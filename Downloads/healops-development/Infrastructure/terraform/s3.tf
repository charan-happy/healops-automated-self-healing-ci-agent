# ─────────────────────────────────────────────────────────────────────────────
# S3 Bucket for media uploads
# (HealOps uses @aws-sdk/client-s3 — bucket is needed)
# ─────────────────────────────────────────────────────────────────────────────

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = "${var.app_name}-media-${random_id.bucket_suffix.hex}"

  tags = { Name = "${var.app_name}-media" }
}

resource "aws_s3_bucket_versioning" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  versioning_configuration {
    status = "Suspended" # Enable if you need file version history
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CORS for frontend uploads
resource "aws_s3_bucket_cors_configuration" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"] # Restrict to your domain in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Lifecycle: delete incomplete multipart uploads after 7 days
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count  = var.create_media_bucket ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}