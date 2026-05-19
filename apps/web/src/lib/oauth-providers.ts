type EnvRequirement = string | readonly string[];

export const OAUTH_PROVIDER_ENV = {
  twitch: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  twitter: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
  instagram: [
    ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_APP_ID"],
    ["INSTAGRAM_CLIENT_SECRET", "INSTAGRAM_APP_SECRET"],
  ],
  tiktok: [["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_ID"], ["TIKTOK_CLIENT_SECRET"]],
  kick: ["KICK_CLIENT_ID", "KICK_CLIENT_SECRET"],
} as const satisfies Record<string, readonly EnvRequirement[]>;

export type OAuthProviderId = keyof typeof OAUTH_PROVIDER_ENV;

function hasAnyEnv(names: readonly string[]): boolean {
  return names.some((name) => Boolean(process.env[name]));
}

export function isOAuthProviderConfigured(provider: OAuthProviderId): boolean {
  return OAUTH_PROVIDER_ENV[provider].every((entry) =>
    typeof entry === "string" ? Boolean(process.env[entry]) : hasAnyEnv(entry),
  );
}

export function getConfiguredSocialLoginProviders(): Array<
  "google" | "twitch" | "kick"
> {
  return (["google", "twitch", "kick"] as const).filter(
    isOAuthProviderConfigured,
  );
}
