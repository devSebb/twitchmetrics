import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      }
    : {}),
});

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
