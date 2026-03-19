# TwitchMetrics Infrastructure

Terraform configuration for deploying TwitchMetrics on AWS ECS Fargate with CloudFront CDN.

## Architecture

```
Route 53 (twitchmetrics.net)
  → CloudFront (CDN + SSL)
    → ALB (load balancing + health checks)
      → ECS Fargate (2-6 tasks, auto-scaling on CPU > 70%)
        → Next.js standalone (port 3000)
```

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.5 installed
3. **ACM certificate** for `twitchmetrics.net` and `*.twitchmetrics.net` (must be in `us-east-1` for CloudFront)
4. **Route 53 hosted zone** for `twitchmetrics.net`
5. **VPC** with public subnets across at least 2 AZs
6. **AWS Secrets Manager** secrets created for all application env vars

## Setup

### 1. Create Secrets Manager entries

Create one secret per env var (or a single JSON secret and adjust the task definition). Each secret ARN must be provided in the `secrets_manager_arns` variable.

### 2. Create a `terraform.tfvars` file

```hcl
aws_region      = "us-east-1"
environment     = "production"
account_id      = "123456789012"
image_tag       = "latest"
vpc_id          = "vpc-xxxxxxxxx"
subnet_ids      = ["subnet-aaa", "subnet-bbb"]
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx"
hosted_zone_id  = "Z1234567890ABC"

secrets_manager_arns = {
  database_url           = "arn:aws:secretsmanager:us-east-1:123456789012:secret:twitchmetrics/database-url-AbCdEf"
  direct_url             = "arn:aws:secretsmanager:us-east-1:123456789012:secret:twitchmetrics/direct-url-AbCdEf"
  nextauth_secret        = "arn:aws:secretsmanager:us-east-1:123456789012:secret:twitchmetrics/nextauth-secret-AbCdEf"
  # ... add all other secrets
}
```

### 3. Initialize and apply

```bash
cd infra
terraform init
terraform plan
terraform apply
```

### 4. Build and push Docker image

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t twitchmetrics .
docker tag twitchmetrics:latest <account_id>.dkr.ecr.us-east-1.amazonaws.com/twitchmetrics:latest
docker push <account_id>.dkr.ecr.us-east-1.amazonaws.com/twitchmetrics:latest

# Update ECS service
aws ecs update-service --cluster twitchmetrics-production --service twitchmetrics-production --force-new-deployment
```

## Resources Created

| Resource        | Name                          |
| --------------- | ----------------------------- |
| ECR Repository  | `twitchmetrics`               |
| ECS Cluster     | `twitchmetrics-production`    |
| ECS Service     | `twitchmetrics-production`    |
| ALB             | `twitchmetrics-production`    |
| CloudFront      | Points to ALB origin          |
| Route 53        | A record (apex) + CNAME (www) |
| CloudWatch Logs | `/ecs/twitchmetrics`          |
| Security Groups | ALB SG + ECS SG               |
| Auto Scaling    | 2-6 tasks, CPU target 70%     |

## Cache Behaviors (CloudFront)

| Path              | TTL    | Behavior                    |
| ----------------- | ------ | --------------------------- |
| `/_next/static/*` | 1 year | Immutable static assets     |
| `/api/*`          | 0      | No cache, full pass-through |
| `/*` (default)    | 0      | Pass-through to ALB         |
