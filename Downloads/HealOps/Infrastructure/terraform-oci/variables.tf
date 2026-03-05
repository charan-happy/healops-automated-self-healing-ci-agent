# ─────────────────────────────────────────────────────────────────────────────
# Input Variables — Oracle Cloud Infrastructure
# Set actual values in terraform.tfvars (never commit that file)
# ─────────────────────────────────────────────────────────────────────────────

# ── OCI Authentication ──────────────────────────────────────────────────────
# Get these from: OCI Console → Profile → API Keys
# Guide: https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm

variable "tenancy_ocid" {
  description = "OCI tenancy OCID (found in: OCI Console → Profile → Tenancy)"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID (found in: OCI Console → Profile → User Settings)"
  type        = string
}

variable "fingerprint" {
  description = "API key fingerprint (generated when you upload public key)"
  type        = string
}

variable "private_key_path" {
  description = "Path to OCI API private key PEM file"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "OCI region (pick closest to you)"
  type        = string
  default     = "ap-mumbai-1" # Mumbai, India
  # Other options:
  # ap-hyderabad-1   (Hyderabad)
  # us-ashburn-1     (US East)
  # us-phoenix-1     (US West)
  # eu-frankfurt-1   (Germany)
  # uk-london-1      (UK)
}

variable "compartment_ocid" {
  description = "OCI compartment OCID (use tenancy OCID for root compartment)"
  type        = string
}

# ── General ──────────────────────────────────────────────────────────────────

variable "app_name" {
  description = "Application name prefix for all resources"
  type        = string
  default     = "healops"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# ── Compute ─────────────────────────────────────────────────────────────────

variable "instance_shape" {
  description = "Compute instance shape (A1.Flex = ARM Free Tier)"
  type        = string
  default     = "VM.Standard.A1.Flex" # ARM — Always Free
  # Alternative: "VM.Standard.E2.1.Micro" (AMD — Always Free, but only 1GB RAM)
}

variable "instance_ocpus" {
  description = "Number of OCPUs (max 4 free for A1.Flex across all instances)"
  type        = number
  default     = 4
}

variable "instance_memory_gb" {
  description = "Memory in GB (max 24 free for A1.Flex across all instances)"
  type        = number
  default     = 24
}

variable "boot_volume_size_gb" {
  description = "Boot volume size in GB (up to 200GB free across all boot volumes)"
  type        = number
  default     = 100 # Generous — still within 200GB free limit
}

# ── SSH ──────────────────────────────────────────────────────────────────────

variable "create_ssh_key" {
  description = "Generate SSH key pair via Terraform"
  type        = bool
  default     = true
}

variable "ssh_public_key" {
  description = "Public SSH key (only if create_ssh_key = false)"
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed for SSH access (set to your IP: x.x.x.x/32)"
  type        = string
  default     = "0.0.0.0/0"
}

# ── Network ──────────────────────────────────────────────────────────────────

variable "vcn_cidr" {
  description = "VCN CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR"
  type        = string
  default     = "10.0.1.0/24"
}

# ── App Config (written to .env on instance) ────────────────────────────────

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
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
  description = "OpenRouter API key for LLM"
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

variable "domain_name" {
  description = "Domain name (for CORS, URLs in .env)"
  type        = string
  default     = "healops.online"
}
