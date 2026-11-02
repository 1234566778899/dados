"use client";

import { useSyncExternalStore } from "react";

export type HistoryEntry = { id: number; values: number[]; total: number };

export type Prefs = {
  count: number;
  sound: boolean;
  history: HistoryEntry[];
};

const KEY = "tirada:v1";
const MAX_HISTORY = 50;
const DEFAULTS: Prefs = { count: 1, sound: true, history: [] };

let current: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const count = Number(parsed.count);
    return {
      count: Number.isInteger(count) && count >= 1 && count <= 6 ? count : DEFAULTS.count,
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULTS.sound,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_HISTORY) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

function update(next: Partial<Prefs>) {
  current = { ...getSnapshot(), ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Modo privado o almacenamiento lleno: sigue funcionando sin persistir.
  }
  listeners.forEach((listener) => listener());
}

function getSnapshot(): Prefs {
  if (!loaded) {
    current = read();
    loaded = true;
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
}

export const prefs = {
  setCount: (count: number) => update({ count }),
  setSound: (sound: boolean) => update({ sound }),
  addRoll: (values: number[]) => {
    const entry: HistoryEntry = {
      id: Date.now(),
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    };
    update({ history: [entry, ...getSnapshot().history].slice(0, MAX_HISTORY) });
  },
  clearHistory: () => update({ history: [] }),
};
