# ─────────────────────────────────────────────────────────────────────────────
# HealOps — Terraform Root Configuration
# Provider: AWS | Backend: S3 + DynamoDB
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state — run bootstrap.sh first to create this bucket
  backend "s3" {
    bucket         = "healops-tf-state-492267476800"
    key            = "healops/ec2/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "healops-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "HealOps"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Repository  = "deepanshugoyal10/healops"
    }
  }
}