import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const COOKIE_PREFERENCES_KEY = "tm_cookie_preferences_v1";
const COOKIE_PREFERENCES_UPDATE_EVENT = "tm-cookie-preferences-updated";
let replayIntegrationEnabled = false;

function hasOptionalDiagnosticsConsent() {
  try {
    const stored = window.localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as { diagnostics?: unknown };
    return parsed.diagnostics === true;
  } catch {
    return false;
  }
}

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const diagnosticsConsent = hasOptionalDiagnosticsConsent();
  replayIntegrationEnabled = diagnosticsConsent;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: diagnosticsConsent ? [Sentry.replayIntegration()] : [],
  });

  window.addEventListener(COOKIE_PREFERENCES_UPDATE_EVENT, (event) => {
    const preferences = (event as CustomEvent).detail?.preferences as
      | { diagnostics?: unknown }
      | undefined;
    if (preferences?.diagnostics === true && !replayIntegrationEnabled) {
      Sentry.addIntegration(Sentry.replayIntegration());
      replayIntegrationEnabled = true;
    } else if (preferences?.diagnostics !== true && replayIntegrationEnabled) {
      void Sentry.getReplay()?.stop();
      replayIntegrationEnabled = false;
    }
  });
}
