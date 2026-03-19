terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ============================================================
# ECR Repository
# ============================================================

resource "aws_ecr_repository" "twitchmetrics" {
  name                 = "twitchmetrics"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

resource "aws_ecr_lifecycle_policy" "twitchmetrics" {
  repository = aws_ecr_repository.twitchmetrics.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ============================================================
# CloudWatch Log Group
# ============================================================

resource "aws_cloudwatch_log_group" "twitchmetrics" {
  name              = "/ecs/twitchmetrics"
  retention_in_days = 30

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# ============================================================
# ECS Cluster
# ============================================================

resource "aws_ecs_cluster" "twitchmetrics" {
  name = "twitchmetrics-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# ============================================================
# IAM — Task Execution Role
# ============================================================

resource "aws_iam_role" "ecs_task_execution" {
  name = "twitchmetrics-${var.environment}-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets_access" {
  name = "twitchmetrics-${var.environment}-secrets-access"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = values(var.secrets_manager_arns)
      }
    ]
  })
}

# ============================================================
# IAM — Task Role (for application-level AWS access)
# ============================================================

resource "aws_iam_role" "ecs_task" {
  name = "twitchmetrics-${var.environment}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# ============================================================
# Security Groups
# ============================================================

resource "aws_security_group" "alb" {
  name        = "twitchmetrics-${var.environment}-alb"
  description = "Security group for ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# Separate rule to avoid circular dependency between ALB SG and ECS SG
resource "aws_security_group_rule" "alb_to_ecs" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.ecs.id
  description              = "To ECS tasks"
}

resource "aws_security_group" "ecs" {
  name        = "twitchmetrics-${var.environment}-ecs"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB on port 3000"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# ============================================================
# ALB
# ============================================================

resource "aws_lb" "twitchmetrics" {
  name               = "twitchmetrics-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids

  enable_deletion_protection = true

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

resource "aws_lb_target_group" "twitchmetrics" {
  name        = "twitchmetrics-${var.environment}"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.twitchmetrics.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.twitchmetrics.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.twitchmetrics.arn
  }
}

# ============================================================
# ECS Task Definition
# ============================================================

resource "aws_ecs_task_definition" "twitchmetrics" {
  family                   = "twitchmetrics-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "twitchmetrics"
      image     = "${aws_ecr_repository.twitchmetrics.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = var.secrets_manager_arns["database_url"] },
        { name = "DIRECT_URL", valueFrom = var.secrets_manager_arns["direct_url"] },
        { name = "NEXTAUTH_SECRET", valueFrom = var.secrets_manager_arns["nextauth_secret"] },
        { name = "NEXTAUTH_URL", valueFrom = var.secrets_manager_arns["nextauth_url"] },
        { name = "TWITCH_CLIENT_ID", valueFrom = var.secrets_manager_arns["twitch_client_id"] },
        { name = "TWITCH_CLIENT_SECRET", valueFrom = var.secrets_manager_arns["twitch_client_secret"] },
        { name = "TWITCH_EVENTSUB_SECRET", valueFrom = var.secrets_manager_arns["twitch_eventsub_secret"] },
        { name = "GOOGLE_CLIENT_ID", valueFrom = var.secrets_manager_arns["google_client_id"] },
        { name = "GOOGLE_CLIENT_SECRET", valueFrom = var.secrets_manager_arns["google_client_secret"] },
        { name = "YOUTUBE_API_KEY", valueFrom = var.secrets_manager_arns["youtube_api_key"] },
        { name = "INSTAGRAM_APP_ID", valueFrom = var.secrets_manager_arns["instagram_app_id"] },
        { name = "INSTAGRAM_APP_SECRET", valueFrom = var.secrets_manager_arns["instagram_app_secret"] },
        { name = "TIKTOK_CLIENT_KEY", valueFrom = var.secrets_manager_arns["tiktok_client_key"] },
        { name = "TIKTOK_CLIENT_SECRET", valueFrom = var.secrets_manager_arns["tiktok_client_secret"] },
        { name = "TWITTER_CLIENT_ID", valueFrom = var.secrets_manager_arns["twitter_client_id"] },
        { name = "TWITTER_CLIENT_SECRET", valueFrom = var.secrets_manager_arns["twitter_client_secret"] },
        { name = "TWITTER_BEARER_TOKEN", valueFrom = var.secrets_manager_arns["twitter_bearer_token"] },
        { name = "KICK_CLIENT_ID", valueFrom = var.secrets_manager_arns["kick_client_id"] },
        { name = "KICK_CLIENT_SECRET", valueFrom = var.secrets_manager_arns["kick_client_secret"] },
        { name = "UPSTASH_REDIS_REST_URL", valueFrom = var.secrets_manager_arns["upstash_redis_rest_url"] },
        { name = "UPSTASH_REDIS_REST_TOKEN", valueFrom = var.secrets_manager_arns["upstash_redis_rest_token"] },
        { name = "INNGEST_EVENT_KEY", valueFrom = var.secrets_manager_arns["inngest_event_key"] },
        { name = "INNGEST_SIGNING_KEY", valueFrom = var.secrets_manager_arns["inngest_signing_key"] },
        { name = "R2_ACCOUNT_ID", valueFrom = var.secrets_manager_arns["r2_account_id"] },
        { name = "R2_ACCESS_KEY_ID", valueFrom = var.secrets_manager_arns["r2_access_key_id"] },
        { name = "R2_SECRET_ACCESS_KEY", valueFrom = var.secrets_manager_arns["r2_secret_access_key"] },
        { name = "ENCRYPTION_KEY", valueFrom = var.secrets_manager_arns["encryption_key"] },
        { name = "SENTRY_DSN", valueFrom = var.secrets_manager_arns["sentry_dsn"] },
        { name = "SENTRY_AUTH_TOKEN", valueFrom = var.secrets_manager_arns["sentry_auth_token"] },
        { name = "SENTRY_ORG", valueFrom = var.secrets_manager_arns["sentry_org"] },
        { name = "SENTRY_PROJECT", valueFrom = var.secrets_manager_arns["sentry_project"] },
        { name = "RESEND_API_KEY", valueFrom = var.secrets_manager_arns["resend_api_key"] },
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "R2_BUCKET_NAME", value = "twitchmetrics-media" },
        { name = "PORT", value = "3000" },
        { name = "HOSTNAME", value = "0.0.0.0" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.twitchmetrics.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }
}

# ============================================================
# ECS Service
# ============================================================

resource "aws_ecs_service" "twitchmetrics" {
  name            = "twitchmetrics-${var.environment}"
  cluster         = aws_ecs_cluster.twitchmetrics.id
  task_definition = aws_ecs_task_definition.twitchmetrics.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.twitchmetrics.arn
    container_name   = "twitchmetrics"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  depends_on = [aws_lb_listener.https]

  tags = {
    Environment = var.environment
    Project     = "twitchmetrics"
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# ============================================================
# Auto Scaling
# ============================================================

resource "aws_appautoscaling_target" "twitchmetrics" {
  max_capacity       = 6
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.twitchmetrics.name}/${aws_ecs_service.twitchmetrics.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "twitchmetrics-${var.environment}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.twitchmetrics.resource_id
  scalable_dimension = aws_appautoscaling_target.twitchmetrics.scalable_dimension
  service_namespace  = aws_appautoscaling_target.twitchmetrics.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
