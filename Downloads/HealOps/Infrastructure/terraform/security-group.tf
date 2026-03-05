# ───────────────────────────────────────────────────────────────────────────��─
# EC2 Security Group
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_security_group" "ec2" {
  name        = "${var.app_name}-ec2-sg"
  description = "HealOps EC2 security group"
  vpc_id      = aws_vpc.main.id

  # ── Inbound Rules ──────────────────────────────────────────────────────────

  # SSH — restricted to your IP only (set ssh_allowed_cidr in tfvars)
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # NestJS Backend API
  ingress {
    description = "NestJS Backend API"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Next.js Frontend & NestJS App (port 3000)
  ingress {
    description = "Frontend & App"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Grafana Dashboard
  ingress {
    description = "Grafana"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Prometheus
  ingress {
    description = "Prometheus"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Jaeger UI
  ingress {
    description = "Jaeger UI"
    from_port   = 16686
    to_port     = 16686
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Bull Board Queue UI
  ingress {
    description = "Bull Board"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ICMP (ping) — useful for connectivity testing
  ingress {
    description = "ICMP ping"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ── Outbound Rules ─────────────────────────────────────────────────────────
  # Allow all outbound (EC2 needs to reach GitHub, OpenRouter, Slack etc)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-ec2-sg" }
}
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# ElastiCache Redis Security Group
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_security_group" "redis" {
  name        = "${var.app_name}-redis-sg"
  description = "HealOps ElastiCache Redis security group"
  vpc_id      = aws_vpc.main.id

  # Redis port — only from EC2 security group
  ingress {
    description     = "Redis from EC2"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-redis-sg" }
}
