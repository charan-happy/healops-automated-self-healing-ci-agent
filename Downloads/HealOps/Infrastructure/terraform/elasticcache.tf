resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-redis-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.app_name}-redis"
  description          = "HealOps BullMQ queue and cache"

  node_type                  = var.redis_node_type
  num_cache_clusters         = 2 # 1 primary + 1 replica
  automatic_failover_enabled = true

  engine_version = "7.1"
  port           = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true # TLS in transit
  auth_token                 = random_password.redis_auth.result

  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = 3
  snapshot_window          = "04:00-05:00"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false # Redis auth token cannot contain @, :, /
}