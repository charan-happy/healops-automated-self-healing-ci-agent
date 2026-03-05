# ─────────────────────────────────────────────────────────────────────────────
# Security List (= AWS Security Group)
# OCI uses Security Lists at subnet level (stateful by default)
#
# SECURITY POSTURE:
#   Public (0.0.0.0/0): Only HTTP/HTTPS (Nginx). All app traffic goes via Nginx.
#   Restricted (ssh_allowed_cidr): SSH, observability dashboards.
#   Blocked externally: App ports 3000/4000 — only accessible via Nginx reverse proxy.
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

  # ── Ingress: SSH (custom port 10023, restricted) ─────────────────────────
  ingress_security_rules {
    source      = var.ssh_allowed_cidr
    protocol    = "6" # TCP
    stateless   = false
    description = "SSH access (port 10023) — restricted to admin CIDR"

    tcp_options {
      min = 10023
      max = 10023
    }
  }

  # ── Ingress: SSH default port 22 (temporary for cloud-init bootstrap) ────
  # Remove this rule once cloud-init completes and SSH port 10023 is confirmed.
  ingress_security_rules {
    source      = var.ssh_allowed_cidr
    protocol    = "6"
    stateless   = false
    description = "SSH port 22 (temporary bootstrap — remove after setup)"

    tcp_options {
      min = 22
      max = 22
    }
  }

  # ── Ingress: HTTP (public — Nginx) ──────────────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "HTTP — Nginx reverse proxy"

    tcp_options {
      min = 80
      max = 80
    }
  }

  # ── Ingress: HTTPS (public — Nginx + TLS) ───────────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "6"
    stateless = false
    description = "HTTPS — Nginx reverse proxy with TLS"

    tcp_options {
      min = 443
      max = 443
    }
  }

  # ── Ingress: Grafana (3001, restricted to admin) ────────────────────────
  ingress_security_rules {
    source      = var.ssh_allowed_cidr
    protocol    = "6"
    stateless   = false
    description = "Grafana Dashboard — restricted to admin CIDR"

    tcp_options {
      min = 3001
      max = 3001
    }
  }

  # ── Ingress: Prometheus (9090, restricted to admin) ─────────────────────
  ingress_security_rules {
    source      = var.ssh_allowed_cidr
    protocol    = "6"
    stateless   = false
    description = "Prometheus — restricted to admin CIDR"

    tcp_options {
      min = 9090
      max = 9090
    }
  }

  # ── Ingress: Jaeger (16686, restricted to admin) ────────────────────────
  ingress_security_rules {
    source      = var.ssh_allowed_cidr
    protocol    = "6"
    stateless   = false
    description = "Jaeger Tracing UI — restricted to admin CIDR"

    tcp_options {
      min = 16686
      max = 16686
    }
  }

  # ── Ingress: ICMP (ping — path MTU discovery) ──────────────────────────
  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "1" # ICMP
    stateless = false
    description = "ICMP Destination Unreachable / Fragmentation Needed"

    icmp_options {
      type = 3 # Destination Unreachable
      code = 4 # Fragmentation Needed
    }
  }

  ingress_security_rules {
    source    = "0.0.0.0/0"
    protocol  = "1"
    stateless = false
    description = "ICMP echo (ping)"

    icmp_options {
      type = 8 # Echo Request
    }
  }
}
