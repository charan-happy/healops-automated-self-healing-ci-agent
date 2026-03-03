# ─────────────────────────────────────────────────────────────────────────────
# Compute Instance (= AWS EC2)
# Using ARM A1.Flex — 4 OCPU + 24 GB RAM — ALWAYS FREE
#
# NOTE: ARM (aarch64) means you MUST use ARM-compatible Docker images.
# Official images (postgres, redis, node, nginx) all support ARM.
# ─────────────────────────────────────────────────────────────────────────────

# ── Latest Oracle Linux 8 ARM image (or Ubuntu) ────────────────────────────
# Using Oracle Linux for better OCI integration and iptables compatibility
data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"

  filter {
    name   = "display_name"
    values = ["\\w*aarch64\\w*"]
    regex  = true
  }
}

# ── SSH Key Pair ────────────────────────────────────────────────────────────
resource "tls_private_key" "healops" {
  count     = var.create_ssh_key ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Save private key locally
resource "local_file" "private_key" {
  count           = var.create_ssh_key ? 1 : 0
  content         = tls_private_key.healops[0].private_key_pem
  filename        = "${path.module}/../../healops-oci.pem"
  file_permission = "0600"
}

# ── Compute Instance (A1.Flex ARM — Free Tier) ─────────────────────────────
resource "oci_core_instance" "healops" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "${var.app_name}-server"
  shape               = var.instance_shape

  # ARM Flex shape — configure OCPU + Memory
  shape_config {
    ocpus         = var.instance_ocpus  # 4 OCPU free
    memory_in_gbs = var.instance_memory_gb # 24 GB free
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "${var.app_name}-vnic"
    hostname_label   = var.app_name
  }

  metadata = {
    ssh_authorized_keys = var.create_ssh_key ? tls_private_key.healops[0].public_key_openssh : var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/../scripts-oci/cloud-init.sh", {
      app_name                = var.app_name
      postgres_password       = var.postgres_password
      redis_password          = var.redis_password
      jwt_secret              = var.jwt_secret
      github_app_id           = var.github_app_id
      github_app_private_key  = var.github_app_private_key
      github_webhook_secret   = var.github_webhook_secret
      openrouter_api_key      = var.openrouter_api_key
      slack_webhook_url       = var.slack_webhook_url
      healops_webhook_api_key = var.healops_webhook_api_key
      domain_name             = var.domain_name
    }))
  }

  freeform_tags = {
    Project     = "HealOps"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  # Prevent recreation on image updates
  lifecycle {
    ignore_changes = [source_details[0].source_id, metadata["user_data"]]
  }
}

# ── Reserved Public IP (= AWS Elastic IP) ──────────────────────────────────
# OCI Free Tier includes 1 reserved public IP
resource "oci_core_public_ip" "healops" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.app_name}-public-ip"
  lifetime       = "RESERVED"
  private_ip_id  = data.oci_core_private_ips.healops.private_ips[0].id

  freeform_tags = {
    Project = "HealOps"
  }
}

# Get the instance's primary private IP to attach the reserved public IP
data "oci_core_private_ips" "healops" {
  vnic_id = oci_core_instance.healops.create_vnic_details[0].vnic_id

  depends_on = [oci_core_instance.healops]
}

# Workaround: get VNIC attachment to resolve the actual VNIC ID
data "oci_core_vnic_attachments" "healops" {
  compartment_id = var.compartment_ocid
  instance_id    = oci_core_instance.healops.id
}

data "oci_core_vnic" "healops" {
  vnic_id = data.oci_core_vnic_attachments.healops.vnic_attachments[0].vnic_id
}
