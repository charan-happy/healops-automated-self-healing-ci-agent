# ─────────────────────────────────────────────────────────────────────────────
# EC2 Instance, SSH Key, Elastic IP, IAM Role, User Data
# ─────────────────────────────────────────────────────────────────────────────

# ── Latest Ubuntu 24.04 LTS AMI (auto-fetched) ───────────────────────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical's official AWS account

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# ── SSH Key Pair (Terraform generates it, saves to local file) ────────────────
resource "tls_private_key" "healops" {
  count     = var.create_ssh_key ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "healops" {
  count      = var.create_ssh_key ? 1 : 0
  key_name   = "${var.app_name}-ec2-key"
  public_key = tls_private_key.healops[0].public_key_openssh

  tags = { Name = "${var.app_name}-ec2-key" }
}

# Save private key locally — KEEP THIS SAFE
resource "local_file" "private_key" {
  count           = var.create_ssh_key ? 1 : 0
  content         = tls_private_key.healops[0].private_key_pem
  filename        = "${path.module}/../../healops-ec2.pem"
  file_permission = "0600"
}

# ── IAM Role for EC2 (CloudWatch logs only) ───────────────────────────────────
resource "aws_iam_role" "ec2" {
  name = "${var.app_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.app_name}-ec2-role" }
}

# CloudWatch agent — write logs and metrics
resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# S3 media bucket access
resource "aws_iam_role_policy" "s3_media" {
  count = var.create_media_bucket ? 1 : 0
  name  = "${var.app_name}-s3-media"
  role  = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject", "s3:GetObject", "s3:DeleteObject",
          "s3:GetObjectVersion", "s3:PutObjectTagging"
        ]
        Resource = "${aws_s3_bucket.media[0].arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.media[0].arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.app_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ── EC2 Instance ──────────────────────────────────────────────────────────────
resource "aws_instance" "healops" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.ec2_instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  key_name               = var.create_ssh_key ? aws_key_pair.healops[0].key_name : var.existing_key_pair_name
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # 30 GB gp3 root volume
  root_block_device {
    volume_type           = var.ec2_volume_type
    volume_size           = var.ec2_volume_size_gb
    delete_on_termination = true
    encrypted             = true

    tags = { Name = "${var.app_name}-root-volume" }
  }

  # User data — runs once on first boot, sets up Docker + app directory
  user_data = base64encode(templatefile("${path.module}/../scripts/user-data.sh", {
    app_name                = var.app_name
    postgres_password       = var.postgres_password
    jwt_secret              = var.jwt_secret
    github_app_id           = var.github_app_id
    github_app_private_key  = var.github_app_private_key
    github_webhook_secret   = var.github_webhook_secret
    openrouter_api_key      = var.openrouter_api_key
    slack_webhook_url       = var.slack_webhook_url
    healops_webhook_api_key = var.healops_webhook_api_key
    grafana_admin_password  = var.grafana_admin_password
    s3_bucket_name          = var.create_media_bucket ? aws_s3_bucket.media[0].id : ""
    aws_region              = var.aws_region
    rds_host                = aws_db_instance.healops.address
    rds_db_name             = aws_db_instance.healops.db_name
    rds_username            = aws_db_instance.healops.username
    redis_host              = aws_elasticache_replication_group.main.primary_endpoint_address
    redis_auth_token        = random_password.redis_auth.result
    redis_tls_enabled       = tostring(aws_elasticache_replication_group.main.transit_encryption_enabled)
  }))

  # Prevent accidental termination
  disable_api_termination = false # set true after initial setup

  tags = { Name = "${var.app_name}-server" }

  lifecycle {
    # Don't replace instance if AMI gets a new version
    # Ignore root volume size changes — AWS doesn't allow shrinking EBS volumes
    # Use AWS console or Terraform destroy/recreate to resize down
    ignore_changes = [ami, user_data, root_block_device[0].volume_size]
  }
}

# ── Elastic IP (static IP that survives stop/start) ───────────────────────────
resource "aws_eip" "healops" {
  instance = aws_instance.healops.id
  domain   = "vpc"

  tags = { Name = "${var.app_name}-eip" }

  depends_on = [aws_internet_gateway.main]
}