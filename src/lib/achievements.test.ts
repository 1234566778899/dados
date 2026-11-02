import { describe, expect, it } from "vitest";
import { moodFor, newlyUnlocked, stickerFor } from "./achievements";

const fresh = { rolls: 5, recentTotals: [], unlocked: ["first"] };

describe("stickerFor", () => {
  it.each([
    [[6], "seis"],
    [[5], null],
    [[3, 3], "dobles"],
    [[3, 4], null],
    [[2, 2, 2], "trio"],
    [[2, 2, 3], null],
    [[4, 4, 4, 4], "pleno"],
    [[1, 1, 1, 1, 1, 1], "pleno"],
    [[1, 2, 3, 4, 5, 6], "escalera"],
    [[6, 4, 2, 1, 3, 5], "escalera"],
    [[1, 2, 3, 4, 5], null],
  ])("%j -> %s", (values, expected) => {
    expect(stickerFor(values)).toBe(expected);
  });
});

describe("moodFor", () => {
  it("festeja, se alegra y se lamenta segun la tirada", () => {
    expect(moodFor([6])).toBe("jackpot");
    expect(moodFor([1])).toBe("sad");
    expect(moodFor([5])).toBe("happy");
    expect(moodFor([3])).toBe("wave");
    expect(moodFor([1, 2])).toBe("sad");
    expect(moodFor([5, 6, 5, 6])).toBe("happy");
  });
});

describe("newlyUnlocked", () => {
  it("desbloquea la primera tirada una sola vez", () => {
    expect(newlyUnlocked([3], { rolls: 0, recentTotals: [], unlocked: [] })).toEqual(["first"]);
    expect(newlyUnlocked([3], fresh)).toEqual([]);
  });

  it("reconoce cada combinacion", () => {
    expect(newlyUnlocked([4, 4], fresh)).toEqual(["doubles"]);
    expect(newlyUnlocked([4, 4, 4], fresh)).toEqual(["triple"]);
    expect(newlyUnlocked([6, 6], fresh)).toEqual(["doubles", "crown"]);
    expect(newlyUnlocked([1, 1], fresh)).toEqual(["doubles", "snake"]);
    expect(newlyUnlocked([2, 2, 2, 2], fresh)).toEqual(["clover"]);
    expect(newlyUnlocked([6, 6, 6, 6, 6], fresh)).toEqual(["crown", "clover"]);
    expect(newlyUnlocked([1, 2, 3, 4, 5, 6], fresh)).toEqual(["straight"]);
  });

  it("cuenta 100 tiradas y la racha de 3 totales iguales", () => {
    expect(newlyUnlocked([3], { ...fresh, rolls: 99 })).toEqual(["hundred"]);
    expect(newlyUnlocked([3], { ...fresh, rolls: 98 })).toEqual([]);
    expect(newlyUnlocked([3], { ...fresh, recentTotals: [3, 3, 5] })).toEqual(["streak"]);
    expect(newlyUnlocked([3], { ...fresh, recentTotals: [3, 5, 3] })).toEqual([]);
    expect(newlyUnlocked([3], { ...fresh, recentTotals: [3] })).toEqual([]);
  });
});
