// An agent drawing on the board: adding shapes, joining them, changing
// and taking away what it may. Its changes are a collaborator's (see
// store.applyForeign): they never move the person's view, take what the
// person holds, or enter the person's undo. What it draws is connected to
// its thread, so it keeps seeing its own work; what it may change is what
// its thread is connected to, and what it drew.
import { cleanShapes } from "@weld/canvas/clean";
import { bounds, endPoint, union } from "@weld/canvas/geometry";
import { ARROW_LABEL_W } from "@weld/canvas/render";
import type { Editor } from "@weld/canvas/editor";
import { laidMoments } from "@weld/canvas/editor";
import { compile } from "@weld/canvas/notation";
import type { Spec } from "@weld/canvas/notation";
import { KINDS } from "@weld/canvas/kinds";
import { isArrow, isLive, newId } from "@weld/canvas/types";
import type { Arrow, Box, Doc, Id, Moment, Rect, Shape } from "@weld/canvas/types";
import { hueOf, showVisit, threadBox } from "./place";
import { SMITH_COLOR, smiths, noteDrawn } from "./smith";
import { refsOn, resolve, seesOf, textOf } from "./refs";
import type { Ref } from "./refs";

/** Shapes an agent drew together, as `work:` keys each short enough for a board to keep, and small enough to be described
 *  whole (most often one). */
function workKeys(ids: Id[]): string[] {
  const out: string[] = [];
  let now: Id[] = [], len = 5;
  for (const id of ids) {
    if (now.length && (len + id.length + 1 > 19000 || now.length >= 300)) (out.push(`work:${now.join(",")}`), (now = []), (len = 5));
    now.push(id);
    len += id.length + 1;
  }
  if (now.length) out.push(`work:${now.join(",")}`);
  return out;
}

export interface DrawOps {
  add?: { ref?: string; kind?: string; text?: string; x?: number; y?: number; w?: number; h?: number; tone?: string; fill?: string; near?: string }[];
  connect?: { from: string; to: string; text?: string }[];
  change?: { id: string; text?: string; x?: number; y?: number; w?: number; h?: number; tone?: string; fill?: string; dx?: number; dy?: number }[];
  remove?: string[];
  /** A whole drawing, group or frame, duplicated: named by any #id in it, or by its key. */
  copy?: { of: string; dx?: number; dy?: number; ref?: string }[];
  /** More of something a drawing repeats (a region, a step, a row): one of its repeats, by its shapes' ids, copied `times`
   *  more along the row (what sits inside them too), each kept joined to what the repeats share, named in turn by `names`. */
  repeat?: { of: string[]; times?: number; names?: string[]; dx?: number; dy?: number }[];
  /** A whole diagram in the board's story notation (see canvas/notation.ts and `weld guide`): things, links and the beats
   *  it plays through; with `replace`, drawn again in place of a drawing this conversation made. */
  story?: { name: string; about?: string; things: unknown[]; links?: unknown[]; beats?: unknown[]; replace?: string };
  /** Remove or redraw shapes the person has changed since this agent drew them: only when the person asked for that. */
  force?: boolean;
}
const FIELDS: Record<string, Set<string>> = {
  add: new Set(["ref", "kind", "text", "x", "y", "w", "h", "tone", "fill", "near"]),
  connect: new Set(["from", "to", "text"]),
  change: new Set(["id", "text", "x", "y", "w", "h", "tone", "fill", "dx", "dy"]),
  copy: new Set(["of", "dx", "dy", "ref"]),
  repeat: new Set(["of", "times", "names", "dx", "dy"]),
};
const STORY = new Set(["name", "about", "things", "links", "beats", "replace"]);
const NOT_DRAWN = new Set(["thread", "terminal", "browser"]);
// The board's colours and fills. A colour asked for by its everyday name is the board's nearest; anything else is said, never drawn as ink.
const TONES = ["ink", "accent", "muted", "red", "green", "amber", "violet", "teal"], FILLS = ["none", "tint", "solid"];
const NEAR: Record<string, string> = { black: "ink", dark: "ink", default: "ink", blue: "accent", purple: "violet", indigo: "accent", grey: "muted", gray: "muted", light: "muted", orange: "amber", yellow: "amber", gold: "amber", brown: "amber", pink: "red", crimson: "red", cyan: "teal", lime: "green" };
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Whether the person made or changed a shape (the board marks it as they do: see Store.markEdits). Pages, terminals and
 *  conversations are not held by this: closing or moving one loses nothing of the person's. */
const theirs = (sh: Shape | undefined) => !!sh?.edited && !isLive(sh);

/** Apply what an agent asked for; answer what it made (by the names it gave), and anything it could not do. */
export function draw(editor: Editor, thread: Id, ops: DrawOps): { made: Record<string, Id>; changed: number; removed: number; problems: string[]; held?: number } {
  const s = editor.store, doc = s.doc;
  // (a smith has no card: it stands where it was summoned, and sees what it was summoned over)
  const smith = smiths.get(thread);
  const me = (smith ? { id: thread, kind: "thread", ...smith.at, live: { sees: smith.keys, drew: smith.drew } } : threadBox(editor, thread)) as Box | undefined;
  const problems: string[] = [];
  if (!me) return { made: {}, changed: 0, removed: 0, problems: ["this conversation is not on the board"] };
  // what this thread may change: what it is connected to, and what it drew (which it is connected to as it draws it)
  const mine = new Set<Id>();
  // what it may not reach, said in its own terms (a smith has no @: it was summoned over a selection)
  const OUT = smith ? "was not in what you were summoned over (the person selects what a smith may change)" : "is not connected to this conversation (the person connects things with @)";
  // (a smith's reach is what was selected when it was summoned, as it was then, and what it has made: never less because
  // it took a line away and a drawing came apart)
  if (smith) for (const id of smith.ids) if (doc.shapes[id]) mine.add(id);
  // (a smith is shown the drawings it was summoned over, but may change only what was selected: its keys grant nothing)
  // (what it was pointed at, with @ or by an arrow drawn to it)
  if (!smith) for (const k of seesOf(editor, thread)) for (const id of resolve(editor, k)?.ids ?? []) mine.add(id);
  // what its drawings were made of as this request began: still its own after a line in them is taken away
  const prior = new Set<Id>();
  if (!smith) for (const k of seesOf(editor, thread)) if (k.startsWith("drawing:") || k.startsWith("note:") || k.startsWith("work:")) for (const id of resolve(editor, k)?.ids ?? []) prior.add(id);
  for (const id of me.live?.drew ?? []) if (doc.shapes[id]) mine.add(id);
  // the pages and terminals it opened are its own too
  const opened = new Set<Id>();
  for (const id of doc.order) if ((doc.shapes[id] as Box | undefined)?.live?.by === thread) (mine.add(id), opened.add(id));
  mine.delete(thread);
  const made: Record<string, Id> = {};
  const tone = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.toLowerCase().trim();
    if (TONES.includes(t)) return t;
    if (NEAR[t]) return NEAR[t];
    problems.push(`not done: there is no colour "${v}" (colours: ${TONES.join(", ")})`);
    return undefined;
  };
  const fill = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    if (FILLS.includes(v)) return v;
    problems.push(`not done: there is no fill "${v}" (fills: ${FILLS.join(", ")})`);
    return undefined;
  };
  const idOf = (x: string | undefined) => {
    if (!x) return null;
    const t = x.replace(/^#/, "");
    return made[t] ?? (doc.shapes[t] ? t : null);
  };
  // where new shapes go when no place is given: in rows, beside the thread, clear of what is there
  let cx = me.x + me.w + 80, cy = me.y, rowH = 0;
  const others = doc.order.map((id) => doc.shapes[id]).filter((x): x is Box => !!x && !isArrow(x) && "w" in x);
  const free = (x: number, y: number, w: number, h: number) => !others.some((o) => x < o.x + o.w + 24 && x + w + 24 > o.x && y < o.y + o.h + 24 && y + h + 24 > o.y);
  const place = (w: number, h: number) => {
    for (let n = 0; n < 200; n++) {
      if (free(cx, cy, w, h)) {
        const at = { x: cx, y: cy };
        cx += w + 60;
        rowH = Math.max(rowH, h);
        if (cx > me.x + me.w + 80 + 1400) (cx = me.x + me.w + 80), (cy += rowH + 60), (rowH = 0);
        return at;
      }
      cx += 80;
      if (cx > me.x + me.w + 80 + 1400) (cx = me.x + me.w + 80), (cy += 100);
    }
    return { x: cx, y: cy };
  };
  const put: Shape[] = [];
  const fixed = new Set<Id>();
  // (so much at once is a mistake, not a drawing)
  const LIMIT = 200;
  for (const [k, list] of [["add", ops.add], ["connect", ops.connect], ["change", ops.change], ["remove", ops.remove], ["copy", ops.copy]] as const)
    if ((list?.length ?? 0) > LIMIT) problems.push(`only the first ${LIMIT} of ${list!.length} in "${k}" were done; send the rest in another call`);
  // a field it does not know is a mistake to say, never a shape drawn without it (a "label" for "text" made blank boxes)
  for (const k of Object.keys(ops)) if (!FIELDS[k] && k !== "remove" && k !== "story" && k !== "force") problems.push(`unknown step "${k}" (use add, connect, change, remove, copy, repeat, story)`);
  const known = <T extends object>(step: string, list: T[] | undefined) =>
    list?.filter((o) => {
      const bad = o && typeof o === "object" ? Object.keys(o).filter((k) => !FIELDS[step]!.has(k)) : ["(not an object)"];
      if (bad.length) problems.push(`not done: ${step} ${JSON.stringify(o).slice(0, 80)}: unknown field${bad.length > 1 ? "s" : ""} ${bad.map((b) => `"${b}"`).join(", ")} (fields: ${[...FIELDS[step]!].join(", ")})`);
      return !bad.length;
    });
  const asked = ops.story, force = ops.force === true;
  // (a smith works for the person, so what it does is theirs already: only an agent's own drawing is held back)
  const guard = !force && !smith;
  // (how many things were left as the person left them: said as a failure, so a script that goes on to draw again stops)
  let heldN = 0;
  // what the person has made or changed counts too when it would go with something taken away: a line of theirs to it
  const liveEnded = (w: Shape | undefined) => !!w && isArrow(w) && [w.a.bind?.id, w.b.bind?.id].some((e) => e && isLive(doc.shapes[e]));
  const heldBy = (id: Id) => (theirs(doc.shapes[id]) && !liveEnded(doc.shapes[id])) || doc.order.some((a) => { const w = doc.shapes[a]; return !!w && isArrow(w) && theirs(w) && (w.a.bind?.id === id || w.b.bind?.id === id) && ![w.a.bind?.id, w.b.bind?.id].some((e) => e && isLive(doc.shapes[e])); });
  ops = { story: asked, add: known("add", ops.add?.slice(0, LIMIT)), connect: known("connect", ops.connect?.slice(0, LIMIT)), change: known("change", ops.change?.slice(0, LIMIT)), remove: ops.remove?.slice(0, LIMIT), copy: known("copy", ops.copy?.slice(0, 10)), repeat: known("repeat", ops.repeat?.slice(0, 10)) };
  for (const a of ops.add ?? []) {
    const kind = a.kind ?? "rect";
    // (the kinds the board no longer offers stay on boards that have them, but are not drawn anew)
    if (NOT_DRAWN.has(kind) || (kind !== "text" && (!(kind in KINDS) || KINDS[kind as keyof typeof KINDS].group === "Legacy"))) {
      problems.push(`cannot draw a "${kind}" (kinds: text, ${Object.keys(KINDS).filter((k) => !NOT_DRAWN.has(k) && KINDS[k as keyof typeof KINDS].group !== "Legacy").join(", ")})`);
      continue;
    }
    const k = kind === "text" ? { w: Math.max(40, (a.text?.length ?? 4) * 8), h: 24 } : KINDS[kind as keyof typeof KINDS];
    // the size asked for (a small drawing laid out small stays so), else the board's own shape of that kind; never too
    // narrow for its words on one or two lines, nor too small to see
    const words = a.text?.split("\n")[0] ?? "";
    const room = kind === "text" ? 0 : Math.min(320, words.length * 8.5 + 40);
    const w = Math.max(num(a.w) ? Math.max(a.w, 40) : k.w, room), h = num(a.h) ? Math.max(a.h, kind === "text" ? 16 : 40) : k.h;
    let at: { x: number; y: number };
    const near = idOf(a.near);
    if (num(a.x) && num(a.y)) at = { x: a.x, y: a.y };
    else if (near) {
      // beside it: to the right, below, to the left, above, then further out, wherever is clear
      const n = (doc.shapes[near] ?? put.find((p) => p.id === near)) as Box | undefined;
      let found: { x: number; y: number } | null = null;
      if (n)
        for (let ring = 1; ring < 12 && !found; ring++)
          for (const [x, y] of [[n.x + n.w + 80 * ring, n.y], [n.x, n.y + n.h + 60 * ring], [n.x - w - 80 * ring, n.y], [n.x, n.y - h - 60 * ring]] as const)
            if (!found && free(x, y, w, h)) found = { x, y };
      at = found ?? place(w, h);
    } else at = place(w, h);
    const id = newId();
    const raw = kind === "text"
      ? { id, kind: "text", x: at.x, y: at.y, w, h, text: a.text ?? "", size: 16, tone: tone(a.tone) ?? "ink" }
      : { id, kind, x: at.x, y: at.y, w, h, text: a.text ?? "", tone: tone(a.tone) ?? "ink", fill: fill(a.fill) ?? "none" };
    const [clean] = cleanShapes([raw]);
    if (!clean) {
      problems.push(`could not draw ${JSON.stringify(a.text ?? kind)}`);
      continue;
    }
    put.push(clean);
    if (num(a.x) && num(a.y)) fixed.add(id);
    others.push(clean as Box);
    if (a.ref) made[a.ref] = id;
    made[id] = id;
    mine.add(id);
  }
  // A drawing given its own places is kept as drawn, but never put down on top of what is there: if it would cover
  // anything, the whole of it moves (its shapes keep their places to each other) to the nearest clear space beside the thread.
  const placed = put.filter((p) => fixed.has(p.id)) as Box[];
  // Spread out if crowded: the shapes keep their places to one another, with room between them for lines and their words.
  if (placed.length > 1) {
    let tight = Infinity;
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const p = placed[i]!, q = placed[j]!;
        const gx = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w)), gy = Math.max(q.y - (p.y + p.h), p.y - (q.y + q.h));
        tight = Math.min(tight, Math.max(gx, gy));
      }
    // (only shapes on top of one another: a drawing laid out close on purpose keeps its spacing)
    if (tight < 0) {
      // shapes put exactly on one another are first set side by side, so spreading can part them
      const seen = new Map<string, number>();
      for (const p of placed) {
        const k = `${Math.round(p.x)},${Math.round(p.y)}`, n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        if (n) p.x += n * (p.w + 40);
      }
      const ox = Math.min(...placed.map((p) => p.x)), oy = Math.min(...placed.map((p) => p.y));
      // each shape's middle moves out from the corner of the drawing until the closest two have 140 between them
      for (let f = 1.15; f < 6; f += 0.15) {
        const at = placed.map((p) => ({ p, cx: ox + (p.x + p.w / 2 - ox) * f, cy: oy + (p.y + p.h / 2 - oy) * f }));
        let ok = true;
        for (let i = 0; i < at.length && ok; i++)
          for (let j = i + 1; j < at.length && ok; j++) {
            const a = at[i]!, b = at[j]!;
            const gx = Math.abs(a.cx - b.cx) - (a.p.w + b.p.w) / 2, gy = Math.abs(a.cy - b.cy) - (a.p.h + b.p.h) / 2;
            if (Math.max(gx, gy) < 140) ok = false;
          }
        if (ok || f >= 5.85) {
          for (const a of at) ((a.p.x = Math.round(a.cx - a.p.w / 2)), (a.p.y = Math.round(a.cy - a.p.h / 2)));
          break;
        }
      }
    }
  }
  if (placed.length) {
    const x0 = Math.min(...placed.map((p) => p.x)), y0 = Math.min(...placed.map((p) => p.y));
    const x1 = Math.max(...placed.map((p) => p.x + p.w)), y1 = Math.max(...placed.map((p) => p.y + p.h));
    const ours = new Set(put.map((p) => p.id));
    const blockers = others.filter((o) => !ours.has(o.id));
    const clear = (dx: number, dy: number) => !blockers.some((o) => x0 + dx < o.x + o.w + 40 && x1 + dx + 40 > o.x && y0 + dy < o.y + o.h + 40 && y1 + dy + 40 > o.y);
    if (!clear(0, 0)) {
      let best: [number, number] | null = null;
      // looked for beside the thread first, then below it, nearest first
      for (let ring = 0; ring < 40 && !best; ring++)
        for (const [bx, by] of [[me.x + me.w + 80 + ring * 120, me.y], [me.x, me.y + me.h + 80 + ring * 120], [me.x + me.w + 80 + ring * 120, me.y + me.h + 80]] as const)
          if (!best && clear(bx - x0, by - y0)) best = [bx - x0, by - y0];
      // nowhere near is clear: below everything on the board, where nothing can be
      if (!best) {
        const below = Math.max(...blockers.map((o) => o.y + o.h), me.y + me.h) + 120;
        best = [me.x - x0, below - y0];
      }
      for (const p of placed) ((p.x += best[0]), (p.y += best[1]));
      problems.push(`note: the places given would have covered what is on the board, so the new shapes were moved together by ${Math.round(best[0])},${Math.round(best[1])} (now from ${Math.round(x0 + best[0])},${Math.round(y0 + best[1])}); weld look shows where`);
    }
  }
  // Copies: the whole of what a shape belongs to (its drawing, its group, or the frame and what is in it), new ids throughout,
  // lines kept between the copies, put beside the original clear of everything (or moved by dx, dy as asked)
  const copyKeys: string[] = [];
  const copied = new Set<Id>();
  for (const c of ops.copy ?? []) {
    let src: Ref | null = null;
    const sid = idOf(c.of);
    if (sid) {
      // what this conversation was connected to, and that holds the shape, is what is meant: the largest such (the whole
      // diagram rather than one region in it); only failing that, what the shape itself belongs to on the board
      const given = (me.live?.sees ?? []).map((k) => resolve(editor, k)).filter((r): r is Ref => !!r && r.kind !== "thread" && r.kind !== "terminal" && r.kind !== "browser" && r.ids.includes(sid));
      const s0 = doc.shapes[sid];
      const frameHit = s0?.kind === "frame" || s0?.kind === "boundary";
      const rank = (k: string) => (k === "frame" ? (frameHit ? 0 : 3) : k === "drawing" || k === "group" ? 1 : 2);
      src = given.sort((a, b) => b.ids.length - a.ids.length)[0] ?? refsOn(editor, thread).filter((r) => r.ids.includes(sid)).sort((a, b) => rank(a.kind) - rank(b.kind))[0] ?? resolve(editor, `note:${sid}`);
    } else src = resolve(editor, c.of);
    if (!src) {
      problems.push(`cannot copy ${c.of}: it is not on the board`);
      continue;
    }
    const members = src.ids.filter((x) => doc.shapes[x] && !isLive(doc.shapes[x]));
    if (!members.length || members.some((x) => !mine.has(x))) {
      problems.push(`cannot copy ${c.of}: it ${OUT}`);
      continue;
    }
    const map = new Map<Id, Id>(members.map((x) => [x, newId()]));
    const groups = new Map<Id, Id>();
    for (const x of members) {
      const g = (doc.shapes[x] as { group?: Id }).group;
      if (g && !groups.has(g)) groups.set(g, newId());
    }
    const shapes = members.map((x) => doc.shapes[x]!);
    const solid = shapes.filter((x) => !isArrow(x)) as Box[];
    const x0 = Math.min(...solid.map((b) => b.x)), y0 = Math.min(...solid.map((b) => b.y));
    const x1 = Math.max(...solid.map((b) => b.x + b.w)), y1 = Math.max(...solid.map((b) => b.y + b.h));
    let dx = num(c.dx) ? c.dx : NaN, dy = num(c.dy) ? c.dy : NaN;
    const clearAt = (ox: number, oy: number) => !others.some((o) => x0 + ox < o.x + o.w + 40 && x1 + ox + 40 > o.x && y0 + oy < o.y + o.h + 40 && y1 + oy + 40 > o.y);
    if (Number.isNaN(dx) || Number.isNaN(dy) || !clearAt(dx, dy)) {
      const w = x1 - x0, h = y1 - y0;
      let found: [number, number] | null = null;
      for (let ring = 1; ring < 30 && !found; ring++)
        for (const [ox, oy] of [[(w + 80) * ring, 0], [0, (h + 80) * ring], [(w + 80) * ring, (h + 80) * ring]] as const)
          if (!found && clearAt(ox, oy)) found = [ox, oy];
      [dx, dy] = found ?? [0, Math.max(...others.map((o) => o.y + o.h)) + 120 - y0];
    }
    const clones = shapes.map((sh) => {
      const id = map.get(sh.id)!;
      const g = (sh as { group?: Id }).group;
      const base = { ...sh, id, ...(g ? { group: groups.get(g)! } : {}) } as Shape;
      if (!isArrow(sh)) return { ...base, x: (sh as Box).x + dx, y: (sh as Box).y + dy } as Shape;
      // an end on a copied shape follows the copy; a free end, or one on something not copied, is left free where it shows
      const re = (e: Arrow["a"]) => {
        if (e.bind && map.has(e.bind.id)) return { ...e, x: e.x + dx, y: e.y + dy, bind: { ...e.bind, id: map.get(e.bind.id)! } };
        const p = endPoint(doc, e);
        return { x: p.x + dx, y: p.y + dy };
      };
      const via = sh.via?.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      return { ...base, a: re(sh.a), b: re(sh.b), ...(via ? { via } : {}) } as Shape;
    }).filter((x): x is Shape => !!x);
    const clean = cleanShapes(clones);
    for (const x of clean) {
      put.push(x);
      mine.add(x.id);
      copied.add(x.id);
      if (!isArrow(x)) others.push(x as Box);
    }
    const first = clean.find((x) => !isArrow(x));
    if (first && c.ref) made[c.ref] = first.id;
    if (first) made[`copied ${src.label} (${src.kind}, ${clean.filter((x) => !isArrow(x)).length} shapes, ${clean.filter((x) => isArrow(x)).length} lines); the copy starts at`] = first.id;
    if (groups.size === 1 && src.kind === "group") copyKeys.push(`group:${[...groups.values()][0]}`);
    else if (src.kind === "frame") copyKeys.push(`frame:${map.get(src.ids[0]!) ?? first?.id}`);
    else {
      // (every piece of it, in keys a board keeps)
      const ids = clean.filter((x) => !isArrow(x)).map((x) => x.id);
      copyKeys.push(...workKeys(ids));
    }
  }
  // Repeats: more of what a drawing has several of. One of them (its shapes, what sits inside them, its lines) is copied
  // on along its row, at the row's own spacing, keeping the drawing's group; a line from it to something the repeats
  // share (a control plane) is copied still joined to that.
  const sceneAdds = new Map<Id, Map<string, Shape[]>>();
  for (const r of ops.repeat ?? []) {
    const what = JSON.stringify(r.of).slice(0, 80);
    const given = (Array.isArray(r.of) ? r.of : []).map((x) => idOf(String(x))).filter((x): x is Id => !!x && !!doc.shapes[x] && !isArrow(doc.shapes[x]!) && !isLive(doc.shapes[x]!));
    if (!given.length) {
      problems.push(`cannot repeat ${what}: none of it is on the board (name its shapes by #id)`);
      continue;
    }
    if (given.some((x) => !mine.has(x))) {
      problems.push(`cannot repeat ${what}: it ${OUT}`);
      continue;
    }
    const boxes = given.map((x) => doc.shapes[x] as Box);
    const unit = new Set<Id>(given);
    for (const id of doc.order) {
      const sh = doc.shapes[id];
      if (!sh || unit.has(id) || isArrow(sh) || isLive(sh) || !mine.has(id)) continue;
      const b = sh as unknown as Box;
      if (boxes.some((o) => b.x >= o.x && b.y >= o.y && b.x + b.w <= o.x + o.w && b.y + b.h <= o.y + o.h)) unit.add(id);
    }
    const solid = [...unit].map((x) => doc.shapes[x] as Box);
    const x0 = Math.min(...solid.map((b) => b.x)), x1 = Math.max(...solid.map((b) => b.x + b.w));
    // (a line from it to something it may not change is not copied: repeating is no way round what may be joined)
    const touching = doc.order.map((id) => doc.shapes[id]).filter((x): x is Arrow => !!x && isArrow(x) && (!!(x.a.bind && unit.has(x.a.bind.id)) || !!(x.b.bind && unit.has(x.b.bind.id))));
    const outside = (l: Arrow) => [l.a.bind?.id, l.b.bind?.id].filter((e): e is Id => !!e && !unit.has(e));
    const lines = touching.filter((l) => outside(l).every((e) => mine.has(e)));
    const left = touching.filter((l) => !lines.includes(l)).flatMap(outside).map((e) => (doc.shapes[e] as Box | undefined)?.text || "a shape");
    if (left.length) problems.push(`note: lines to ${[...new Set(left)].slice(0, 4).join(", ")} were not copied: ${smith ? "they were not in what you were summoned over" : "those are not connected to this conversation"}`);
    // its row: where the like of it stand. The shape it shares its words with (WORKER) marks the others; else its own kind.
    // (looked for only in its own drawing: its group, or what this agent may change; never across the board)
    const g = (doc.shapes[given[0]!] as { group?: Id }).group;
    const sc = g ? doc.scenes?.[g] : undefined;
    const all = doc.order.map((id) => doc.shapes[id] as Box).filter((b) => b && !isArrow(b) && "w" in b && !unit.has(b.id) && (g ? (b as { group?: Id }).group === g : mine.has(b.id)));
    const twin = boxes.find((b) => b.text && all.some((o) => o.kind === b.kind && o.text === b.text)) ?? boxes[0]!;
    // (alike by kind and words, as every WORKER is; where no other has its words, as steps each named differently, by kind)
    const sameWords = !!twin.text && all.some((o) => o.kind === twin.kind && o.text === twin.text);
    const like = (o: Box) => o.kind === twin.kind && (!sameWords || o.text === twin.text);
    const row = [twin, ...all.filter((o) => like(o) && Math.abs(o.y - twin.y) < 8)].sort((a, b) => a.x - b.x);
    const col = [twin, ...all.filter((o) => like(o) && Math.abs(o.x - twin.x) < 8)].sort((a, b) => a.y - b.y);
    const gaps = (xs: number[]) => xs.slice(1).map((v, i) => v - xs[i]!).filter((d) => d > 0);
    let sx = 0, sy = 0, bx = 0, by = 0;
    if (num(r.dx) || num(r.dy)) (sx = num(r.dx) ? r.dx : 0), (sy = num(r.dy) ? r.dy : 0), (bx = 0), (by = 0);
    else if (row.length > 1) (sx = Math.min(...gaps(row.map((b) => b.x)))), (bx = row[row.length - 1]!.x - twin.x);
    else if (col.length > 1) (sy = Math.min(...gaps(col.map((b) => b.y)))), (by = col[col.length - 1]!.y - twin.y);
    else sx = x1 - x0 + 56;
    // the name it is told apart by (the city, where every worker says WORKER): its one shape with words no other shape has
    const named = [...unit].map((x) => doc.shapes[x] as Box).find((b) => b.text && !all.some((o) => o.text === b.text));
    const times = Math.max(1, Math.min(20, Math.round(num(r.times) ? r.times : (r.names?.length ?? 1))));
    const firsts: Id[] = [];
    const ours = new Set<Id>();
    // A line between it and another of its like (a step and the step beside it) makes a chain: each new one is joined from
    // the one before it (the last of the row, then each new one in turn), in the chain's own direction. A line into it from
    // a like one is that join; a line out of it to a like one is only used when there is no line in (it is turned to come
    // from the one before). Any other line is to something they all share, and stays joined to that.
    const peers = new Set([...(row.length > 1 ? row : col)].filter((b) => b !== twin).map((b) => b.id));
    const last = (row.length > 1 ? row : col.length > 1 ? col : [twin]).slice(-1)[0]!.id;
    const isPeer = (e: Arrow["a"]) => !!e.bind && peers.has(e.bind.id);
    const inUnit = (e: Arrow["a"]) => !!e.bind && unit.has(e.bind.id);
    // the chain's direction: along the row (or column) when its join runs from the earlier to the later, else back along it
    const order = (row.length > 1 ? row : col).map((b) => b.id);
    const joins = lines.filter((l) => (isPeer(l.a) && inUnit(l.b)) || (inUnit(l.a) && isPeer(l.b)));
    const j0 = joins[0];
    const along = j0 ? (order.indexOf((isPeer(j0.a) ? j0.a : j0.b).bind!.id) < order.indexOf(twin.id)) === isPeer(j0.a) : true;
    type Plan = "keep" | "join" | "drop";
    const plan = (l: Arrow): Plan => (l === j0 || (j0 && l.id === j0.id) ? "join" : joins.some((x) => x.id === l.id) ? "drop" : "keep");
    // each side of a join faces the other: across a row, right side to left side; down a column, bottom to top
    const across = row.length > 1 || col.length <= 1;
    const out_ = across ? { ax: 1, ay: 0.5 } : { ax: 0.5, ay: 1 }, in_ = across ? { ax: 0, ay: 0.5 } : { ax: 0.5, ay: 0 };
    const maps: Map<Id, Id>[] = [];
    const before = (i: number) => (i === 0 ? last : maps[i - 1]!.get(twin.id)!);
    const at = (to: Id, anchor: { ax: number; ay: number }) => {
      const T = (doc.shapes[to] ?? put.find((p) => p.id === to)) as Box | undefined;
      return T ? { x: T.x + T.w * anchor.ax, y: T.y + T.h * anchor.ay, bind: { id: to, ax: anchor.ax, ay: anchor.ay } } : null;
    };
    // one line of the i-th copy, from a version `l` of the line copied (on the board, or in some state)
    const lineFor = (l: Arrow, i: number, map: Map<Id, Id>, dx: number, dy: number): Arrow | null => {
      const p = plan(l);
      if (p === "drop") return null;
      const mine_ = (e: Arrow["a"]) => ({ ...e, x: e.x + dx, y: e.y + dy, bind: { ...e.bind!, id: map.get(e.bind!.id)! } });
      if (p === "join") {
        if (i === 0 && !mine.has(last)) return null;
        // between the one before (earlier along the row) and the new one, in the chain's direction
        const own = (inUnit(l.a) ? l.a : l.b).bind!.id;
        const prev = at(before(i), out_), next = { x: 0, y: 0, bind: { id: map.get(own)!, ...in_ } };
        if (!prev) return null;
        const { via: _v, ...rest } = l;
        return (along ? { ...rest, a: prev, b: next } : { ...rest, a: { ...next, bind: { ...next.bind, ...out_, ax: in_.ax, ay: in_.ay } }, b: { ...prev, bind: { ...prev.bind, ax: out_.ax, ay: out_.ay } } }) as Arrow;
      }
      return { ...l, a: inUnit(l.a) ? mine_(l.a) : l.a, b: inUnit(l.b) ? mine_(l.b) : l.b } as Arrow;
    };
    // a drawing that plays: the new ones are put into each of its states (by the state's own id) as the one copied is there
    for (let i = 0; i < times; i++) {
      const dx = bx + sx * (i + 1), dy = by + sy * (i + 1);
      const map = new Map<Id, Id>([...unit].map((x) => [x, newId()]));
      maps.push(map);
      const clones: Shape[] = [...unit].map((x) => {
        const b = doc.shapes[x] as Box;
        const name = b === named && r.names?.[i] ? { text: String(r.names[i]).slice(0, 200) } : {};
        return { ...b, id: map.get(x)!, x: b.x + dx, y: b.y + dy, ...name } as Shape;
      });
      const lineIds = new Map<Id, Id>();
      for (const l of lines) {
        const made_ = lineFor(l, i, map, dx, dy);
        if (!made_) continue;
        const id = newId();
        lineIds.set(l.id, id);
        const inside = inUnit(l.a) && inUnit(l.b);
        const { via, ...rest } = made_;
        clones.push({ ...rest, id, ...(inside && via ? { via: via.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}) } as Shape);
      }
      // (checked with what the lines join, so they stay joined)
      const ends = new Map<Id, Shape>();
      for (const c of clones) if (isArrow(c)) for (const e of [c.a, c.b]) if (e.bind && ![...map.values()].includes(e.bind.id)) { const T = doc.shapes[e.bind.id] ?? put.find((p) => p.id === e.bind!.id); if (T) ends.set(T.id, T); }
      const clean = cleanShapes([...ends.values(), ...clones]).filter((x) => !ends.has(x.id));
      for (const x of clean) {
        put.push(x);
        mine.add(x.id);
        ours.add(x.id);
        if (!isArrow(x)) others.push(x as Box);
      }
      if (sc && g) {
        const byState = sceneAdds.get(g) ?? new Map<string, Shape[]>();
        for (const m of sc.moments) {
          const list = byState.get(m.id) ?? [];
          byState.set(m.id, list);
          // (the state on show: the copies as they are on the board)
          if (m === sc.moments[sc.at]) {
            list.push(...clean);
            continue;
          }
          const there = new Map(m.shapes.map((sh) => [sh.id, sh]));
          for (const x of unit) {
            // (not in that state: the copy is there too, hidden, so it is known to every state and appears in none it should not)
            const b = (there.get(x) ?? { ...(doc.shapes[x] as Box), away: true }) as Box;
            const name = b.id === named?.id && r.names?.[i] ? { text: String(r.names[i]).slice(0, 200) } : {};
            list.push({ ...b, id: map.get(x)!, x: b.x + dx, y: b.y + dy, ...name } as Shape);
          }
          for (const l of lines) {
            const id = lineIds.get(l.id);
            if (!id) continue;
            const t = there.get(l.id) as Arrow | undefined;
            // (in that state the line may join something else: what it may not reach, it is hidden there instead)
            const reach = (e: Arrow["a"]) => !e.bind || unit.has(e.bind.id) || peers.has(e.bind.id) || mine.has(e.bind.id);
            const v = t && reach(t.a) && reach(t.b) ? lineFor(t, i, map, dx, dy) : null;
            const board = clean.find((c) => c.id === id) as Arrow | undefined;
            if (!board) continue;
            list.push(v ? ({ ...v, id, via: undefined } as Shape) : ({ ...board, away: true } as Shape));
          }
        }
        sceneAdds.set(g, byState);
      }
      const first = named ? map.get(named.id) : map.get(given[0]!);
      if (first) firsts.push(first);
      if (first && r.names?.[i]) made[String(r.names[i])] = first;
    }
    made[`repeated ${named?.text || twin.text || twin.kind} ${times} time${times > 1 ? "s" : ""} (${unit.size} shapes and ${lines.length} lines each); the first new one is`] = firsts[0]!;
    // said when the row runs into something
    const hit = put.filter((p) => ours.has(p.id) && !isArrow(p)).map((p) => p as Box).flatMap((b) => all.filter((o) => !like(o) && !unit.has(o.id) && o.kind !== "frame" && o.kind !== "boundary" && b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h));
    if (hit.length) problems.push(`to fix: the new ones run into ${[...new Set(hit.map((o) => o.text || o.kind))].slice(0, 4).join(", ")}: move those, or the new ones (weld look shows where)`);
  }
  const box = (id: Id) => (put.find((p) => p.id === id) ?? doc.shapes[id]) as Box | undefined;
  for (const c of ops.connect ?? []) {
    const a = idOf(c.from), b = idOf(c.to);
    if (!a || !b) {
      problems.push(`cannot join ${c.from} to ${c.to}: ${!a ? c.from : c.to} is not on the board`);
      continue;
    }
    const A = box(a), B = box(b);
    // (only between shapes it may change: joining something to its own drawing is not a way to take it over)
    if (!mine.has(a) || !mine.has(b)) {
      problems.push(`cannot join ${c.from} to ${c.to}: ${!mine.has(a) ? c.from : c.to} ${OUT}`);
      continue;
    }
    if (!A || !B || NOT_DRAWN.has(A.kind) || NOT_DRAWN.has(B.kind)) {
      problems.push(`cannot join ${c.from} to ${c.to}`);
      continue;
    }
    // the ends meet the sides that face each other
    const dx = B.x + B.w / 2 - (A.x + A.w / 2), dy = B.y + B.h / 2 - (A.y + A.h / 2);
    const across = Math.abs(dx) >= Math.abs(dy);
    const ea = across ? { ax: dx > 0 ? 1 : 0, ay: 0.5 } : { ax: 0.5, ay: dy > 0 ? 1 : 0 };
    const eb = across ? { ax: dx > 0 ? 0 : 1, ay: 0.5 } : { ax: 0.5, ay: dy > 0 ? 0 : 1 };
    const arrow: Arrow = {
      id: newId(), kind: "arrow", text: c.text ?? "", route: "straight", heads: "end", tone: "ink",
      a: { x: A.x + A.w * ea.ax, y: A.y + A.h * ea.ay, bind: { id: a, ...ea } },
      b: { x: B.x + B.w * eb.ax, y: B.y + B.h * eb.ay, bind: { id: b, ...eb } },
    } as Arrow;
    // (checked together with what it joins: a line is only kept bound to shapes the check can see)
    const clean = cleanShapes([A, B, arrow]).find((x) => x.id === arrow.id);
    if (clean && isArrow(clean) && clean.a.bind && clean.b.bind) (put.push(clean), mine.add(clean.id));
    else problems.push(`could not join ${c.from} to ${c.to}`);
  }
  // Several lines between the same two shapes (a request and its response) are spread along the sides that face,
  // so none lies on another and every label shows. A line already on the board between them keeps its place.
  {
    const pair = (x: Arrow) => [x.a.bind!.id, x.b.bind!.id].sort().join("|");
    const fresh = put.filter((x): x is Arrow => isArrow(x) && !!x.a.bind && !!x.b.bind && !copied.has(x.id));
    const byPair = new Map<string, Arrow[]>();
    for (const x of fresh) (byPair.get(pair(x)) ?? byPair.set(pair(x), []).get(pair(x))!).push(x);
    for (const [k, list] of byPair) {
      const before = doc.order.filter((id) => { const x = doc.shapes[id]; return !!x && isArrow(x) && !!x.a.bind && !!x.b.bind && pair(x) === k; }).length;
      const n = list.length + before;
      if (n < 2) continue;
      const slots = Array.from({ length: n }, (_, i) => (i + 1) / (n + 1)).sort((p, q) => Math.abs(p - 0.5) - Math.abs(q - 0.5)).slice(before).sort();
      list.forEach((x, i) => {
        const f = slots[i]!;
        for (const end of [x.a, x.b]) {
          const B = box(end.bind!.id)!;
          // (the same fraction on both ends, measured the same way, keeps each line straight)
          if (end.bind!.ay === 0.5 && (end.bind!.ax === 0 || end.bind!.ax === 1)) Object.assign(end.bind!, { ay: f }), (end.y = B.y + B.h * f);
          else if (end.bind!.ax === 0.5) Object.assign(end.bind!, { ax: f }), (end.x = B.x + B.w * f);
        }
      });
    }
    // and a label too wide for the room between its shapes is said, so the agent can move them apart
    for (const x of fresh) {
      if (!x.text) continue;
      const A = box(x.a.bind!.id), B = box(x.b.bind!.id);
      if (!A || !B) continue;
      const along = Math.abs(x.a.x - x.b.x) >= Math.abs(x.a.y - x.b.y);
      const room = Math.hypot(x.a.x - x.b.x, x.a.y - x.b.y) - 24;
      const wide = along ? Math.min(ARROW_LABEL_W, x.text.length * 7 + 12) : 18;
      if (wide > room) problems.push(`to fix: the label "${x.text}" needs about ${Math.round(wide + 24)} of room between ${A.text || A.kind} and ${B.text || B.kind}, which are ${Math.max(0, Math.round(room + 24))} apart: move them apart or shorten it`);
    }
  }
  // Only what was asked for is changed (a rename is a rename, and leaves the shape's place in the person's history alone);
  // several changes to one shape build on one another.
  const patches = new Map<Id, Record<string, unknown>>();
  const drew = new Set(me.live?.drew ?? []);
  for (const c of ops.change ?? []) {
    const id = idOf(c.id);
    if (!id) {
      problems.push(`${c.id} is not on the board`);
      continue;
    }
    if (!mine.has(id)) {
      problems.push(`${c.id} ${OUT}, so it was left as it is`);
      continue;
    }
    const base = doc.shapes[id] ?? put.find((p) => p.id === id);
    if (!base) {
      problems.push(`${c.id} cannot be changed this way`);
      continue;
    }
    // a page, a terminal or another conversation is moved and sized, nothing more
    if (isLive(base)) {
      const b = base as Box, so: Record<string, unknown> = { ...(patches.get(id) ?? {}) };
      const was = { ...b, ...so } as Box;
      if (num(c.x)) so.x = c.x;
      if (num(c.y)) so.y = c.y;
      if (num(c.dx)) so.x = (num(c.x) ? c.x : was.x) + c.dx;
      if (num(c.dy)) so.y = (num(c.y) ? c.y : was.y) + c.dy;
      if (num(c.w) && c.w >= 240) so.w = c.w;
      if (num(c.h) && c.h >= 160) so.h = c.h;
      // kept on the board: never so far off or so large that the board would refuse it when it is next opened
      const lim = (v: unknown, m: number) => (typeof v === "number" ? Math.max(-m, Math.min(m, v)) : v);
      if (so.x !== undefined) so.x = lim(so.x, 1e6);
      if (so.y !== undefined) so.y = lim(so.y, 1e6);
      if (so.w !== undefined) so.w = lim(so.w, 20000);
      if (so.h !== undefined) so.h = lim(so.h, 20000);
      if (Object.keys(so).length && !cleanShapes([{ ...b, ...so }]).length) problems.push(`${c.id} cannot go there`);
      else if (Object.keys(so).length) patches.set(id, so);
      else problems.push(`${c.id} is ${b.kind === "browser" ? "a page" : b.kind === "terminal" ? "a terminal" : "a conversation"}: it can be moved (x, y, dx, dy) and sized (w at least 240, h at least 160), nothing else`);
      continue;
    }
    const so = { ...(patches.get(id) ?? {}) };
    const was = { ...base, ...so } as Shape;
    if (typeof c.text === "string") so.text = c.text;
    if (!isArrow(was)) {
      const b = was as unknown as Box;
      // a frame the person connected is where this agent's reach ends: it may not move or stretch one it did not draw
      const fence = (b.kind === "frame" || b.kind === "boundary") && !drew.has(id) && !put.some((p) => p.id === id);
      const geo = num(c.x) || num(c.y) || num(c.dx) || num(c.dy) || num(c.w) || num(c.h);
      if (fence && geo) problems.push(`${c.id} is a frame you were given, so it keeps its place and size`);
      else {
        if (num(c.x)) so.x = c.x;
        if (num(c.y)) so.y = c.y;
        if (num(c.dx)) so.x = (num(c.x) ? c.x : b.x) + c.dx;
        if (num(c.dy)) so.y = (num(c.y) ? c.y : b.y) + c.dy;
        if (num(c.w) && c.w > 4) so.w = c.w;
        if (num(c.h) && c.h > 4) so.h = c.h;
        // a shape moved under a page, a terminal or a conversation would be hidden by it: said, so it is moved on
        if (geo) {
          const n = (v: unknown, d: number) => (typeof v === "number" ? v : d);
          const r = { x: n(so.x, b.x), y: n(so.y, b.y), w: n(so.w, b.w), h: n(so.h, b.h) };
          const under = others.find((o) => o.id !== id && isLive(o) && r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
          if (under) problems.push(`to fix: ${c.id} now sits under ${under.kind === "browser" ? "a page" : under.kind === "terminal" ? "a terminal" : "a conversation"} at ${Math.round(under.x)},${Math.round(under.y)} (${Math.round(under.w)}×${Math.round(under.h)}), which hides it: move it clear`);
        }
      }
      const f = fill(c.fill);
      if (f) so.fill = f;
    }
    const t = tone(c.tone);
    if (t) so.tone = t;
    // checked as the whole shape it will be (a line with the shapes it joins, so it stays joined); only the asked-for parts are kept
    const whole = { ...base, ...so } as Shape;
    const with_ = isArrow(whole) ? [whole.a.bind?.id, whole.b.bind?.id].map((e) => (e ? (doc.shapes[e] ?? put.find((p) => p.id === e)) : undefined)).filter((x): x is Shape => !!x) : [];
    const ok = cleanShapes([...with_, whole]).find((x) => x.id === id);
    if (!ok) {
      problems.push(`could not change ${c.id} that way`);
      continue;
    }
    const kept: Record<string, unknown> = {};
    for (const k of Object.keys(so)) kept[k] = (ok as unknown as Record<string, unknown>)[k];
    patches.set(id, kept);
  }
  // (a shape made in this request and changed in it too: the change is folded into it, and into each state's version of it)
  for (const [id, change] of [...patches]) {
    const i = put.findIndex((p) => p.id === id);
    if (i < 0) continue;
    const was = put[i]!;
    const shift = (sh: Shape): Shape => {
      if (isArrow(sh)) return { ...sh, ...change } as Shape;
      const c = change as Partial<Box>, b = sh as Box, w0 = was as Box;
      const { x, y, ...rest } = c;
      return { ...b, ...rest, x: typeof x === "number" ? b.x + (x - w0.x) : b.x, y: typeof y === "number" ? b.y + (y - w0.y) : b.y } as Shape;
    };
    put[i] = shift(was);
    for (const byState of sceneAdds.values()) for (const [k, list] of byState) byState.set(k, list.map((sh) => (sh.id === id ? shift(sh) : sh)));
    patches.delete(id);
  }
  // (nor are its place or its words put back over the person's: what else is asked, a colour say, still is)
  if (guard) {
    const kept: Id[] = [];
    for (const [id, change] of patches) {
      if (!theirs(doc.shapes[id])) continue;
      const c = { ...(change as Record<string, unknown>) }, was = doc.shapes[id] as unknown as Record<string, unknown>;
      // (a value asked for that is what it already is changes nothing of theirs: it is simply left out)
      const over = ["x", "y", "w", "h", "rot", "text"].filter((k) => k in c && c[k] !== was[k]);
      for (const k of ["x", "y", "w", "h", "rot", "text"]) if (k in c && c[k] === was[k]) delete c[k];
      if (!over.length) continue;
      for (const k of over) delete c[k];
      if (Object.keys(c).length) patches.set(id, c);
      else patches.delete(id);
      kept.push(id);
    }
    heldN += kept.length;
    if (kept.length) problems.push(`left as the person left ${kept.length === 1 ? "it" : "them"}: ${kept.slice(0, 8).map((x) => "#" + x).join(" ")} (the person has moved or reworded ${kept.length === 1 ? "it" : "them"} since you drew ${kept.length === 1 ? "it" : "them"}; their place and words were not changed back). Change them only if the person asked you to, with "force": true.`);
  }
  const patch = [...patches].map(([id, change]) => ({ id, change: change as Partial<Shape> }));
  const remove: Id[] = [];
  for (const r of ops.remove ?? []) {
    const id = idOf(r);
    if (!id) continue;
    // (of live things, only what it opened itself may be closed)
    if (!mine.has(id) || (isLive(doc.shapes[id]) && !opened.has(id))) {
      problems.push(isLive(doc.shapes[id]) ? `${r} was not opened by you, so it was left on the board` : `${r} ${OUT}, so it was left on the board`);
      continue;
    }
    remove.push(id);
  }
  // what the person has changed since it was drawn (moved, resized, reworded) is theirs: not taken away unasked
  // (the person is writing in one of them right now: their words aren't on the board yet, so nothing is done until they are)
  const writing = s.editing;
  if (guard && writing && (remove.includes(writing) || patches.has(writing))) return { made: {}, changed: 0, removed: 0, problems: [`not done: the person is writing in #${writing} right now; try again in a moment`], held: 1 };
  const held = guard ? remove.filter(heldBy) : [];
  // (a redraw that takes the old away and puts a new one down is done whole or not at all: with what it would take away
  // held, putting its new one beside the old would leave two)
  if (held.length && (put.length || ops.story || ops.copy?.length || ops.repeat?.length))
    return { made: {}, changed: 0, removed: 0, problems: [`not done (any of it): the person has changed ${held.length === 1 ? "#" + held[0] : `${held.length} of what you would remove (${held.slice(0, 8).map((x) => "#" + x).join(" ")}${held.length > 8 ? " …" : ""})`} since you drew it, and this request also draws new things in its place. Read the board with weld look and keep their changes (change only what you need, or carry their order or wording back to wherever the drawing comes from); remove theirs only if the person asked you to, with "force": true.`], held: held.length };
  if (held.length) {
    heldN += held.length;
    for (const id of held) remove.splice(remove.indexOf(id), 1);
    problems.push(`not removed: the person has changed ${held.length === 1 ? "#" + held[0] : `${held.length} of these (${held.slice(0, 8).map((x) => "#" + x).join(" ")}${held.length > 8 ? " …" : ""})`} since you drew ${held.length === 1 ? "it" : "them"}, so ${held.length === 1 ? "it was" : "they were"} left as the person left ${held.length === 1 ? "it" : "them"}. Read the board with weld look and keep their changes (change only what you need, or carry their order or wording back to wherever the drawing comes from). Remove them only if the person asked you to, with "force": true.`);
  }
  // (something made in this request and removed in it too: it is simply not made, in any state, nor the lines to it)
  for (const id of [...remove]) {
    if (!put.some((p) => p.id === id)) continue;
    const gone = new Set([id, ...put.filter((p) => isArrow(p) && (p.a.bind?.id === id || p.b.bind?.id === id)).map((p) => p.id)]);
    for (let i = put.length - 1; i >= 0; i--) if (gone.has(put[i]!.id)) put.splice(i, 1);
    for (const byState of sceneAdds.values()) for (const [k, list] of byState) byState.set(k, list.filter((sh) => !gone.has(sh.id)));
    remove.splice(remove.indexOf(id), 1);
  }
  // In a drawing that plays, a change is to the thing, not to the one state on the board: words, colours and sizes are
  // changed in every state, a move moves it by as much in every state (its own movement kept), and a removal is from all.
  const inScene = (id: Id) => { const g = (doc.shapes[id] as { group?: Id } | undefined)?.group; return g && doc.scenes?.[g] ? g : null; };
  const scenePatches = patch.filter((p) => inScene(p.id));
  const sceneRemoves = remove.filter((id) => inScene(id));
  const anyScene = sceneAdds.size > 0 || scenePatches.length > 0 || sceneRemoves.length > 0;
  /** The states of the drawings that play, with this request's work in them: for any version of the board (the one
   *  on show, or one the person can step back to), each scene as it is there. */
  // `next` is a version of the board with this request's shapes already in it; `before` is that same version as it was.
  // In each, the state it shows takes the versions of the new and changed shapes that belong to that state.
  const sceneFix = (next: Doc, before: Doc): Doc => {
    if (!anyScene || !next.scenes) return next;
    const scenes = { ...next.scenes };
    let shapes = next.shapes;
    const setShape = (sh: Shape) => {
      if (!shapes[sh.id]) return;
      if (shapes === next.shapes) shapes = { ...shapes };
      shapes[sh.id] = sh;
    };
    for (const [g, adds] of sceneAdds) {
      const sc = scenes[g];
      if (!sc) continue;
      // Each state takes the copies as they are in it, matched by the state's own id (states added, taken away or put back
      // in another version keep to themselves). A state this request never saw (one put back by undo) holds them hidden.
      const any = [...adds.values()][0] ?? [];
      scenes[g] = { ...sc, moments: sc.moments.map((m, k) => {
        const mine_ = adds.get(m.id) ?? any.map((x) => ({ ...x, away: true }) as Shape);
        if (k === sc.at) {
          for (const x of mine_) setShape(x);
          return m;
        }
        const have = new Set(m.shapes.map((x) => x.id)), more = mine_.filter((x) => !have.has(x.id));
        return more.length ? { ...m, shapes: [...m.shapes, ...more] } : m;
      }) };
    }
    const gone = new Set(sceneRemoves);
    for (const g of new Set([...scenePatches.map((p) => inScene(p.id)!), ...sceneRemoves.map((id) => inScene(id)!)])) {
      const sc = scenes[g];
      if (!sc) continue;
      scenes[g] = { ...sc, moments: sc.moments.map((m, k) => (k === sc.at ? m : { ...m, shapes: m.shapes.filter((sh) => !gone.has(sh.id)).map((sh) => {
        if (isArrow(sh)) {
          // a line to something removed lets go there
          const free = (e: Arrow["a"]) => (e.bind && gone.has(e.bind.id) ? { x: e.x, y: e.y } : e);
          const c = by.get(sh.id) as Partial<Arrow> | undefined;
          const { a: _a, b: _b, ...plain } = c ?? {};
          return { ...sh, ...plain, a: free(sh.a), b: free(sh.b) } as Shape;
        }
        return moved(sh);
      }) })) };
    }
    // the changed shapes on show in this version: moved by as much from where they were in it, not put where they are now
    for (const p of scenePatches) {
      const b0 = before.shapes[p.id];
      if (b0 && !isArrow(b0)) setShape(moved(b0));
    }
    return { ...next, shapes, scenes };
  };
  /** A shape as this request changes it: words and looks as asked, a move as a move by as much (its own movement kept). */
  const by = new Map(scenePatches.map((p) => [p.id, p.change as Partial<Box>]));
  const moved = (sh: Shape): Shape => {
    const c = by.get(sh.id);
    if (!c || isArrow(sh)) return sh;
    const was = doc.shapes[sh.id] as Box, b = sh as Box;
    const { x, y, ...rest } = c;
    return { ...b, ...rest, x: typeof x === "number" ? b.x + (x - was.x) : b.x, y: typeof y === "number" ? b.y + (y - was.y) : b.y } as Shape;
  };
  const withScenes = () => {
    if (anyScene || story) s.setDoc(fixAll(s.doc, doc));
  };
  // A whole diagram in story form: compiled (nothing it sends runs as code), laid down as one drawing with all its moments
  // under fresh names, beside the conversation (or where the drawing it replaces stood), and applied with the rest.
  let story: { group: Id; moments: Moment[]; gone: Id | null } | null = null;
  if (asked !== undefined) {
    const sp = asked as Record<string, unknown> | null;
    const bad = sp && typeof sp === "object" && !Array.isArray(sp) ? Object.keys(sp).filter((k) => !STORY.has(k)) : ["(not an object)"];
    if (bad.length) problems.push(`not done: story: unknown field${bad.length > 1 ? "s" : ""} ${bad.map((b) => `"${b}"`).join(", ")} (fields: ${[...STORY].join(", ")})`);
    else {
      try {
        const def = compile({ ...(sp as object), slug: "story" } as Spec);
        // (every moment goes through the board's own cleaning, as a saved board does: what reaches the drawing code is
        // well-formed, the same as after a reload)
        const raw = def.moments ? def.moments().moments : [{ over: 0, hold: 0, shapes: def.build() }];
        // (every part in every moment is a kind the board draws for a diagram: not a live thing, a picture, a retired kind, or none)
        for (const m of raw) for (const x of m.shapes) {
          const k = x.kind as string, def0 = Object.hasOwn(KINDS, k) ? KINDS[k as keyof typeof KINDS] : undefined;
          if (k !== "arrow" && k !== "text" && (!def0 || def0.group === "Legacy" || def0.group === "Live" || def0.group === "Media")) throw new Error(`"${x.id}" is a "${k}", which a story cannot draw`);
        }
        const src = raw.map((m) => {
          const shapes = cleanShapes(m.shapes);
          if (shapes.length !== m.shapes.length) {
            const kept = new Set(shapes.map((x) => x.id)), lost = m.shapes.find((x) => !kept.has(x.id));
            throw new Error(`"${lost?.id}" is not well-formed (a field of the wrong kind, or a wire to nothing)`);
          }
          return { ...m, shapes };
        });
        const seen = src.flatMap((m) => m.shapes.filter((x) => !x.away));
        const tmp: Doc = { shapes: Object.fromEntries(seen.map((x) => [x.id, x])), order: seen.map((x) => x.id) };
        const b = union(seen.map((x) => bounds(tmp, x))) ?? { x: 0, y: 0, w: 0, h: 0 };
        let at: { x: number; y: number } | null = null, gone: Id | null = null;
        if (typeof sp!.replace === "string") {
          // (named by the id weld draw answered, the drawing's own, or by any of its shapes)
          const id = sp!.replace.replace(/^#/, ""), groupOf = (x: Id) => (doc.shapes[x] as { group?: Id } | undefined)?.group;
          const g = doc.shapes[id] ? groupOf(id) : doc.order.some((x) => groupOf(x) === id) ? id : undefined;
          const old = g ? doc.order.filter((x) => groupOf(x) === g) : [];
          if (!g) problems.push(`not done: story: there is no drawing ${sp!.replace} to replace`);
          // (all of it: a drawing part of which is someone else's is not redrawn over them)
          else if (!old.every((x) => mine.has(x)) || old.some((x) => isLive(doc.shapes[x]!))) problems.push(`not done: story: ${sp!.replace} ${OUT}`);
          // (held, nothing of the request is done: a legend drawn beside a redraw that did not happen would be one too many)
          else if (guard && (old.some(heldBy) || (doc.scenes?.[g]?.moments ?? []).some((m) => m.shapes.some((x) => theirs(x) && !liveEnded(x)))))
            return { made: {}, changed: 0, removed: 0, problems: [`not done (any of it): story: the person has changed ${sp!.replace} since you drew it (in one of its moments, or a line of theirs to it), so it was not drawn over. Read it with weld look and keep their changes (use "change" on the parts you need), or redraw it over them only if the person asked, with "force": true.`], held: 1 };
          else {
            const ob = union(old.map((x) => bounds(doc, doc.shapes[x]!)));
            at = ob ? { x: ob.x, y: ob.y } : null;
            gone = g;
            remove.push(...old.filter((x) => !remove.includes(x)));
          }
        }
        if (!(typeof sp!.replace === "string" && !gone)) {
          at ??= place(b.w, b.h);
          const group = newId(), { moments } = laidMoments(src, group, at.x - b.x, at.y - b.y);
          put.push(...moments[0]!.shapes);
          story = { group, moments, gone };
          made[typeof sp!.name === "string" && sp!.name.trim() ? sp!.name.trim().slice(0, 60) : "drawing"] = group;
          if (moments.length > 1) problems.push(`note: it plays through ${moments.length} moments; weld look shows each`);
        }
      } catch (e) {
        problems.push(`not done: story: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  /** The board's moving drawings with this request's work in them, the story's own moments too. */
  const fixAll = (next: Doc, before: Doc): Doc => {
    const d = anyScene ? sceneFix(next, before) : next;
    if (!story) return d;
    const scenes = { ...(d.scenes ?? {}) };
    if (story.gone) delete scenes[story.gone];
    // (a story of one moment is a still drawing: it needs no moments of its own)
    if (story.moments.length > 1) scenes[story.group] = { moments: story.moments, at: 0 };
    return { ...d, scenes };
  };
  if (!put.length && !patch.length && !remove.length) return { made: {}, changed: 0, removed: 0, problems: problems.length ? problems : ["nothing to do"], held: heldN };
  if (smith) {
    // a smith works for the person: what it does is theirs to undo, all of it one step
    // (what it makes is its own before the board changes, so all that follows the change sees it so)
    noteDrawn(thread, put.map((p) => p.id));
    s.runJoined(smith, () => {
      if (put.length) s.put(...put);
      for (const p of patch) s.patch(p.id, p.change);
      if (remove.length) s.remove(remove);
      withScenes();
    });
    const touchedF = [...put.filter((p) => !isArrow(p)).map((p) => p.id), ...patch.map((p) => p.id)];
    editor.overlay.flash = { ids: new Set(touchedF), until: Date.now() + 1400, color: SMITH_COLOR };
    editor.invalidate();
    setTimeout(() => {
      if (editor.overlay.flash && editor.overlay.flash.until <= Date.now()) editor.overlay.flash = null;
      editor.invalidate();
    }, 1450);
    const namedF: Record<string, Id> = {};
    for (const [k, v] of Object.entries(made)) if (k !== v) namedF[k] = v;
    return { made: namedF, changed: patch.length, removed: remove.length, problems, held: heldN };
  }
  // (what an agent makes, a copy of the person's work included, is its own: not marked as theirs)
  for (let i = 0; i < put.length; i++) if (put[i]!.edited) { const { edited: _e, ...rest } = put[i]!; put[i] = rest as Shape; }
  for (const byState of sceneAdds.values()) for (const [k, list] of byState) byState.set(k, list.map((sh) => { if (!sh.edited) return sh; const { edited: _e, ...rest } = sh; return rest as Shape; }));
  s.applyForeign(put, patch, remove, anyScene || story ? fixAll : undefined);
  // What it drew is connected to it, so it goes on seeing (and may go on changing) its own work. Shapes that are now
  // joined into one drawing are one connection, however many times it took to draw them. (Told to every moment of the
  // person's history too, so undoing their own steps never disconnects the agent from work still on the board.)
  const fresh = put.filter((p) => !isArrow(p) && !copied.has(p.id)).map((p) => p.id);
  {
    const now = threadBox(editor, thread)!;
    const keys = [...(now.live?.sees ?? [])];
    const loose = new Set<Id>(fresh);
    // (a copy is one connection: the group, the frame or the drawing it is)
    const keep: string[] = [...copyKeys];
    for (const k of keys) {
      if (copyKeys.includes(k)) continue;
      if (k.startsWith("note:") || k.startsWith("drawing:") || k.startsWith("work:")) {
        for (const x of resolve(editor, k)?.ids ?? []) if (s.doc.shapes[x] && !isArrow(s.doc.shapes[x]!) && !copied.has(x)) loose.add(x);
        for (const x of prior) if (s.doc.shapes[x] && !isArrow(s.doc.shapes[x]!) && !copied.has(x)) loose.add(x);
      } else keep.push(k);
    }
    // (what it drew close together is one drawing, its titles and labels with it: one connection, seen in one picture)
    const done = new Set<Id>();
    const sets: { ids: Id[]; size: number; r: Rect }[] = [];
    for (const x of loose) {
      if (done.has(x) || !s.doc.shapes[x]) continue;
      const r = resolve(editor, `drawing:${x}`);
      const members = (r?.ids ?? [x]).filter((m) => !isArrow(s.doc.shapes[m]!));
      for (const m of members) done.add(m);
      const r2 = union(members.map((m) => bounds(s.doc, s.doc.shapes[m]!)));
      if (r2) sets.push({ ids: members, size: r?.ids.length ?? 1, r: r2 });
    }
    // (pieces within NEAR of one another, measured piece to piece, are joined, and so on through them)
    const NEAR = 320;
    const near = (a: Rect, b: Rect) => a.x - NEAR < b.x + b.w && b.x - NEAR < a.x + a.w && a.y - NEAR < b.y + b.h && b.y - NEAR < a.y + a.h;
    const up = sets.map((_, i) => i);
    const top = (i: number): number => (up[i] === i ? i : (up[i] = top(up[i]!)));
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) if (near(sets[i]!.r, sets[j]!.r)) up[top(j)] = top(i);
    const joined = new Map<number, (typeof sets)[number][]>();
    sets.forEach((g, i) => (joined.get(top(i)) ?? joined.set(top(i), []).get(top(i))!).push(g));
    // Each joined drawing is one key, unless it is more than an agent is described at once (shapes and lines together):
    // then whole pieces are kept together in several. Each piece is kept by up to 50 of its own shapes, so it is found
    // again whichever of them are left.
    for (const pieces of joined.values()) {
      if (pieces.length === 1 && pieces[0]!.ids.length === 1) {
        const x = pieces[0]!.ids[0]!;
        keep.push(textOf(s.doc.shapes[x]!) ? `note:${x}` : `drawing:${x}`);
        continue;
      }
      let ids: Id[] = [], size = 0, len = 5;
      for (const p of pieces) {
        const mine = p.ids.slice(0, 50), more = mine.reduce((n, x) => n + x.length + 1, 0);
        if (ids.length && (size + p.size > 400 || len + more > 19000)) ((keep.push(`work:${ids.join(",")}`)), (ids = []), (size = 0), (len = 5));
        ids.push(...mine);
        size += p.size;
        len += more;
      }
      if (ids.length) keep.push(`work:${ids.join(",")}`);
    }
    const drewNow = [...new Set([...(now.live?.drew ?? []), ...put.map((p) => p.id)])].filter((x) => s.doc.shapes[x]).slice(-400);
    if (keep.join("|") !== keys.join("|") || drewNow.length !== (now.live?.drew ?? []).length)
      if (s.doc.away?.[thread]) s.quiet(() => s.patch(thread, { live: { ...now.live, sees: keep, drew: drewNow } }));
      else s.applyForeign([], [{ id: thread, change: { live: { ...now.live, sees: keep, drew: drewNow } } as Partial<Shape> }], []);
  }
  // seen at work: its mark goes over to what it touched, which glows for a moment in its colour
  const touched = [...fresh, ...[...copied].filter((x) => !isArrow(s.doc.shapes[x]!)), ...patch.map((p) => p.id)];
  if (touched[0]) showVisit(thread, touched[0]);
  editor.overlay.flash = { ids: new Set(touched), until: Date.now() + 1400, color: hueOf(editor, thread) };
  editor.invalidate();
  setTimeout(() => {
    if (editor.overlay.flash && editor.overlay.flash.until <= Date.now()) editor.overlay.flash = null;
    editor.invalidate();
  }, 1450);
  const named: Record<string, Id> = {};
  for (const [k, v] of Object.entries(made)) if (k !== v) named[k] = v;
  return { made: named, changed: patch.length, removed: remove.length, problems, held: heldN };
}
