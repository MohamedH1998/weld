// The page's copy of each thread, kept in step with the app's own.
import { useSyncExternalStore } from "react";
import { weld } from "./bridge";
import type { Thread, ThreadEvent } from "./bridge";

const all = new Map<string, Thread>();
const asked = new Set<string>();
// heard per thread, so one agent writing redraws one thread; `any` hears only what a count or a list needs (state, name)
const mine = new Map<string, Set<() => void>>();
const any = new Set<() => void>();
const versions = new Map<string, number>();
let brief = 0;
// (work in the background is part of it: the corner and the bar count it)
const briefOf = (t: Thread | undefined) => (t ? `${t.meta.status}|${t.meta.error ? 1 : 0}|${t.meta.unread ? 1 : 0}|${t.meta.asking ? 1 : 0}|${t.meta.title}|${t.meta.cwd}|${(t.meta.background ?? []).map((b) => `${b.id}:${b.what}`).join(",")}|${t.meta.backgroundMore ?? 0}` : "");
function set(id: string, t: Thread) {
  const was = briefOf(all.get(id));
  all.set(id, t);
  versions.set(id, (versions.get(id) ?? 0) + 1);
  for (const l of mine.get(id) ?? []) l();
  if (briefOf(t) !== was) {
    brief += 1;
    for (const l of any) l();
  }
}

// what an agent writes arrives in many small pieces: they are gathered and shown once a frame
const waiting = new Map<string, Map<string, string>>();
let due = 0;
function flush() {
  due = 0;
  for (const [id, pieces] of waiting) {
    const t = all.get(id);
    if (t) set(id, { ...t, items: t.items.map((x) => (pieces.has(x.id) ? { ...x, text: (x.text || "") + pieces.get(x.id) } : x)) });
  }
  waiting.clear();
}
function apply(id: string, ev: ThreadEvent) {
  if (ev.t === "delta") {
    let pieces = waiting.get(id);
    if (!pieces) waiting.set(id, (pieces = new Map()));
    pieces.set(ev.id, (pieces.get(ev.id) ?? "") + ev.text);
    // a timer as well as a frame: a window that is hidden gets no frames
    if (!due) due = window.setTimeout(flush, 32), requestAnimationFrame(() => due && (clearTimeout(due), flush()));
    return;
  }
  if (waiting.has(id)) flush();
  const t = all.get(id);
  if (!t) return;
  if (ev.t === "meta") set(id, { ...t, meta: ev.meta });
  else if (ev.t === "unsaved") set(id, { ...t, unsaved: ev.why });
  else if (ev.t === "item") {
    const i = t.items.findIndex((x) => x.id === ev.item.id);
    set(id, { ...t, items: i >= 0 ? t.items.map((x, j) => (j === i ? ev.item : x)) : [...t.items, ev.item] });
  }
}
weld?.thread.onEvent(apply);

export function ensure(id: string) {
  if (asked.has(id)) return;
  asked.add(id);
  void weld.thread.get(id).then((t) => set(id, t));
}
/** Take in a thread made elsewhere (a copy), so it shows at once. */
export function adopt(t: Thread) {
  asked.add(t.id);
  set(t.id, t);
}
export function useThread(id: string): Thread | undefined {
  ensure(id);
  useSyncExternalStore(
    (l) => {
      let s = mine.get(id);
      if (!s) mine.set(id, (s = new Set()));
      s.add(l);
      return () => s.delete(l);
    },
    () => versions.get(id) ?? 0,
  );
  return all.get(id);
}
/** Every thread, for what only needs each one's state and name: it does not stir while an agent writes. */
export function useThreads(): Map<string, Thread> {
  useSyncExternalStore((l) => (any.add(l), () => any.delete(l)), () => brief);
  return all;
}
export const peek = (id: string) => all.get(id);
/** Change a thread's settings here at once, and in the app's own copy. */
export function setMeta(id: string, change: Parameters<typeof weld.thread.set>[1]) {
  const t = all.get(id);
  if (t) set(id, { ...t, meta: { ...t.meta, ...change } });
  void weld.thread.set(id, change);
}

// ── other live things: what a terminal is running, what a page is showing ──
export interface Facts {
  /** A terminal's foreground program, a page's title. */
  label?: string;
  /** Busy: a program other than the shell is running, a page is loading. */
  busy?: boolean;
  /** The last line a terminal printed. */
  last?: string;
  dead?: boolean;
  webContentsId?: number;
}
const facts = new Map<string, Facts>();
let fv = 0;
const fl = new Set<() => void>();
export function setFacts(id: string, change: Facts) {
  const was = facts.get(id) ?? {};
  let same = true;
  for (const k of Object.keys(change) as (keyof Facts)[]) if (was[k] !== change[k]) same = false;
  if (same) return;
  facts.set(id, { ...was, ...change });
  fv += 1;
  for (const l of fl) l();
}
export function useFacts(): Map<string, Facts> {
  useSyncExternalStore((l) => (fl.add(l), () => fl.delete(l)), () => fv);
  return facts;
}
const EMPTY: Facts = {};
/** One thing's facts: only that thing is redrawn when they change. */
export function useFact(id: string): Facts {
  return useSyncExternalStore((l) => (fl.add(l), () => fl.delete(l)), () => facts.get(id) ?? EMPTY);
}
export const factsOf = (id: string) => facts.get(id);
export const dropFacts = (id: string) => facts.delete(id);
