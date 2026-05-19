import type { OAuthConfig } from "next-auth/providers";

type KickUserInfoResponse = {
  data?: Array<{
    user_id?: number | string;
    name?: string;
    email?: string;
    profile_picture?: string;
  }>;
};

type KickProfile = {
  id: string;
  name: string | null;
  email: string | null;
  profile_picture: string | null;
};

type OAuthRequestContext = {
  tokens: {
    access_token?: string | null;
  };
};

export function KickProvider(options: {
  clientId: string;
  clientSecret: string;
}): OAuthConfig<KickProfile> {
  return {
    id: "kick",
    name: "Kick",
    type: "oauth",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: "https://id.kick.com/oauth/authorize",
      params: {
        scope: ["user:read", "channel:read"].join(" "),
        response_type: "code",
      },
    },
    token: "https://id.kick.com/oauth/token",
    checks: ["pkce", "state"],
    userinfo: {
      async request(context: OAuthRequestContext): Promise<KickProfile> {
        const response = await fetch("https://api.kick.com/public/v1/users", {
          headers: {
            Authorization: `Bearer ${context.tokens.access_token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Kick userinfo request failed: ${response.status}`);
        }

        const json = (await response.json()) as KickUserInfoResponse;
        const entry = json.data?.[0];
        if (!entry?.user_id) {
          throw new Error("Kick userinfo response missing user_id");
        }

        return {
          id: String(entry.user_id),
          name: entry.name ?? null,
          email: entry.email ?? null,
          profile_picture: entry.profile_picture ?? null,
        };
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.profile_picture,
      };
    },
  };
}
