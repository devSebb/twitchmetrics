"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tm_cookie_preferences_v1";
const PREFERENCES_VERSION = 1;
const OPEN_EVENT = "tm-open-cookie-settings";
const UPDATE_EVENT = "tm-cookie-preferences-updated";

type CookiePreferences = {
  version: typeof PREFERENCES_VERSION;
  essential: true;
  diagnostics: boolean;
  updatedAt: string;
};

const diagnosticsAvailable = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

function readPreferences(): CookiePreferences | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<CookiePreferences>;
    if (parsed.version !== PREFERENCES_VERSION) return null;
    return {
      version: PREFERENCES_VERSION,
      essential: true,
      diagnostics: parsed.diagnostics === true,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function savePreferences(diagnostics: boolean) {
  const preferences: CookiePreferences = {
    version: PREFERENCES_VERSION,
    essential: true,
    diagnostics,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, { detail: { preferences } }),
  );
}

const COPY = {
  en: {
    title: "Cookie preferences",
    essentialTitle: "Essential cookies",
    diagnosticsTitle: "Optional diagnostics",
    notice:
      "We use essential cookies for sign-in, session security and authentication flows. They are required for TwitchMetrics to work.",
    consent:
      "We use essential cookies for sign-in and security. You can also allow optional diagnostics that help us debug errors and improve stability.",
    diagnostics:
      "Allow error diagnostics and session replay for technical debugging. We do not use this for advertising or commercial profiling.",
    gotIt: "Got it",
    reject: "Reject optional",
    accept: "Accept optional",
    manage: "Manage",
    save: "Save choices",
    policy: "Cookie Policy",
    required: "Always active",
  },
  es: {
    title: "Preferencias de cookies",
    essentialTitle: "Cookies esenciales",
    diagnosticsTitle: "Diagnóstico opcional",
    notice:
      "Utilizamos cookies esenciales para el inicio de sesión, la seguridad de la sesión y los flujos de autenticación. Son necesarias para que TwitchMetrics funcione.",
    consent:
      "Utilizamos cookies esenciales para el inicio de sesión y la seguridad. También puedes permitir diagnósticos opcionales que nos ayudan a depurar errores y mejorar la estabilidad.",
    diagnostics:
      "Permitir diagnóstico de errores y reproducción de sesiones con fines técnicos. No lo usamos para publicidad ni perfiles comerciales.",
    gotIt: "Entendido",
    reject: "Rechazar opcionales",
    accept: "Aceptar opcionales",
    manage: "Configurar",
    save: "Guardar selección",
    policy: "Política de Cookies",
    required: "Siempre activas",
  },
} as const;

export function CookieNotice() {
  const pathname = usePathname();
  const locale = pathname?.startsWith("/es") ? "es" : "en";
  const copy = COPY[locale];
  const policyPath = locale === "es" ? "/es/cookies" : "/cookies";
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);

  useEffect(() => {
    const preferences = readPreferences();
    if (preferences) {
      setDiagnostics(preferences.diagnostics);
      setVisible(false);
    } else {
      setVisible(true);
    }

    function openSettings() {
      const latest = readPreferences();
      setDiagnostics(latest?.diagnostics ?? false);
      setShowSettings(true);
      setVisible(true);
    }

    window.addEventListener(OPEN_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_EVENT, openSettings);
  }, []);

  const body = useMemo(
    () => (diagnosticsAvailable ? copy.consent : copy.notice),
    [copy],
  );

  function persist(nextDiagnostics: boolean) {
    savePreferences(nextDiagnostics);
    setDiagnostics(nextDiagnostics);
    setVisible(false);
    setShowSettings(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 sm:px-6">
      <section
        aria-labelledby="cookie-notice-title"
        className="mx-auto max-w-4xl rounded-lg border border-[#3F4147] bg-[#1E1F22] p-4 shadow-2xl shadow-black/40 sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2
              id="cookie-notice-title"
              className="text-base font-semibold text-[#F2F3F5]"
            >
              {copy.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#DBDEE1]">
              {body}{" "}
              <Link
                href={policyPath}
                className="font-medium text-[#E32C19] underline-offset-2 hover:underline"
              >
                {copy.policy}
              </Link>
            </p>
          </div>

          {!showSettings ? (
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-shrink-0">
              {diagnosticsAvailable ? (
                <>
                  <button
                    type="button"
                    onClick={() => persist(false)}
                    className="rounded-md border border-[#3F4147] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
                  >
                    {copy.reject}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="rounded-md border border-[#3F4147] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
                  >
                    {copy.manage}
                  </button>
                  <button
                    type="button"
                    onClick={() => persist(true)}
                    className="rounded-md bg-[#E32C19] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
                  >
                    {copy.accept}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => persist(false)}
                  className="rounded-md bg-[#E32C19] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
                >
                  {copy.gotIt}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {showSettings ? (
          <div className="mt-4 space-y-3 border-t border-[#3F4147] pt-4">
            <div className="flex items-start justify-between gap-4 rounded-md bg-[#2B2D31] p-3">
              <div>
                <h3 className="text-sm font-semibold text-[#F2F3F5]">
                  {copy.essentialTitle}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#949BA4]">
                  {copy.notice}
                </p>
              </div>
              <span className="rounded-md border border-[#3F4147] px-2 py-1 text-xs font-medium text-[#DBDEE1]">
                {copy.required}
              </span>
            </div>

            {diagnosticsAvailable ? (
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md bg-[#2B2D31] p-3">
                <span>
                  <span className="block text-sm font-semibold text-[#F2F3F5]">
                    {copy.diagnosticsTitle}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#949BA4]">
                    {copy.diagnostics}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={diagnostics}
                  onChange={(event) => setDiagnostics(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#E32C19]"
                />
              </label>
            ) : null}

            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => persist(false)}
                className="rounded-md border border-[#3F4147] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
              >
                {copy.reject}
              </button>
              <button
                type="button"
                onClick={() => persist(diagnostics)}
                className="rounded-md bg-[#E32C19] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                {copy.save}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function CookiePreferencesButton() {
  const pathname = usePathname();
  const locale = pathname?.startsWith("/es") ? "es" : "en";

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="text-xs text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
    >
      {locale === "es" ? "Configurar cookies" : "Cookie settings"}
    </button>
  );
}
