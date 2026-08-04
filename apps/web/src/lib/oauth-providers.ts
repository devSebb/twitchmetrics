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

export type SocialLoginProviderId = "google" | "twitch" | "kick" | "tiktok";

/**
 * Providers offered on the login/register pages. YouTube (google) and TikTok
 * remain fully wired in auth.ts and on the connections page — they are just
 * hidden from sign-in until their flows are ready. Re-add them here to restore.
 */
const SOCIAL_LOGIN_PROVIDERS = [
  "twitch",
  "kick",
] as const satisfies readonly SocialLoginProviderId[];

export function getConfiguredSocialLoginProviders(): SocialLoginProviderId[] {
  return SOCIAL_LOGIN_PROVIDERS.filter(isOAuthProviderConfigured);
}
