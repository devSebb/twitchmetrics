import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client (for Realtime subscriptions in future)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// TODO: Future Realtime channels:
// - "live-status" — broadcast when creators go live/offline (from Twitch EventSub)
// - "viewer-counts" — real-time viewer count updates for game pages
// - "leaderboard" — live-updating top creators/games
