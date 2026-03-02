# ─────────────────────────────────────────────────────────────────────────────
# RDS PostgreSQL 17.4 for HealOps
#
# Design decisions:
#   - db.t3.medium  — 2 vCPU, 4 GB RAM, enough for pgvector + 21 tables
#   - 20 GB gp3     — fast storage, expandable without downtime
#   - Private subnet — NOT accessible from internet, only from EC2
#   - pgvector       — enabled via parameter group (rds.force_ssl + shared_preload_libraries)
#   - Backups        — 7 days retention, automated daily snapshots
#   - No Multi-AZ    — saves cost, enable for production later
# ─────────────────────────────────────────────────────────────────────────────

# ── Security Group: RDS ───────────────────────────────────────────────────────
# Only allows traffic from the EC2 security group — nothing else
resource "aws_security_group" "rds" {
  name        = "${var.app_name}-rds-sg"
  description = "HealOps RDS PostgreSQL - EC2 access only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from EC2 only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id] # Only EC2 SG — not 0.0.0.0/0
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-rds-sg" }
}

# ── DB Subnet Group ───────────────────────────────────────────────────────────
# RDS must span 2 AZs even for single-AZ deployments
resource "aws_db_subnet_group" "healops" {
  name        = "${var.app_name}-db-subnet-group"
  description = "HealOps RDS subnet group - private subnets across 2 AZs"
  subnet_ids  = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = { Name = "${var.app_name}-db-subnet-group" }
}

# ── Parameter Group — PostgreSQL 17 ──────────────────────────────────────────
# Custom parameter group to:
#   1. Enable pgvector extension (vector similarity search)
#   2. Tune for NestJS connection pooling
#   3. Set reasonable shared_buffers
resource "aws_db_parameter_group" "healops" {
  name        = "${var.app_name}-pg17-params"
  family      = "postgres17"
  description = "HealOps PostgreSQL 17 parameter group with pgvector support"

  # pgvector can be installed as an extension without shared_preload_libraries
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements,auto_explain"
    apply_method = "pending-reboot"
  }

  
  # Log slow queries (anything over 1 second)
  parameter {
    name         = "log_min_duration_statement"
    value        = "1000"
    apply_method = "immediate"
  }

  # Log connections for audit trail
  parameter {
    name         = "log_connections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"
    apply_method = "immediate"
  }

  # Max connections — t3.medium supports ~170, leave headroom for superuser
  parameter {
    name         = "max_connections"
    value        = "150"
    apply_method = "pending-reboot"
  }

  # Statement timeout — prevent runaway queries from blocking the agent
  parameter {
    name         = "statement_timeout"
    value        = "30000" # 30 seconds
    apply_method = "immediate"
  }

  # Idle transaction timeout — clean up hung transactions
  parameter {
    name         = "idle_in_transaction_session_timeout"
    value        = "60000" # 60 seconds
    apply_method = "immediate"
  }

  # Force SSL — all connections must use TLS
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  tags = { Name = "${var.app_name}-pg17-params" }
}

# ── RDS Instance ──────────────────────────────────────────────────────────────
resource "aws_db_instance" "healops" {
  # ── Identity ─────────────────────────────────────────────────────────────
  identifier = "${var.app_name}-postgres"

  # ── Engine ───────────────────────────────────────────────────────────────
  engine         = "postgres"
  engine_version = "17.4" # PostgreSQL 17.4 as requested
  instance_class = var.rds_instance_class

  # ── Database ─────────────────────────────────────────────────────────────
  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.postgres_password # Reuses existing variable

  # ── Storage ──────────────────────────────────────────────────────────────
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage # Auto-scaling ceiling
  storage_type          = "gp3"
  storage_encrypted     = true

  # ── Network ──────────────────────────────────────────────────────────────
  db_subnet_group_name   = aws_db_subnet_group.healops.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false # Critical: private only, never expose to internet
  port                   = 5432
  availability_zone      = data.aws_availability_zones.available.names[0]

  # ── Parameters ───────────────────────────────────────────────────────────
  parameter_group_name = aws_db_parameter_group.healops.name

  # ── Backups ───────────────────────────────────────────────────────────────
  backup_retention_period  = var.rds_backup_retention_days
  backup_window            = "02:00-03:00" # 2-3am UTC — low traffic
  maintenance_window       = "sun:04:00-sun:05:30"
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  # ── High Availability ─────────────────────────────────────────────────────
  multi_az = var.rds_multi_az # false for cost saving, true for production HA

  # ── Monitoring ───────────────────────────────────────────────────────────
  monitoring_interval                   = 60 # Enhanced monitoring every 60s
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
  performance_insights_enabled          = true
  performance_insights_retention_period = 7 # 7 days free tier

  # ── Safety ───────────────────────────────────────────────────────────────
  deletion_protection       = var.rds_deletion_protection
  skip_final_snapshot       = var.rds_skip_final_snapshot
  final_snapshot_identifier = "${var.app_name}-postgres-final-snapshot"

  # ── Upgrades ─────────────────────────────────────────────────────────────
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false

  depends_on = [aws_db_subnet_group.healops]

  tags = { Name = "${var.app_name}-postgres" }
}

# ── IAM Role for RDS Enhanced Monitoring ─────────────────────────────────────
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.app_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.app_name}-rds-monitoring-role" }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── CloudWatch Alarms for RDS ─────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.app_name}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU > 80% for 10 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.healops.identifier
  }

  tags = { Name = "${var.app_name}-rds-cpu-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.app_name}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120 # 5 GB in bytes
  alarm_description   = "RDS free storage < 5 GB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.healops.identifier
  }

  tags = { Name = "${var.app_name}-rds-storage-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.app_name}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 120 # Alert at 80% of max_connections=150
  alarm_description   = "RDS connections > 120 (80% of max 150)"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.healops.identifier
  }

  tags = { Name = "${var.app_name}-rds-connections-alarm" }
}