import type { OAuthConfig } from "next-auth/providers";

type TikTokProfile = {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: TikTokProfile;
  };
};

type OAuthRequestContext = {
  tokens: {
    access_token?: string | null;
  };
};

export function TikTokProvider(options: {
  clientKey: string;
  clientSecret: string;
}): OAuthConfig<TikTokProfile> {
  return {
    id: "tiktok",
    name: "TikTok",
    type: "oauth",
    clientId: options.clientKey,
    clientSecret: options.clientSecret,
    authorization: {
      url: "https://www.tiktok.com/v2/auth/authorize/",
      params: {
        scope: ["user.info.basic", "user.info.stats", "video.list"].join(","),
      },
    },
    token: "https://open.tiktokapis.com/v2/oauth/token/",
    userinfo: {
      async request(context: OAuthRequestContext) {
        const response = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
          {
            headers: {
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
          },
        );

        const json = (await response.json()) as TikTokUserInfoResponse;
        return (
          json.data?.user ?? {
            open_id: "",
          }
        );
      },
    },
    profile(profile) {
      return {
        id: profile.open_id,
        name: profile.display_name ?? "TikTok User",
        email: null,
        image: profile.avatar_url ?? null,
      };
    },
  };
}
