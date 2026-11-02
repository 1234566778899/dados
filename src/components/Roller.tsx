"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DiceEngine } from "@/lib/engine";
import { fairFace } from "@/lib/fair";
import { DiceSound } from "@/lib/sound";
import { prefs, usePrefs, type HistoryEntry } from "@/lib/store";

type RollState = {
  values: number[];
  held: boolean[];
  rolling: boolean;
  /** Cambia en cada tirada terminada para reanimar el total. */
  serial: number;
};

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function DieFace({ value }: { value: number }) {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" className="die-face">
      {PIP_LAYOUT[value].map(([x, y], index) => (
        <circle key={index} cx={x * 5.6} cy={y * 5.6} r={2.3} />
      ))}
    </svg>
  );
}

function describe(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.length === 1 ? `Salió ${total}` : `Total ${total}: ${values.join(", ")}`;
}

function HistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="history-empty">Tus tiradas aparecerán aquí.</p>;
  }
  return (
    <ol className="history-list">
      {history.map((entry) => (
        <li key={entry.id}>
          <span className="history-total">{entry.total}</span>
          {entry.values.length > 1 && <span className="history-values">{entry.values.join(" + ")}</span>}
        </li>
      ))}
    </ol>
  );
}

export function Roller({ about }: { about: ReactNode }) {
  const { count, sound, history } = usePrefs();
  const [roll, setRoll] = useState<RollState | null>(null);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DiceEngine | null>(null);
  const soundRef = useRef<DiceSound | null>(null);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const historyRef = useRef<HTMLDialogElement>(null);
  const countRef = useRef(count);
  const serialRef = useRef(0);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  // El motor 3D se carga aparte: la pagina es usable antes de que llegue.
  useEffect(() => {
    let cancelled = false;
    let engine: DiceEngine | null = null;
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => engine?.setDark(dark.matches);

    void (async () => {
      try {
        const { DiceEngine } = await import("@/lib/engine");
        if (cancelled || !canvasRef.current) return;
        engine = new DiceEngine(canvasRef.current);
        await engine.load();
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        engine.setDark(dark.matches);
        engine.showRest(countRef.current);
        setReady(true);
      } catch (error) {
        // Sin WebGL la app sigue tirando dados: el resultado se muestra sin animacion.
        console.error("3D no disponible", error);
      }
    })();

    dark.addEventListener("change", onScheme);
    return () => {
      cancelled = true;
      dark.removeEventListener("change", onScheme);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(async () => {
          // Lo cargado antes de que el worker tomara control tambien debe quedar
          // guardado, o la primera visita no serviria sin conexion.
          const assets = performance
            .getEntriesByType("resource")
            .map((entry) => new URL(entry.name))
            .filter((url) => url.origin === location.origin && url.pathname.startsWith("/_next/static/"))
            .map((url) => url.pathname + url.search);
          const cache = await caches.open("tirada-v1");
          await cache.addAll(assets);
        })
        .catch(() => {});
    }
  }, []);

  const allHeld = roll !== null && roll.held.length > 0 && roll.held.every(Boolean);

  const throwNow = useCallback(() => {
    const engine = engineRef.current;
    const current = roll;
    const held = current?.held.length === count ? current.held : new Array<boolean>(count).fill(false);
    if (held.every(Boolean)) return;

    // El resultado se decide aqui, antes de la animacion, y solo aqui.
    const values = held.map((isHeld, index) => (isHeld && current ? current.values[index] : fairFace()));
    const thrown = values.filter((_, index) => !held[index]);
    setRoll({ values, held, rolling: true, serial: serialRef.current });
    setAnnouncement("");
    navigator.vibrate?.(8);

    const settle = () => {
      serialRef.current += 1;
      setRoll({ values, held, rolling: false, serial: serialRef.current });
      setAnnouncement(describe(values));
      prefs.addRoll(values);
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const info = engine?.throwDice(thrown, { reducedMotion, onSettled: settle }) ?? null;
    if (!info) {
      settle();
      return;
    }
    if (sound && !reducedMotion) {
      soundRef.current ??= new DiceSound();
      soundRef.current.unlock();
      soundRef.current.play(info.events);
    }
  }, [roll, count, sound]);

  const changeCount = useCallback((next: number) => {
    prefs.setCount(next);
    setRoll(null);
    setAnnouncement("");
    soundRef.current?.stop();
    engineRef.current?.showRest(next);
  }, []);

  const toggleHold = (index: number) => {
    setRoll((state) => {
      if (!state || state.rolling) return state;
      const held = state.held.map((value, i) => (i === index ? !value : value));
      return { ...state, held };
    });
  };

  const toggleSound = () => {
    if (sound) soundRef.current?.stop();
    prefs.setSound(!sound);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (aboutRef.current?.open || historyRef.current?.open) return;
      const target = event.target as HTMLElement;
      if (event.code === "Space" || event.key === "Enter") {
        // En un boton con foco, espacio/enter ya lo activan de forma nativa.
        if (target.closest("button, a, input, select, textarea")) return;
        event.preventDefault();
        throwNow();
      } else if (/^[1-6]$/.test(event.key)) {
        changeCount(Number(event.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [throwNow, changeCount]);

  const rolling = roll?.rolling ?? false;
  const total = roll && !rolling ? roll.values.reduce((sum, value) => sum + value, 0) : null;
  const heldCount = roll?.held.filter(Boolean).length ?? 0;

  return (
    <main className="app">
      <div className="stage" onClick={throwNow} aria-hidden="true">
        <Image
          src="/poster.webp"
          alt=""
          fill
          priority
          unoptimized
          className={`poster${ready ? " is-hidden" : ""}`}
        />
        <canvas ref={canvasRef} className={`scene${ready ? " is-ready" : ""}`} />
      </div>

      <section className="panel" aria-label="Controles">
        <header className="topbar">
          <h1 className="brand">Tirada</h1>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Silenciar sonido" : "Activar sonido"}
              title={sound ? "Silenciar sonido" : "Activar sonido"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
                {sound ? (
                  <path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                ) : (
                  <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                )}
              </svg>
            </button>
            <button type="button" className="text-button history-toggle" onClick={() => historyRef.current?.showModal()}>
              Historial
            </button>
            <button type="button" className="text-button" onClick={() => aboutRef.current?.showModal()}>
              Acerca de
            </button>
          </div>
        </header>

        <div className="result">
          <p className="result-label">{count === 1 ? "Resultado" : "Total"}</p>
          <p key={roll?.serial ?? "idle"} className={`result-total${total !== null ? " is-fresh" : " is-empty"}`}>
            {total ?? "–"}
          </p>
          <div className="sr-only" role="status" aria-live="polite">
            {announcement}
          </div>

          {count > 1 && (
            <>
              <ul className="chips">
                {Array.from({ length: count }, (_, index) => {
                  const held = roll?.held[index] ?? false;
                  const hasValue = roll !== null && (!rolling || held);
                  const value = roll?.values[index] ?? 0;
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        className={`chip${held ? " is-held" : ""}`}
                        disabled={!hasValue || rolling}
                        aria-pressed={held}
                        aria-label={hasValue ? `Dado ${index + 1}: ${value}. ${held ? "Guardado, toca para soltarlo" : "Toca para guardarlo"}` : `Dado ${index + 1}`}
                        onClick={() => toggleHold(index)}
                      >
                        {hasValue && <DieFace value={value} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="hint">
                {heldCount > 0
                  ? `${heldCount === 1 ? "1 dado guardado" : `${heldCount} dados guardados`}: no se volverá${heldCount === 1 ? "" : "n"} a lanzar`
                  : roll && !rolling
                    ? "Toca un dado para guardarlo en la próxima tirada"
                    : " "}
              </p>
            </>
          )}
        </div>

        <div className="controls">
          <fieldset className="count">
            <legend>Dados</legend>
            <div className="count-options">
              {[1, 2, 3, 4, 5, 6].map((option) => (
                <button
                  key={option}
                  type="button"
                  className="count-option"
                  aria-pressed={option === count}
                  aria-label={`${option} ${option === 1 ? "dado" : "dados"}`}
                  onClick={() => changeCount(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <button type="button" className="roll-button" onClick={throwNow} disabled={allHeld}>
            {allHeld ? "Suelta un dado para lanzar" : "Lanzar"}
            {!allHeld && <kbd>Espacio</kbd>}
          </button>
        </div>

        <div className="history">
          <div className="history-head">
            <h2>Historial</h2>
            {history.length > 0 && (
              <button type="button" className="text-button" onClick={prefs.clearHistory}>
                Borrar
              </button>
            )}
          </div>
          <HistoryList history={history} />
        </div>
      </section>

      <dialog ref={historyRef} className="sheet" aria-label="Historial">
        <div className="sheet-head">
          <h2>Historial</h2>
          <form method="dialog">
            <button className="text-button">Cerrar</button>
          </form>
        </div>
        <HistoryList history={history} />
        {history.length > 0 && (
          <button type="button" className="text-button sheet-clear" onClick={prefs.clearHistory}>
            Borrar historial
          </button>
        )}
      </dialog>

      <dialog ref={aboutRef} className="sheet" aria-label="Acerca de Tirada">
        <div className="sheet-head">
          <h2>Acerca de Tirada</h2>
          <form method="dialog">
            <button className="text-button">Cerrar</button>
          </form>
        </div>
        {about}
      </dialog>
    </main>
  );
}
