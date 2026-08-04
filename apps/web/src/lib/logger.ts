import pino from "pino";
import pretty from "pino-pretty";

const isDev = process.env.NODE_ENV !== "production";

const level = process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");

// Dev uses pino-pretty as an in-process stream, NOT a worker transport:
// thread-stream's worker.js doesn't survive Next's dev bundling, and the dead
// worker made every log call throw (crashing callers that log inside catch
// blocks). Prod is plain stdout JSON either way.
const baseLogger = isDev
  ? pino({ level }, pretty({ colorize: true }))
  : pino({ level });

/**
 * Create a child logger with a context label.
 *
 * @example
 * const log = createLogger("twitch-adapter")
 * log.info({ channelId }, "Fetched channel data")
 */
export function createLogger(context: string) {
  return baseLogger.child({ context });
}

export default baseLogger;
