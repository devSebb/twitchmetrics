import { customFetch } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";

type TikTokProfile = {
  open_id: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
  profile_deep_link?: string;
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
  const scopes = [
    "user.info.basic",
    "user.info.profile",
    "user.info.stats",
    "video.list",
  ];

  return {
    id: "tiktok",
    name: "TikTok",
    type: "oauth",
    clientId: options.clientKey,
    clientSecret: options.clientSecret,
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    authorization: {
      url: "https://www.tiktok.com/v2/auth/authorize/",
      params: {
        client_key: options.clientKey,
        scope: scopes.join(","),
      },
    },
    token: "https://open.tiktokapis.com/v2/oauth/token/",
    checks: ["state"],
    // TikTok's OAuth v2 endpoints use `client_key` instead of OAuth's
    // standard `client_id`. Auth.js still needs `clientId` for its internal
    // provider contract, so rewrite only the backend token request.
    [customFetch]: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (!url.includes("/v2/oauth/token/")) {
        return fetch(input, init);
      }

      const request =
        input instanceof Request ? input : new Request(input, init);
      const body = new URLSearchParams(await request.clone().text());

      body.set("client_key", options.clientKey);
      body.set("client_secret", options.clientSecret);
      body.delete("client_id");

      const headers = new Headers(request.headers);
      headers.delete("authorization");
      headers.set("content-type", "application/x-www-form-urlencoded");

      return fetch(request.url, {
        method: request.method,
        headers,
        body,
        redirect: request.redirect,
        signal: request.signal,
      });
    },
    userinfo: {
      url: "https://open.tiktokapis.com/v2/user/info/",
      async request(context: OAuthRequestContext) {
        const fields = [
          "open_id",
          "union_id",
          "display_name",
          "avatar_url",
          "username",
          "profile_deep_link",
        ].join(",");

        const response = await fetch(
          `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`,
          {
            headers: {
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
          },
        );

        const json = (await response.json()) as TikTokUserInfoResponse;
        const user = json.data?.user;
        if (!response.ok || !user?.open_id) {
          throw new Error("TikTok userinfo did not return an open_id");
        }

        return user;
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
