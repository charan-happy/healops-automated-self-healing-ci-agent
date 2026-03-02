# ─────────────────────────────────────────────────────────────────────────────
# Input Variables
# Set actual values in terraform.tfvars (never commit that file)
# ─────────────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Must be staging or production."
  }
}

variable "app_name" {
  description = "Application name prefix for all resources"
  type        = string
  default     = "healops"
}

# ── EC2 ───────────────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.large"
}

variable "ec2_volume_size_gb" {
  description = "EBS root volume size in GB"
  type        = number
  default     = 30
}

variable "ec2_volume_type" {
  description = "EBS volume type"
  type        = string
  default     = "gp3"
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH into EC2. Set to your IP: x.x.x.x/32"
  type        = string
  # Default allows all — CHANGE THIS to your IP in tfvars
  default = "0.0.0.0/0"
}

# ── SSH Key ───────────────────────────────────────────────────────────────────

variable "create_ssh_key" {
  description = "Set true to generate a new SSH key pair via Terraform"
  type        = bool
  default     = true
}

variable "existing_key_pair_name" {
  description = "Name of existing AWS key pair to use (only if create_ssh_key = false)"
  type        = string
  default     = ""
}

# ── S3 ────────────────────────────────────────────────────────────────────────

variable "create_media_bucket" {
  description = "Create S3 bucket for media uploads"
  type        = bool
  default     = true
}

# ── Redis ElastiCache ─────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

# ── Network ───────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR"
  type        = string
  default     = "10.0.1.0/24"
}

variable "private_subnet_a_cidr" {
  description = "Private subnet A CIDR"
  type        = string
  default     = "10.0.10.0/24"
}

variable "private_subnet_b_cidr" {
  description = "Private subnet B CIDR"
  type        = string
  default     = "10.0.11.0/24"
}

# ── App Config (written to .env on EC2) ───────────────────────────────────────

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Deprecated — ElastiCache auth token is auto-generated. Kept for tfvars compatibility."
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret" {
  description = "JWT secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
}

variable "github_app_private_key" {
  description = "GitHub App private key (PEM format)"
  type        = string
  sensitive   = true
}

variable "github_webhook_secret" {
  description = "GitHub webhook HMAC secret"
  type        = string
  sensitive   = true
}

variable "openrouter_api_key" {
  description = "OpenRouter API key for Claude"
  type        = string
  sensitive   = true
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "healops_webhook_api_key" {
  description = "Internal HealOps webhook API key"
  type        = string
  sensitive   = true
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
  default     = "admin"
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_db_name" {
  description = "Initial database name"
  type        = string
  default     = "healops"
}

variable "rds_username" {
  description = "RDS master username"
  type        = string
  default     = "healops"
}

variable "rds_allocated_storage" {
  description = "Initial storage in GB"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Max storage for autoscaling in GB"
  type        = number
  default     = 100
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for high availability"
  type        = bool
  default     = false
}

variable "rds_deletion_protection" {
  description = "Prevent accidental RDS deletion"
  type        = bool
  default     = true
}

variable "rds_skip_final_snapshot" {
  description = "Skip final snapshot on destroy"
  type        = bool
  default     = false
}

