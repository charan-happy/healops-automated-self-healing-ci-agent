# ─────────────────────────────────────────────────────────────────────────────
# Security List (= AWS Security Group)
# OCI uses Security Lists at subnet level (stateful by default)
# ─────────────────────────────────────────────────────────────────────────────

resource "oci_core_security_list" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.app_name}-security-list"

  # ── Egress: Allow ALL outbound ────────────────────────────────────────────
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all" # all protocols
    stateless   = false
    description = "Allow all outbound traffic"
  }

  # ── Ingress: SSH (custom port 10023) ──────────────────────────────────────
  ingress_security_rules {
    source    = var.ssh_allowed_cidr
    protocol  = "6" # TCP
    stateless = false
    description = "SSH access (port 10023)"

    tcp_options {
      min = 10023
      max = 10023
    }
  }

  # ── Ingress: HTTP ─────────────────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "HTTP"

    tcp_options {
      min = 80
      max = 80
    }
  }

  # ── Ingress: HTTPS ────────────────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "HTTPS"

    tcp_options {
      min = 443
      max = 443
    }
  }

  # ── Ingress: Next.js Frontend (3000) ──────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "Next.js Frontend"

    tcp_options {
      min = 3000
      max = 3000
    }
  }

  # ── Ingress: NestJS Backend (4000) ────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "NestJS Backend API"

    tcp_options {
      min = 4000
      max = 4000
    }
  }

  # ── Ingress: Grafana (3001) ───────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "Grafana Dashboard"

    tcp_options {
      min = 3001
      max = 3001
    }
  }

  # ── Ingress: Prometheus (9090) ────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "Prometheus"

    tcp_options {
      min = 9090
      max = 9090
    }
  }

  # ── Ingress: Jaeger (16686) ───────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "Jaeger Tracing UI"

    tcp_options {
      min = 16686
      max = 16686
    }
  }

  # ── Ingress: ICMP (ping) ─────────────────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "1" # ICMP
    stateless = false
    description = "ICMP ping"

    icmp_options {
      type = 3 # Destination Unreachable
      code = 4 # Fragmentation Needed
    }
  }

  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "1"
    stateless = false
    description = "ICMP echo"

    icmp_options {
      type = 8 # Echo Request
    }
  }
}
