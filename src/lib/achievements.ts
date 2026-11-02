/**
 * Logros y reacciones. Solo leen el resultado ya sorteado: nada de esto
 * influye en el azar.
 */

export type AchievementId =
  | "first"
  | "doubles"
  | "triple"
  | "straight"
  | "crown"
  | "snake"
  | "streak"
  | "hundred"
  | "clover";

export const ACHIEVEMENTS: { id: AchievementId; name: string; how: string }[] = [
  { id: "first", name: "Primera tirada", how: "Lanza los dados por primera vez." },
  { id: "doubles", name: "Dobles", how: "Saca el mismo número con 2 dados." },
  { id: "triple", name: "Trío", how: "Saca el mismo número con 3 dados." },
  { id: "straight", name: "Escalera", how: "Saca del 1 al 6 con 6 dados." },
  { id: "crown", name: "Rey del seis", how: "Saca solo seises con 2 dados o más." },
  { id: "snake", name: "Ojos de serpiente", how: "Saca solo unos con 2 dados." },
  { id: "streak", name: "En racha", how: "Repite el mismo total 3 veces seguidas." },
  { id: "hundred", name: "Coleccionista", how: "Completa 100 tiradas." },
  { id: "clover", name: "Pura suerte", how: "Saca el mismo número con 4 dados o más." },
];

export type Sticker = "dobles" | "trio" | "escalera" | "pleno" | "seis";
export type Mood = "wave" | "jackpot" | "happy" | "sad" | "dizzy" | "sleep";

const allSame = (values: number[]) => values.every((value) => value === values[0]);

const isStraight = (values: number[]) => values.length === 6 && new Set(values).size === 6;

/** Pegatina que merece la tirada, o null si es una tirada normal. */
export function stickerFor(values: number[]): Sticker | null {
  if (values.length === 0) return null;
  if (isStraight(values)) return "escalera";
  if (values.length >= 4 && allSame(values)) return "pleno";
  if (values.length === 3 && allSame(values)) return "trio";
  if (values.length === 2 && allSame(values)) return "dobles";
  if (values.length === 1 && values[0] === 6) return "seis";
  return null;
}

export function moodFor(values: number[]): Mood {
  if (stickerFor(values)) return "jackpot";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average <= (values.length <= 2 ? 1.5 : 2)) return "sad";
  if (average >= 4.5) return "happy";
  return "wave";
}

/** Logros que esta tirada desbloquea, dado el estado anterior. */
export function newlyUnlocked(
  values: number[],
  state: { rolls: number; recentTotals: number[]; unlocked: readonly string[] },
): AchievementId[] {
  const earned: AchievementId[] = [];
  const total = values.reduce((sum, value) => sum + value, 0);
  const rolls = state.rolls + 1;
  const same = allSame(values);

  earned.push("first");
  if (values.length === 2 && same) earned.push("doubles");
  if (values.length === 3 && same) earned.push("triple");
  if (isStraight(values)) earned.push("straight");
  if (values.length >= 2 && same && values[0] === 6) earned.push("crown");
  if (values.length === 2 && same && values[0] === 1) earned.push("snake");
  if (values.length >= 4 && same) earned.push("clover");
  if (rolls >= 100) earned.push("hundred");
  const recent = state.recentTotals.slice(0, 2);
  if (recent.length === 2 && recent.every((value) => value === total)) earned.push("streak");

  return earned.filter((id) => !state.unlocked.includes(id));
}
