import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest invokes one step per request; heavy steps (e.g. S3 daily-session
// imports parsing multi-MB CSVs) need more than the low Vercel default or the
// function is killed mid-step and Inngest retries indefinitely.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
