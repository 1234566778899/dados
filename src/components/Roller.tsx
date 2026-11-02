"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackRoll } from "@/components/CookieConsent";
import { ACHIEVEMENTS, moodFor, stickerFor, type AchievementId, type Mood, type Sticker } from "@/lib/achievements";
import type { DiceEngine } from "@/lib/engine";
import { fairFace } from "@/lib/fair";
import { DiceSound } from "@/lib/sound";
import { prefs, usePrefs, type HistoryEntry } from "@/lib/store";

const IDLE_MS = 30_000;
const STICKER_MS = 1900;
const TOAST_MS = 3600;
const TOAST_DELAY_MS = 1700;

type RollState = {
  values: number[];
  held: boolean[];
  rolling: boolean;
  /** Cambia en cada tirada terminada para reanimar el total. */
  serial: number;
};

type Celebration = { sticker: Sticker; id: number };
/** afterSticker: el aviso espera a que termine la pegatina para no taparse con ella. */
type Toast = { earned: AchievementId[]; id: number; afterSticker: boolean };

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const MASCOTS: Record<Mood, { width: number; height: number; alt: string }> = {
  wave: { width: 280, height: 267, alt: "La mascota saluda" },
  jackpot: { width: 280, height: 310, alt: "La mascota salta de alegría" },
  happy: { width: 280, height: 252, alt: "La mascota levanta el pulgar" },
  sad: { width: 240, height: 283, alt: "La mascota está triste" },
  dizzy: { width: 280, height: 258, alt: "La mascota da vueltas mareada" },
  sleep: { width: 280, height: 278, alt: "La mascota duerme" },
};

const STICKERS: Record<Sticker | "logro", { width: number; height: number; label: string }> = {
  dobles: { width: 560, height: 272, label: "¡Dobles!" },
  trio: { width: 480, height: 303, label: "¡Trío!" },
  escalera: { width: 600, height: 280, label: "¡Escalera!" },
  pleno: { width: 520, height: 288, label: "¡Pleno!" },
  seis: { width: 460, height: 291, label: "¡Seis!" },
  logro: { width: 520, height: 270, label: "¡Logro!" },
};

const BURST = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  const distance = 150 + (index % 3) * 70;
  return {
    "--x": `${Math.round(Math.cos(angle) * distance)}px`,
    "--y": `${Math.round(Math.sin(angle) * distance)}px`,
    "--s": 0.45 + (index % 4) * 0.2,
    "--d": `${(index % 5) * 30}ms`,
  } as React.CSSProperties;
});

function DieFace({ value }: { value: number }) {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" className="die-face">
      {PIP_LAYOUT[value].map(([x, y], index) => (
        <circle key={index} cx={x * 5.6} cy={y * 5.6} r={2.4} />
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
          <span className="history-dice" role="img" aria-label={entry.values.join(" + ")}>
            {entry.values.map((value, index) => (
              <span className="mini-die" key={index}>
                <DieFace value={value} />
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RoundIcon({ name, label }: { name: string; label: string }) {
  return <Image src={`/art/ic-${name}.webp`} alt={label} width={128} height={131} unoptimized />;
}

export function Roller() {
  const { count, sound, history, unlocked } = usePrefs();
  const [roll, setRoll] = useState<RollState | null>(null);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [mood, setMood] = useState<Mood>("wave");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DiceEngine | null>(null);
  const soundRef = useRef<DiceSound | null>(null);
  const historyRef = useRef<HTMLDialogElement>(null);
  const trophiesRef = useRef<HTMLDialogElement>(null);
  const countRef = useRef(count);
  const soundOnRef = useRef(sound);
  const serialRef = useRef(0);

  useEffect(() => {
    countRef.current = count;
    soundOnRef.current = sound;
  }, [count, sound]);

  // El motor 3D se carga aparte: la pagina es usable antes de que llegue.
  useEffect(() => {
    let cancelled = false;
    let engine: DiceEngine | null = null;

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
        engine.showRest(countRef.current);
        setReady(true);
      } catch (error) {
        // Sin WebGL la app sigue tirando dados: el resultado se muestra sin animacion.
        console.error("3D no disponible", error);
      }
    })();

    return () => {
      cancelled = true;
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
          const cache = await caches.open("tirada-v2");
          await cache.addAll(assets);
        })
        .catch(() => {});
    }
  }, []);

  // Si nadie juega, la mascota se duerme.
  useEffect(() => {
    if (mood === "sleep" || mood === "dizzy") return;
    const timer = window.setTimeout(() => setMood("sleep"), IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [mood, roll?.serial]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), STICKER_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS + (toast.afterSticker ? TOAST_DELAY_MS : 0));
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    setMood("dizzy");
    setCelebration(null);
    navigator.vibrate?.(8);

    const settle = () => {
      serialRef.current += 1;
      setRoll({ values, held, rolling: false, serial: serialRef.current });
      setMood(moodFor(values));
      const earned = prefs.addRoll(values);
      trackRoll(values.length);

      const sticker = stickerFor(values);
      if (sticker) setCelebration({ sticker, id: serialRef.current });
      if (earned.length > 0) setToast({ earned, id: serialRef.current, afterSticker: sticker !== null });
      if ((sticker || earned.length > 0) && soundOnRef.current) soundRef.current?.fanfare();
      if (sticker || earned.length > 0) navigator.vibrate?.([12, 40, 12]);

      const names = earned.map((id) => ACHIEVEMENTS.find((item) => item.id === id)?.name).join(", ");
      setAnnouncement(`${describe(values)}${names ? `. Logro desbloqueado: ${names}` : ""}`);
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    soundRef.current ??= new DiceSound();
    if (sound) soundRef.current.unlock();
    const info = engine?.throwDice(thrown, { reducedMotion, onSettled: settle }) ?? null;
    if (!info) {
      settle();
      return;
    }
    if (sound && !reducedMotion) soundRef.current.play(info.events);
  }, [roll, count, sound]);

  const changeCount = useCallback((next: number) => {
    prefs.setCount(next);
    setRoll(null);
    setAnnouncement("");
    setMood("wave");
    setCelebration(null);
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
      if (historyRef.current?.open || trophiesRef.current?.open) return;
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
  const mascot = MASCOTS[mood];

  return (
    <main className="app">
      {/* picture permite un fondo vertical en moviles; next/image no elige por orientacion. */}
      <picture className="table-bg">
        <source media="(orientation: portrait)" srcSet="/art/bg-tall.webp" />
        <img src="/art/bg-wide.webp" alt="" fetchPriority="high" />
      </picture>

      <div className="stage" onClick={throwNow} aria-hidden="true">
        <Image src="/poster.webp" alt="" fill priority unoptimized className={`poster${ready ? " is-hidden" : ""}`} />
        <canvas ref={canvasRef} className={`scene${ready ? " is-ready" : ""}`} />

        {celebration && (
          <div className="celebration" key={celebration.id}>
            <div className="burst">
              {BURST.map((style, index) => (
                <span key={index} style={style} />
              ))}
            </div>
            <Image
              className="sticker"
              src={`/art/st-${celebration.sticker}.webp`}
              alt=""
              width={STICKERS[celebration.sticker].width}
              height={STICKERS[celebration.sticker].height}
              unoptimized
            />
          </div>
        )}
      </div>

      {toast && (
        <div className={`toast${toast.afterSticker ? " is-delayed" : ""}`} key={toast.id}>
          <Image className="toast-word" src="/art/st-logro.webp" alt="¡Logro!" width={520} height={270} unoptimized />
          <ul>
            {toast.earned.map((id) => (
              <li key={id}>
                <Image src={`/art/medal-${id}.webp`} alt="" width={176} height={200} unoptimized />
                <span>{ACHIEVEMENTS.find((item) => item.id === id)?.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="panel" aria-label="Controles">
        <header className="topbar">
          <Image className="logo" src="/art/logo.webp" alt="Tirada" width={640} height={221} priority unoptimized />
          <div className="topbar-actions">
            <button
              type="button"
              className="round"
              onClick={toggleSound}
              aria-pressed={sound}
              title={sound ? "Silenciar sonido" : "Activar sonido"}
            >
              <RoundIcon name={sound ? "sound" : "mute"} label={sound ? "Silenciar sonido" : "Activar sonido"} />
            </button>
            <button type="button" className="round history-toggle" onClick={() => historyRef.current?.showModal()} title="Historial">
              <RoundIcon name="history" label="Historial" />
            </button>
            <button type="button" className="round round-badged" onClick={() => trophiesRef.current?.showModal()} title="Logros">
              <RoundIcon name="trophy" label={`Logros: ${unlocked.length} de ${ACHIEVEMENTS.length}`} />
              {unlocked.length > 0 && <span className="badge">{unlocked.length}</span>}
            </button>
            <a className="round" href="#acerca" title="Acerca de Tirada">
              <RoundIcon name="help" label="Acerca de Tirada" />
            </a>
          </div>
        </header>

        <div className="result">
          <Image
            key={mood}
            className={`mascot mascot-${mood}`}
            src={`/art/m-${mood}.webp`}
            alt={mascot.alt}
            width={mascot.width}
            height={mascot.height}
            unoptimized
          />

          <div className="total-banner">
            <span className="sr-only">{count === 1 ? "Resultado" : "Total"}</span>
            <p key={roll?.serial ?? "idle"} className={`result-total${total !== null ? " is-fresh" : " is-empty"}`}>
              {total ?? "?"}
            </p>
          </div>
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
                    ? "Toca un dado para guardarlo"
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
                  className="pill count-option"
                  aria-pressed={option === count}
                  aria-label={`${option} ${option === 1 ? "dado" : "dados"}`}
                  onClick={() => changeCount(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <button type="button" className="pill roll-button" onClick={throwNow} disabled={allHeld}>
            {allHeld ? "Suelta un dado" : "¡Lanzar!"}
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

      <dialog ref={trophiesRef} className="sheet sheet-wide" aria-label="Logros">
        <div className="sheet-head">
          <h2>
            Logros{" "}
            <span className="sheet-count">
              {unlocked.length}/{ACHIEVEMENTS.length}
            </span>
          </h2>
          <form method="dialog">
            <button className="text-button">Cerrar</button>
          </form>
        </div>
        <ul className="medals">
          {ACHIEVEMENTS.map((item) => {
            const done = unlocked.includes(item.id);
            return (
              <li key={item.id} className={done ? "is-done" : "is-locked"}>
                <Image src={`/art/medal-${item.id}.webp`} alt="" width={176} height={200} loading="lazy" unoptimized />
                <strong>{item.name}</strong>
                <span>{done ? "Conseguido" : item.how}</span>
              </li>
            );
          })}
        </ul>
      </dialog>
    </main>
  );
}
