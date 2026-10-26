import { InngestMiddleware } from "inngest";
import {
  withTwitchPriority,
  type TwitchPriority,
} from "@/server/adapters/twitch-rate";

/**
 * Every Inngest step calls Twitch as a background job, never as a page
 * request. Inngest runs inside the Vercel Next.js process, where "no
 * priority scope" means a page request (fail fast on 429, no waiting); without
 * this, discover/enrich/claim/clip-sync and any new function would lose their
 * 429 handling. Functions that need another priority (game-snapshot, tiers)
 * call withTwitchPriority inside the step: the innermost scope wins.
 *
 * Wraps `step.run` callbacks only. Twitch calls belong inside steps anyway:
 * code in the function body re-runs on every replay.
 */
export const DEFAULT_INNGEST_TWITCH_PRIORITY: TwitchPriority = "job";

type StepRun = (...args: unknown[]) => unknown;

/** `step` with each `step.run` callback inside the default job scope. */
export function withDefaultTwitchPriority<TStep extends { run: unknown }>(
  step: TStep,
): TStep {
  const run = step.run as StepRun;
  const wrappedRun: StepRun = (idOrOptions, fn, ...input) =>
    run.call(
      step,
      idOrOptions,
      (...fnArgs: unknown[]) =>
        withTwitchPriority(DEFAULT_INNGEST_TWITCH_PRIORITY, () =>
          (fn as StepRun)(...fnArgs),
        ),
      ...input,
    );
  return { ...step, run: wrappedRun };
}

export const twitchPriorityMiddleware = new InngestMiddleware({
  name: "twitch-priority",
  init() {
    return {
      onFunctionRun() {
        return {
          transformInput({ ctx }) {
            return { ctx: { step: withDefaultTwitchPriority(ctx.step) } };
          },
        };
      },
    };
  },
});
