# ─────────────────────────────────────────────────────────────────────────────
# HealOps — Terraform Root Configuration (Oracle Cloud Free Tier)
# Provider: OCI | Backend: Local (or S3-compatible OCI Object Storage)
#
# Oracle Cloud Free Tier includes:
#   - 4 OCPU + 24 GB RAM ARM (Ampere A1.Flex) — ALWAYS FREE
#   - 2 AMD Micro instances (1/8 OCPU, 1 GB RAM each) — ALWAYS FREE
#   - 200 GB block volume — ALWAYS FREE
#   - 10 TB/month outbound data — ALWAYS FREE
#   - 2 Oracle Autonomous Databases — ALWAYS FREE
#   - Load Balancer (10 Mbps) — ALWAYS FREE
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Local backend — for a single developer this is fine
  # For team use, switch to OCI Object Storage backend
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}
