import type { ReelPreset } from "./types.js";

const LETTERS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
const NUMBERS = Array.from("0123456789");

export const REEL_PRESETS: Readonly<Record<ReelPreset, readonly string[]>> =
  Object.freeze({
    alpha: Object.freeze([" ", ...LETTERS]),
    numeric: Object.freeze([" ", ...NUMBERS]),
    alphanumeric: Object.freeze([" ", ...LETTERS, ...NUMBERS]),
    symbols: Object.freeze([
      " ",
      ".",
      ",",
      ":",
      ";",
      "-",
      "+",
      "/",
      "?",
      "!",
      "#",
      "&",
      "@",
      "←",
      "↑",
      "→",
      "↓",
    ]),
  });

export function reelForPreset(preset: ReelPreset): string[] {
  return [...REEL_PRESETS[preset]];
}
