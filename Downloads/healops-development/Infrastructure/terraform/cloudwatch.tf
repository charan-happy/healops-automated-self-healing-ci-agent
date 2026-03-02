# ─────────────────────────────────────────────────────────────────────────────
# CloudWatch Log Groups
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "redis" {
  name              = "/aws/elasticache/${var.app_name}-redis"
  retention_in_days = 7

  tags = {
    Name        = "${var.app_name}-redis-logs"
    Environment = var.environment
  }
}
