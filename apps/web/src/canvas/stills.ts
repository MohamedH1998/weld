// What a picture of a board shows, made on the server or in the page alike: still moments, with what plays in them marked.
import type { Doc, Rect, Shape } from "@weld/canvas/types";

// a still cannot show something travelling: a wire that plays in a moment is coloured by what it carries, as the board's own
// look check draws it (blue runs out, violet runs back pointing the way the answer goes, red is refused or lost)
export const marked = (x: Shape): Shape => {
  if (x.kind !== "arrow" || !x.run) return x;
  const { run, ...rest } = x;
  return { ...rest, ...(run === "back" ? { a: x.b, b: x.a } : {}), tone: run === "squash" || run === "fizzle" ? "red" : run === "back" ? "violet" : "accent", ...(x.fine ? { fine: { ...x.fine, line: undefined, w: Math.max(2.5, x.fine.w ?? 2) } } : {}) } as Shape;
};
// (a picture is of things a person could draw: anything vastly larger or further out is left out of it)
const sane = (s: Shape) => s.kind === "arrow" || (Math.abs(s.x) < 1e6 && Math.abs(s.y) < 1e6 && s.w >= 0 && s.h >= 0 && s.w < 20_000 && s.h < 20_000);
// (and its words are a few lines' worth: a picture of a pasted novel shows its start)
const clipped = (s: Shape): Shape => ("text" in s && typeof s.text === "string" && s.text.length > 600 ? ({ ...s, text: s.text.slice(0, 600) } as Shape) : s);
export const docOf = (shapes: Shape[]): Doc => {
  const shown = shapes.filter((s) => !s.away && sane(s)).slice(0, 5_000).map(marked).map(clipped);
  return { shapes: Object.fromEntries(shown.map((s) => [s.id, s])), order: shown.map((s) => s.id) };
};
export const union = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

