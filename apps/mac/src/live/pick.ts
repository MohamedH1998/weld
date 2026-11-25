// Pointing at things on the board while talking to a thread: with its @
// list open, or with ⌘ held while typing to it, a press on the board picks
// what is under it (the whole drawing a shape belongs to, a frame, a page,
// another thread) instead of selecting it.
import type { Editor } from "@weld/canvas/editor";
import type { Id } from "@weld/canvas/types";
import { isLive } from "@weld/canvas/types";
import { refsOn, textOf } from "./refs";

export const picking: { thread: Id | null; open: boolean; add: ((key: string) => void) | null } = { thread: null, open: false, add: null };

/** Whether a press now would pick rather than select. */
export const aiming = (meta: boolean) => !!picking.add && (picking.open || meta);

/** The thing a press on this shape points at: what it is part of (a drawing, a group) before the frame it stands in. */
export function refForShape(editor: Editor, id: Id): { key: string; ids: Id[] } | null {
  const doc = editor.store.doc, s = doc.shapes[id];
  if (!s || id === picking.thread) return null;
  const frameHit = s.kind === "frame" || s.kind === "boundary";
  if (isLive(s)) return { key: `live:${id}`, ids: [id] };
  const all = refsOn(editor, picking.thread ?? "");
  const rank = (k: string) => (k === "frame" ? (frameHit ? 0 : 3) : k === "drawing" || k === "group" ? 1 : 2);
  const hits = all.filter((r) => r.ids.includes(id)).sort((a, b) => rank(a.kind) - rank(b.kind));
  if (hits[0]) return { key: hits[0].key, ids: hits[0].ids };
  // (a shape on its own: its words, or, with none, the shape itself, shown to the agent as drawn)
  return textOf(s) ? { key: `note:${id}`, ids: [id] } : { key: `drawing:${id}`, ids: [id] };
}
