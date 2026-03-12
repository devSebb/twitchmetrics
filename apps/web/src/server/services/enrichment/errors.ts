export class OAuthTokenInvalidError extends Error {
  constructor(
    message: string,
    readonly platformAccountId?: string,
  ) {
    super(message);
    this.name = "OAuthTokenInvalidError";
  }
}

export class EnrichmentRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentRateLimitError";
  }
}
