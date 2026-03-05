# ─────────────────────────────────────────────────────────────────────────────
# Outputs — printed after `terraform apply`
# ─────────────────────────────────────────────────────────────────────────────

output "instance_public_ip" {
  description = "Public IP of the compute instance"
  value       = data.oci_core_vnic.healops.public_ip_address
}

output "instance_id" {
  description = "Compute instance OCID"
  value       = oci_core_instance.healops.id
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i healops-oci.pem ubuntu@${data.oci_core_vnic.healops.public_ip_address}"
}

output "app_urls" {
  description = "HealOps application URLs"
  value = {
    frontend   = "http://${data.oci_core_vnic.healops.public_ip_address}:3000"
    api        = "http://${data.oci_core_vnic.healops.public_ip_address}:4000"
    health     = "http://${data.oci_core_vnic.healops.public_ip_address}:4000/health"
    swagger    = "http://${data.oci_core_vnic.healops.public_ip_address}:4000/api/v1"
    grafana    = "http://${data.oci_core_vnic.healops.public_ip_address}:3001"
    prometheus = "http://${data.oci_core_vnic.healops.public_ip_address}:9090"
    jaeger     = "http://${data.oci_core_vnic.healops.public_ip_address}:16686"
    bullboard  = "http://${data.oci_core_vnic.healops.public_ip_address}:4000/admin/queues"
  }
}

output "vcn_id" {
  description = "VCN OCID"
  value       = oci_core_vcn.main.id
}

output "subnet_id" {
  description = "Public subnet OCID"
  value       = oci_core_subnet.public.id
}

output "image_used" {
  description = "Ubuntu ARM image OCID"
  value       = data.oci_core_images.ubuntu_arm.images[0].id
}

output "instance_shape_info" {
  description = "Instance shape and specs"
  value = {
    shape      = var.instance_shape
    ocpus      = var.instance_ocpus
    memory_gb  = var.instance_memory_gb
    arch       = "ARM (aarch64)"
    cost       = "FREE (Always Free Tier)"
  }
}

output "dns_setup" {
  description = "Add this A record to your domain DNS"
  value = {
    type   = "A"
    name   = "@"
    value  = data.oci_core_vnic.healops.public_ip_address
    domain = var.domain_name
  }
}

output "infrastructure_summary" {
  description = "Full infrastructure summary"
  value = {
    provider    = "Oracle Cloud Infrastructure (Free Tier)"
    region      = var.region
    instance    = "${var.instance_ocpus} OCPU / ${var.instance_memory_gb} GB RAM (ARM)"
    monthly_cost = "$0.00 (Always Free)"
    public_ip   = data.oci_core_vnic.healops.public_ip_address
    ssh         = "ssh -i healops-oci.pem ubuntu@${data.oci_core_vnic.healops.public_ip_address}"
  }
}
