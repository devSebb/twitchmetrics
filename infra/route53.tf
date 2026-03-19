# ============================================================
# Route 53 DNS Records
# ============================================================

resource "aws_route53_record" "apex" {
  zone_id = var.hosted_zone_id
  name    = "twitchmetrics.net"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.twitchmetrics.domain_name
    zone_id                = aws_cloudfront_distribution.twitchmetrics.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = var.hosted_zone_id
  name    = "www.twitchmetrics.net"
  type    = "CNAME"
  ttl     = 300
  records = [aws_cloudfront_distribution.twitchmetrics.domain_name]
}
