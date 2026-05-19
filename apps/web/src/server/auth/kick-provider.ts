import type { OAuthConfig } from "next-auth/providers";
import { customFetch } from "next-auth";

type KickProfile = {
  user_id: string;
  name?: string;
  email?: string;
  profile_picture?: string;
};

type KickUserInfoResponse = {
  data?: Array<{
    user_id?: number | string;
    name?: string;
    email?: string;
    profile_picture?: string;
  }>;
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
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    // Kick's /oauth/token returns JSON-shaped body but with a non-JSON
    // Content-Type header. oauth4webapi refuses to parse it. Wrap the fetch
    // so the token endpoint always advertises application/json.
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
      const response = await fetch(input, init);
      if (!url.includes("/oauth/token")) {
        return response;
      }
      const body = await response.text();
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json");
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    authorization: {
      url: "https://id.kick.com/oauth/authorize",
      params: {
        scope: ["user:read", "channel:read"].join(" "),
      },
    },
    token: "https://id.kick.com/oauth/token",
    checks: ["pkce", "state"],
    userinfo: {
      url: "https://api.kick.com/public/v1/users",
      async request(context: OAuthRequestContext) {
        const response = await fetch("https://api.kick.com/public/v1/users", {
          headers: {
            Authorization: `Bearer ${context.tokens.access_token}`,
          },
        });

        const json = (await response.json()) as KickUserInfoResponse;
        const entry = json.data?.[0];
        return {
          user_id: entry?.user_id ? String(entry.user_id) : "",
          name: entry?.name,
          email: entry?.email,
          profile_picture: entry?.profile_picture,
        };
      },
    },
    profile(profile) {
      return {
        id: profile.user_id,
        name: profile.name ?? "Kick User",
        email: profile.email ?? null,
        image: profile.profile_picture ?? null,
      };
    },
  };
}
