// Smiths: short-lived helpers on the board. Summoned over a selection (or a spot), each is an agent with no card:
// it sees only what it was summoned over and what it makes, and all it changes is one step the person can take back.
// Closing its bubble ends it, and nothing of it is kept.
import type { Editor } from "@weld/canvas/editor";
import type { Box, Id, Pt, Rect } from "@weld/canvas/types";
import { isArrow, isLive } from "@weld/canvas/types";
import { boundsOf } from "@weld/canvas/geometry";
import { resolve } from "./refs";
import { threadBox } from "./place";
import { defaultCwd, weld, installed } from "./bridge";

export interface Smith {
  id: Id;
  /** What it was summoned over, by key (see refs.ts), and the shapes it has made since. */
  keys: string[];
  /** What it may change: what was selected when it was summoned (with the lines between and what sits inside). */
  ids: Id[];
  drew: Id[];
  /** Where it was summoned: the selection's bounds, or the spot. */
  at: Rect;
  /** Its last undo step, so the next joins it. */
  last?: unknown;
  /** Summoned over a page an agent opened: the page, and the project folder that serves it (the one it may change). */
  page?: { url: string; cwd: string };
}
export const smiths = new Map<Id, Smith>();
/** The colour a smith's work shows in (Weld's mint): what it changed is outlined in it for a moment. */
export const SMITH_COLOR = "#0fae7a";
const subs = new Set<() => void>();
let version = 0;
export const subscribeSmiths = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const smithsVersion = () => version;
const changed = () => {
  version++;
  for (const f of subs) f();
};

export const SMITH_NOTE = (what: string) =>
  [
    "You are a smith: a short-lived helper the person summoned onto their canvas, not a conversation.",
    what
      ? `They selected part of ${what} and summoned you over it. weld look shows you the whole drawing; you may change only what they selected (and what you draw yourself, which you may), and weld draw refuses the rest.`
      : "They summoned you to an empty spot of the canvas: draw there with weld draw (weld look shows what is around).",
    "If what they ask needs more than they selected, say what else to select (they select it and summon a smith over it); there is no @ for a smith.",
    "Do only what they ask, on the canvas; do not create or change files, or run anything else.",
    "Be quick: you already know weld look and weld draw from your instructions, so go straight to them (weld help lists every shape kind); run each on its own (no pipes: head, grep and the rest are not yours to use).",
    "When done, reply with one short sentence saying what you changed.",
  ].join(" ");

/** A smith summoned over a page: it changes that page's project, in its own folder, and nothing else. */
export const SMITH_PAGE_NOTE = (url: string) =>
  [
    `You are a smith: a short-lived helper the person summoned over a page on their canvas, ${url}, served from the project in your working folder.`,
    "Change the project's code to do what they ask: only that, kept small, in the style already there. The page is reloaded for them when you finish, so do not start, restart or build anything.",
    "You may read and edit files in this project, and use weld look to see the page; nothing else (no other commands, nothing outside the project, nothing from the network).",
    "When done, reply with one short sentence saying what you changed.",
  ].join(" ");

/** The project behind a page: the folder of the conversation that opened it (a page opened by hand has none). */
export function pageProject(editor: Editor, id: Id): { url: string; cwd: string } | null {
  const b = editor.store.doc.shapes[id] as Box | undefined;
  if (!b || b.kind !== "browser" || !b.live?.url) return null;
  const owner = threadBox(editor, b.live.by ?? b.live.from), cwd = owner?.live?.cwd;
  return cwd ? { url: b.live.url, cwd } : null;
}

export async function summon(editor: Editor, keys: string[], ids: Id[], at: Rect, page?: { url: string; cwd: string }): Promise<Id> {
  const id = `smith${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  void editor;
  smiths.set(id, { id, keys, ids, drew: [], at, ...(page ? { page } : {}) });
  await weld.thread.set(id, { agent: "claude", mode: "full", cwd: page?.cwd ?? defaultCwd(), title: "Smith", smith: true, ...(page ? { smithEdits: true } : {}) });
  changed();
  return id;
}
export function noteDrawn(id: Id, ids: Id[]) {
  const f = smiths.get(id);
  if (!f) return;
  f.drew = [...new Set([...f.drew, ...ids])].slice(-400);
  changed();
}
export async function dismiss(id: Id) {
  if (!smiths.delete(id)) return;
  changed();
  await weld.thread.forget(id);
}

/** What a smith summoned over a selection is shown: the drawings (or frames) the selection is in, each once, for what is
 *  around it. (Each shape is looked up once: one already in a drawing found is passed over.) */
export function keysOf(editor: Editor, ids: Id[]): string[] {
  const doc = editor.store.doc, out: string[] = [], covered = new Set<Id>();
  for (const id of ids) {
    const s = doc.shapes[id];
    if (!s || covered.has(id) || isLive(s) || isArrow(s)) continue;
    const kind = s.kind as string;
    const key = kind === "frame" || kind === "boundary" ? `frame:${id}` : `drawing:${id}`;
    const r = resolve(editor, key);
    if (!r) continue;
    for (const x of r.ids) covered.add(x);
    out.push(key);
  }
  return out;
}
/** What a smith may change: just what was selected, the lines between those, and what sits inside them (a glyph in a
 *  panel, what a frame holds). Never the rest of the drawing it is shown. */
export function reachOf(editor: Editor, ids: Id[]): Id[] {
  const doc = editor.store.doc, picked = new Set(ids.filter((i) => doc.shapes[i] && !isLive(doc.shapes[i]!)));
  const boxes = [...picked].map((i) => doc.shapes[i]!).filter((s) => !isArrow(s)) as Box[];
  for (const id of doc.order) {
    const s = doc.shapes[id]!;
    if (picked.has(id) || isLive(s)) continue;
    if (isArrow(s)) {
      if (s.a.bind && s.b.bind && picked.has(s.a.bind.id) && picked.has(s.b.bind.id)) picked.add(id);
      continue;
    }
    const b = s as unknown as Box;
    if (boxes.some((o) => b.x >= o.x && b.y >= o.y && b.x + b.w <= o.x + o.w && b.y + b.h <= o.y + o.h)) picked.add(id);
  }
  // (and the lines between what sits inside and what was picked)
  for (const id of doc.order) {
    const s = doc.shapes[id]!;
    if (isArrow(s) && s.a.bind && s.b.bind && picked.has(s.a.bind.id) && picked.has(s.b.bind.id)) picked.add(id);
  }
  return [...picked];
}

/** Ask a smith: over what is selected (shapes on the board), or, with nothing of that selected, at a spot to draw from scratch. */
export function askSmith(editor: Editor, at: Pt) {
  // (smiths are Claude: without it there is none to ask)
  if (!installed().claude) return;
  const s = editor.store, ids = [...s.sel].filter((i) => s.doc.shapes[i] && !isLive(s.doc.shapes[i]!));
  const b = ids.length ? boundsOf(s.doc, ids) : null;
  if (b) return summon(editor, keysOf(editor, ids), reachOf(editor, ids), b);
  return summon(editor, [], [], { x: at.x, y: at.y, w: 0, h: 0 });
}
