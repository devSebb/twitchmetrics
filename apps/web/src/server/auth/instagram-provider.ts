import type { OAuthConfig } from "next-auth/providers";

type InstagramProfile = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

type OAuthRequestContext = {
  tokens: {
    access_token?: string | null;
  };
};

export function InstagramProvider(options: {
  clientId: string;
  clientSecret: string;
}): OAuthConfig<InstagramProfile> {
  return {
    id: "instagram",
    name: "Instagram",
    type: "oauth",
    issuer: "https://www.facebook.com",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: "https://www.facebook.com/v19.0/dialog/oauth",
      params: {
        scope: [
          "instagram_basic",
          "instagram_manage_insights",
          "pages_show_list",
          "pages_read_engagement",
        ].join(" "),
      },
    },
    token: "https://graph.facebook.com/v19.0/oauth/access_token",
    userinfo: {
      async request(context: OAuthRequestContext) {
        const response = await fetch(
          "https://graph.instagram.com/me?fields=id,username,name,profile_picture_url",
          {
            headers: {
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
          },
        );
        return (await response.json()) as InstagramProfile;
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name ?? profile.username ?? "Instagram User",
        email: null,
        image: profile.profile_picture_url ?? null,
      };
    },
  };
}
