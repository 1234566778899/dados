"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

const GA_ID = "G-87SJSPWJ82";
const KEY = "tirada:cookies";

/** "pending" = aun no se sabe (servidor, primer pintado): no se muestra nada. */
type Status = "pending" | "unset" | "granted" | "denied";

const listeners = new Set<() => void>();

function readStatus(): Status {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

let current: Status | null = null;

function getSnapshot(): Status {
  current ??= readStatus();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function removeAnalyticsCookies() {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (!name.startsWith("_ga")) continue;
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`;
  }
}

function setStatus(next: "granted" | "denied" | "unset") {
  try {
    if (next === "unset") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  } catch {
    // Sin almacenamiento la decision dura lo que la pagina abierta.
  }
  // Si el script ya estaba cargado, esta bandera oficial lo detiene.
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = next !== "granted";
  if (next !== "granted") removeAnalyticsCookies();
  current = next;
  listeners.forEach((listener) => listener());
}

function useStatus() {
  return useSyncExternalStore<Status>(subscribe, getSnapshot, () => "pending");
}

/** Cuenta tiradas, nunca sus resultados. Sin consentimiento no hace nada. */
export function trackRoll(dice: number) {
  const { gtag } = window as unknown as { gtag?: (...args: unknown[]) => void };
  gtag?.("event", "tirada", { dados: dice });
}

export function CookieConsent() {
  const status = useStatus();
  const measuring = status === "granted" && location.hostname !== "localhost";

  return (
    <>
      {measuring && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {status === "unset" && (
        <aside className="consent" aria-label="Aviso de cookies">
          <p>
            ¿Nos dejas medir las visitas con Google Analytics? Usa cookies y solo se activa si aceptas. El dado funciona
            igual.
          </p>
          <div className="consent-actions">
            <button type="button" onClick={() => setStatus("denied")}>
              Rechazar
            </button>
            <button type="button" onClick={() => setStatus("granted")}>
              Aceptar
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

export function CookiePreferences() {
  const status = useStatus();
  if (status === "pending") return null;
  const label = status === "granted" ? "Activada" : status === "denied" ? "Rechazada" : "Sin decidir";
  return (
    <p className="cookie-preferences">
      Medición con Google Analytics: <strong>{label}</strong>.{" "}
      <button type="button" onClick={() => setStatus("unset")}>
        Cambiar mi elección
      </button>
    </p>
  );
}
