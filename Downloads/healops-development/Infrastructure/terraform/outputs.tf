# ─────────────────────────────────────────────────────────────────────────────
# Outputs — printed after `terraform apply`
# ─────────────────────────────────────────────────────────────────────────────

output "ec2_public_ip" {
  description = "Static public IP of the EC2 instance"
  value       = aws_eip.healops.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.healops.id
}

output "ec2_public_dns" {
  description = "Public DNS of the EC2 instance"
  value       = aws_eip.healops.public_dns
}

output "ssh_command" {
  description = "SSH command to connect to EC2"
  value       = "ssh -i healops-ec2.pem ubuntu@${aws_eip.healops.public_ip}"
}

output "app_urls" {
  description = "HealOps application URLs"
  value = {
    api        = "http://${aws_eip.healops.public_ip}:4000"
    health     = "http://${aws_eip.healops.public_ip}:4000/health"
    swagger    = "http://${aws_eip.healops.public_ip}:4000/api/v1"
    frontend   = "http://${aws_eip.healops.public_ip}:3000"
    grafana    = "http://${aws_eip.healops.public_ip}:3001"
    prometheus = "http://${aws_eip.healops.public_ip}:9090"
    jaeger     = "http://${aws_eip.healops.public_ip}:16686"
    bullboard  = "http://${aws_eip.healops.public_ip}:4000/admin/queues"
  }
}

output "s3_media_bucket" {
  description = "S3 media bucket name"
  value       = var.create_media_bucket ? aws_s3_bucket.media[0].id : "not created"
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "ami_used" {
  description = "Ubuntu AMI ID used for EC2"
  value       = data.aws_ami.ubuntu.id
}

output "github_secrets_to_add" {
  description = "Add these to GitHub → Settings → Secrets → Actions"
  value = {
    EC2_HOST     = aws_eip.healops.public_ip
    EC2_SSH_KEY  = "Contents of healops-ec2.pem (generated in Infrastructure/terraform/)"
    DATABASE_URL = "postgresql://${var.rds_username}:${var.postgres_password}@${aws_db_instance.healops.address}:5432/${var.rds_db_name}?sslmode=require"
  }
  sensitive = true
}

output "database_url" {
  description = "PostgreSQL connection URL for app and GitHub secret"
  value       = "postgresql://${var.rds_username}:${var.postgres_password}@${aws_db_instance.healops.address}:${aws_db_instance.healops.port}/${var.rds_db_name}?sslmode=require"
  sensitive   = true
}

output "redis_url" {
  description = "Redis connection URL for app and GitHub secret"
  value       = "redis://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  sensitive   = true
}

output "infrastructure_summary" {
  description = "Summary of key infrastructure endpoints and IDs"
  value = {
    app_urls        = {
      api        = "http://${aws_eip.healops.public_ip}:4000"
      health     = "http://${aws_eip.healops.public_ip}:4000/health"
      swagger    = "http://${aws_eip.healops.public_ip}:4000/api/v1"
      frontend   = "http://${aws_eip.healops.public_ip}:3000"
      grafana    = "http://${aws_eip.healops.public_ip}:3001"
      prometheus = "http://${aws_eip.healops.public_ip}:9090"
      jaeger     = "http://${aws_eip.healops.public_ip}:16686"
      bullboard  = "http://${aws_eip.healops.public_ip}:4000/admin/queues"
    }
    ec2_instance_id = aws_instance.healops.id
    ec2_public_ip   = aws_eip.healops.public_ip
    ec2_public_dns  = aws_eip.healops.public_dns
    vpc_id          = aws_vpc.main.id
    s3_media_bucket = var.create_media_bucket ? aws_s3_bucket.media[0].id : "not created"
  }
}
