# Platform Developer App Registration

This guide covers how to register developer applications for each platform supported by TwitchMetrics.

**Callback URI pattern:** `http://localhost:3000/api/auth/callback/[provider]`

---

## Twitch

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Click **Register Your Application**
3. Set **OAuth Redirect URL** to `http://localhost:3000/api/auth/callback/twitch`
4. Set **Category** to "Analytics Tool"
5. Copy **Client ID** and generate a **Client Secret**
6. Add to `.env.local`:
   ```
   TWITCH_CLIENT_ID="..."
   TWITCH_CLIENT_SECRET="..."
   ```
7. For EventSub webhooks, generate a secret: `openssl rand -hex 20`
   ```
   TWITCH_EVENTSUB_SECRET="..."
   ```

## Google / YouTube

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable **YouTube Data API v3** and **YouTube Analytics API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Set **Application type** to "Web application"
6. Add **Authorized redirect URI:** `http://localhost:3000/api/auth/callback/google`
7. Copy **Client ID** and **Client Secret**
8. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   ```
9. For public data fetching (no OAuth), create an **API Key**:
   ```
   YOUTUBE_API_KEY="..."
   ```

## Meta / Instagram

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create a new app → Select **Business** type
3. Add the **Instagram Graph API** product
4. Set **Valid OAuth Redirect URI:** `http://localhost:3000/api/auth/callback/instagram`
5. The Instagram account must be a **Business** or **Creator** account linked to a Facebook Page
6. Copy **App ID** and **App Secret**
7. Add to `.env.local`:
   ```
   INSTAGRAM_APP_ID="..."
   INSTAGRAM_APP_SECRET="..."
   ```

## TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com)
2. Create a new app
3. Enable **Login Kit** and **Display API** (requires approval)
4. Set **Redirect URI:** `http://localhost:3000/api/auth/callback/tiktok`
5. Copy **Client Key** and **Client Secret**
6. Add to `.env.local`:
   ```
   TIKTOK_CLIENT_KEY="..."
   TIKTOK_CLIENT_SECRET="..."
   ```

## X (Twitter)

1. Go to [Twitter Developer Portal](https://developer.twitter.com)
2. Sign up for at least **Basic** tier ($100/month) for read access
3. Create a new project and app
4. Set **Callback URL:** `http://localhost:3000/api/auth/callback/twitter`
5. Enable **OAuth 2.0** with PKCE
6. Copy **Client ID** and **Client Secret**
7. Generate a **Bearer Token** for app-only auth
8. Add to `.env.local`:
   ```
   TWITTER_CLIENT_ID="..."
   TWITTER_CLIENT_SECRET="..."
   TWITTER_BEARER_TOKEN="..."
   ```

## Kick

Kick's API is currently in limited beta. Registration steps TBD.

```
KICK_CLIENT_ID=""
KICK_CLIENT_SECRET=""
```
