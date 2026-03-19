output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.twitchmetrics.dns_name
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.twitchmetrics.repository_url
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.twitchmetrics.name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.twitchmetrics.name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.twitchmetrics.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.twitchmetrics.domain_name
}
