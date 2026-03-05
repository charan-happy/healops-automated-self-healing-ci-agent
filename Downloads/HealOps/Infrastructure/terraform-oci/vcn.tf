# ─────────────────────────────────────────────────────────────────────────────
# VCN (Virtual Cloud Network), Subnet, Internet Gateway, Route Table
# Equivalent to AWS VPC + Subnet + IGW + Route Table
# ─────────────────────────────────────────────────────────────────────────────

# ── Availability Domain (OCI equivalent of AWS AZ) ──────────────────────────
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# ── VCN (= AWS VPC) ─────────────────────────────────────────────────────────
resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.app_name}-vcn"
  dns_label      = var.app_name

  freeform_tags = {
    Project     = "HealOps"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ── Internet Gateway (= AWS IGW) ────────────────────────────────────────────
resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.app_name}-igw"
  enabled        = true
}

# ── Route Table (= AWS Route Table with 0.0.0.0/0 → IGW) ───────────────────
resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.app_name}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

# ── Public Subnet (instance lives here) ─────────────────────────────────────
resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "${var.app_name}-public-subnet"
  dns_label                  = "pub"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.main.id]
  availability_domain        = data.oci_identity_availability_domains.ads.availability_domains[0].name
}
