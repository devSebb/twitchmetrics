variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "image_tag" {
  description = "Docker image tag to deploy (e.g. git SHA or semver)"
  type        = string
}

variable "account_id" {
  description = "AWS account ID for ECR repository URI"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for security groups and networking"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for ECS tasks and ALB"
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS on ALB and CloudFront"
  type        = string
}

variable "secrets_manager_arns" {
  description = "Map of secret names to Secrets Manager ARNs for ECS task environment"
  type        = map(string)
  default = {
    database_url           = ""
    direct_url             = ""
    nextauth_secret        = ""
    nextauth_url           = ""
    twitch_client_id       = ""
    twitch_client_secret   = ""
    twitch_eventsub_secret = ""
    google_client_id       = ""
    google_client_secret   = ""
    youtube_api_key        = ""
    instagram_app_id       = ""
    instagram_app_secret   = ""
    tiktok_client_key      = ""
    tiktok_client_secret   = ""
    twitter_client_id      = ""
    twitter_client_secret  = ""
    twitter_bearer_token   = ""
    kick_client_id         = ""
    kick_client_secret     = ""
    upstash_redis_rest_url   = ""
    upstash_redis_rest_token = ""
    inngest_event_key      = ""
    inngest_signing_key    = ""
    r2_account_id          = ""
    r2_access_key_id       = ""
    r2_secret_access_key   = ""
    encryption_key         = ""
    sentry_dsn             = ""
    sentry_auth_token      = ""
    sentry_org             = ""
    sentry_project         = ""
    resend_api_key         = ""
  }
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for twitchmetrics.net"
  type        = string
}

variable "cloudfront_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront (must be us-east-1)"
  type        = string
  default     = ""
}
