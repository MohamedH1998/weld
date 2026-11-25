// The design choices with alternatives, as URL parameters: /lab shows each alternative running, and the demo boards are
// asked for this way. Only while working on the board: a built board is the board as it ships.
import { DEFAULTS as SHIPPED, DOCK_NAMES } from "@weld/canvas/variant";
import type { Variant as Shipped } from "@weld/canvas/variant";
import type { Tool } from "@weld/canvas/types";

export { DOCK_NAMES };
export type { Dock } from "@weld/canvas/variant";

export interface Variant extends Shipped {
  /** Demo only: the controls for movement start switched off. */
  still: boolean;
  /** Demo only: what starts selected (the first wire, or the first panel). */
  pick: "wire" | "panel" | null;
  /** A throwaway board with sample content; nothing is saved. */
  demo: boolean;
  /** A demo board that holds one of the animated diagrams (its slug), selected and ready to play. */
  scene: string | null;
  /** Demo only: start with the middle box selected, or a tool active. */
  select: boolean;
  tool: Tool | null;
}

export const DEFAULTS: Variant = { ...SHIPPED, still: false, pick: null, demo: false, scene: null, select: false, tool: null };

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function readVariant(search: string): Variant {
  const q = new URLSearchParams(search);
  // (the switches below, and the demo boards, are for working on the board: a built board is the board as it ships)
  if (!import.meta.env.DEV) return { ...DEFAULTS, dock: pick(q.get("dock"), DOCK_NAMES, DEFAULTS.dock) };
  return {
    // settled in the first lab: these are simply how the board works now
    ...DEFAULTS,
    dock: pick(q.get("dock"), DOCK_NAMES, DEFAULTS.dock),
    // open questions (see /lab)
    library: pick(q.get("library"), ["popover", "rail"] as const, DEFAULTS.library),
    patterns: pick(q.get("patterns"), ["tab", "button"] as const, DEFAULTS.patterns),
    voice: pick(q.get("voice"), ["caps", "mono", "typed"] as const, DEFAULTS.voice),
    paper: pick(q.get("paper"), ["opaque", "clear"] as const, DEFAULTS.paper),
    notch: pick(q.get("notch"), ["on", "off"] as const, DEFAULTS.notch),
    still: q.get("still") === "1",
    pick: q.get("pick") === "wire" ? "wire" : q.get("pick") === "panel" ? "panel" : null,
    demo: q.get("demo") === "1",
    scene: q.get("scene"),
    select: q.get("select") === "1",
    tool: q.get("tool") ? pick<Tool>(q.get("tool"), ["select", "hand", "rect", "ellipse", "diamond", "card", "arrow", "text"] as const, "select") : null,
  };
}
