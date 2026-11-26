// The editor: turns pointer, wheel and key input into changes to the
// store. One gesture is live at a time; each is one undo step.
import {
  aabb, anchorFor, arrowPath, insideBox, bounds, boundsOf, boxAt, center, contains, dist, endPoint, hitTest, inRect, normAngle, normRect, overlaps, rotOf, toLocal, turn,
 bowHandle } from "./geometry";
import { frame, HOLD, OVER, position, restart } from "./anim";
import type { Theme } from "./render";
import { arrowLabelRect, clock, emptyOverlay, stage, HANDLE, LABEL_SIZE, face, layoutText, textLayout, labelWidth, withFace, LINE, PAD, ROTATE_OUT, selectionFrame, visibleStubs } from "./render";
import { cleanDoc, cleanShapes, fromOutside, scenesFromOutside } from "./clean";
import { KEY_TO_KIND, KINDS } from "./kinds";
import { grips, labelText, labelTrack, segmentParts, slid, tableRows, timelinePoints, unitColumns } from "./shapes";
import { ACCEPTED } from "./accepted";
import type { StampDef } from "./stamps";
import { PATTERNS } from "./patterns";
import { snapRect, snapTargets } from "./snap";
import { Store } from "./store";
import { isArrow, isBox, isLive, isText, newId } from "./types";
import type { Arrow, Box, BoxKind, Camera, Doc, End, Fill, Id, Line, Moment, Pt, Rect, Scene, Shape, Text, Tone, Tool } from "./types";

/** An exact route's corners, carried along with a wire that is moved whole. */
const carried = (sh: Arrow, dx: number, dy: number) => (sh.via ? { via: sh.via.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {});
/** An exact route's corners after some of what the wire joins has moved by (dx, dy): the whole route goes with a wire that
 *  moves whole; when only one end's shape moves, the corner next to that end follows it along the leg's own direction, so
 *  the wire still leaves its shape straight and every leg stays level or upright. */
const rerouted = (sh: Arrow, moved: (e: End) => boolean, dx: number, dy: number) => {
  if (!sh.via?.length) return {};
  const a = moved(sh.a), b = moved(sh.b);
  if (a && b) return carried(sh, dx, dy);
  const via = sh.via.map((p) => ({ ...p }));
  // a wire leaving a top or bottom edge sets off upright: its first corner keeps under (or over) the end
  const follow = (e: End, i: number) => { const upright = e.bind ? e.bind.ay <= 0.02 || e.bind.ay >= 0.98 : Math.abs(via[i]!.x - e.x) < Math.abs(via[i]!.y - e.y); if (upright) via[i]!.x += dx; else via[i]!.y += dy; };
  if (a) follow(sh.a, 0);
  if (b) follow(sh.b, via.length - 1);
  return { via };
};
/** A shape moved by (dx, dy), ends and corners and all. */
function shifted<T extends Shape>(sh: T, dx: number, dy: number): T {
  if (!isArrow(sh)) return { ...sh, x: sh.x + dx, y: sh.y + dy };
  const mv = (e: End): End => ({ ...e, x: e.x + dx, y: e.y + dy });
  return { ...sh, a: mv(sh.a), b: mv(sh.b), ...carried(sh, dx, dy) };
}

/**
 * A stamp's moments laid down as one drawing in `group`, moved by (dx, dy): every part under a fresh name (the same in every
 * moment, its wires bound to the new names), one stacking order for every moment, and a part a moment does not hold kept in
 * it hidden, as it is in the nearest moment that holds it. Shared by a person's stamp and an agent's story.
 */
export function laidMoments(src: { over: number; hold: number; shapes: Shape[] }[], group: Id, dx: number, dy: number): { moments: Moment[] } {
    const names = new Map<Id, Id>();
    const fresh = (id: Id) => names.get(id) ?? (names.set(id, newId()), names.get(id)!);
    const own = (shapes: Shape[]) => { const here = new Set(shapes.map((sh) => sh.id)); return shapes.map((sh0): Shape => {
      const sh = shifted({ ...sh0, id: fresh(sh0.id), group }, dx, dy);
      if (!isArrow(sh)) return sh;
      const re = (e: End): End => (e.bind && here.has(e.bind.id) ? { ...e, bind: { ...e.bind, id: fresh(e.bind.id) } } : { x: e.x, y: e.y });
      return { ...sh, a: re(sh.a), b: re(sh.b) };
    }); };
    const laid = src.map((m) => ({ id: newId(), over: m.over, hold: m.hold, shapes: own(m.shapes) }));
    // a part a moment does not hold is in it all the same, hidden: so it can be shown there, like any part hidden by hand
    const every = new Map<Id, Shape>();
    for (const m of laid) for (const sh of m.shapes) if (!every.has(sh.id)) every.set(sh.id, sh);
    // one stacking order for every moment: a part first met takes its place just above what lay under it there
    const stack: Id[] = [];
    for (const m of laid) { let under = -1; for (const sh of m.shapes) { const at = stack.indexOf(sh.id); if (at >= 0) under = at; else stack.splice(++under, 0, sh.id); } }
    const rank = new Map(stack.map((id, i) => [id, i]));
    const moments = laid.map((m, i) => {
      const has = new Set(m.shapes.map((sh) => sh.id)), missing = [...every.keys()].filter((id) => !has.has(id));
      if (!missing.length) return { ...m, shapes: [...m.shapes].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) };
      // as it is in the nearest moment that holds it: the next one round, so it appears in place
      const near = (id: Id) => { for (let k = 1; k < laid.length; k++) { const sh = laid[(i + k) % laid.length]!.shapes.find((x) => x.id === id); if (sh) return sh; } return every.get(id)!; };
      return { ...m, shapes: [...m.shapes, ...missing.map((id) => ({ ...near(id), away: true as const }))].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) };
    });
    return { moments };
}
/** `sh` without the parts of its exact look that a style about to be applied would otherwise hide. */
function eased<T extends Shape>(sh: T, change: { tone?: unknown; fill?: unknown }): T {
  if (!sh.fine || (!change.tone && !change.fill)) return sh;
  const f = { ...sh.fine };
  // (words shown as typed stay as typed: only their colour is handed back)
  if (change.tone) { if (f.text) f.typed = true; delete f.line; delete f.text; delete f.lamp; }
  if (change.fill) { delete f.fill; delete f.fo; delete f.shadow; }
  if (Object.keys(f).length) return { ...sh, fine: f };
  const { fine: _dropped, ...rest } = sh;
  return rest as T;
}
/** Every stamp there is, patterns and whole diagrams alike, by slug. */
// what can be put down: the single-shape patterns, and every accepted diagram
/** Each board state's shapes by group (a state is never changed in place: every change makes a new one). */
const byGroup = new WeakMap<Doc, Map<Id, Shape[]>>();
/** Each board state's position of every shape in its order. */
const orderAt = new WeakMap<Doc, Map<Id, number>>();
const STAMPS = new Map<string, StampDef>([...PATTERNS, ...ACCEPTED].map((d) => [d.slug, d]));
const findStamp = (slug: string) => STAMPS.get(slug);
/** Stamps loaded later (the exploration rounds), so they can be put down by slug like the rest. */
export const addStamps = (defs: StampDef[]) => { for (const d of defs) STAMPS.set(d.slug, d); };

export interface PointerInput {
  x: number;
  y: number;
  button: number;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  id: number;
  touch: boolean;
}

export type Align = "left" | "centre" | "right" | "top" | "middle" | "bottom";
type Handle =
  | { type: "resize"; h: number }
  | { type: "rotate" }
  | { type: "end"; id: Id; end: "a" | "b" }
  | { type: "bow"; id: Id }
  | { type: "grip"; id: Id; i: number }
  | { type: "stub"; dir: number };

type Gesture =
  | { type: "idle" }
  | { type: "pan"; sx: number; sy: number; cx: number; cy: number; tap?: PointerInput }
  | { type: "pinch"; d: number; mid: Pt; cam: { x: number; y: number; z: number } }
  | { type: "marquee"; origin: Pt; base: Set<Id> }
  | { type: "move"; start: Pt; down: Pt; orig: Map<Id, Shape>; moved: boolean; hit: Id; wasSelected: boolean; whole?: boolean; dup: boolean }
  | { type: "resize"; h: number; from: Rect; rot: number; uniform: boolean; orig: Map<Id, Shape>; moved: boolean; riders?: Set<Id> }
  | { type: "rotate"; c: Pt; start: number; base: number; orig: Map<Id, Shape>; moved: boolean }
  | { type: "draw"; kind: BoxKind; origin: Pt; down: Pt; id: Id | null }
  | { type: "arrow"; id: Id; end: "a" | "b"; fresh: boolean; down: Pt; moved: boolean; spawn: Box | null }
  | { type: "stub"; dir: number; box: Id; down: Pt }
  | { type: "bow"; id: Id; down: Pt; moved: boolean }
  | { type: "grip"; id: Id; i: number; from: Box; down: Pt; moved: boolean };

const DEFAULT_W = 160, DEFAULT_H = 72, GAP = 72, MIN = 6;
/** A tool that makes a shape. */
const making = (t: Tool): t is BoxKind => t in KINDS;
/** A tool that draws a connection: an arrow, or a bare line. */
const wiring = (t: Tool) => t === "arrow" || t === "line";
// the direction each handle pulls in, as an angle on screen; the cursor follows a turned frame round
const PULL = [225, 315, 45, 135, 270, 0, 90, 180];
const RESIZE = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
const resizeCursor = (h: number, rot: number) => RESIZE[((Math.round((PULL[h]! + (rot * 180) / Math.PI) / 45) % 4) + 4) % 4]!;
const TURN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M5 13a6.5 6.5 0 1 1 3.4 4.9' fill='none' stroke='white' stroke-width='4' stroke-linecap='round'/><path d='M3.6 16.8l5 1.6-.9-5.2z' fill='black' stroke='white' stroke-width='1'/><path d='M5 13a6.5 6.5 0 1 1 3.4 4.9' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'/></svg>")}") 11 11, crosshair`;

const NOTHING: Set<Id> = new Set();
/** A copy the person made is the person's: whose the original page or picture was is not carried over. */
function unowned(b: Box): Box {
  let out = b;
  if (b.live?.by) out = { ...out, live: (({ by: _b, ...rest }) => rest)(b.live) };
  if (b.img?.by) out = { ...out, img: (({ by: _b, ...rest }) => rest)(b.img) };
  return out;
}

/** How near (in screen pixels) a plain line's end has to be put to a shape's centre to hold on to it. */
const LINE_HOLD = 12;
/** How near level or upright (in radians) a line has to be to snap to it. */
const SNAP_ANGLE = (6 * Math.PI) / 180;
/** Where on box `b` an end should sit for its line to `o` to be exactly level or upright, if it can be: `o` must face one
 *  of its sides within the side's span. An end dropped in the box's body (its middle) takes it whenever it can; one
 *  pinned on the rim only when its line is already nearly straight. A turned box is left alone. */
export function straightOn(b: Box, o: Pt, bind: { ax: number; ay: number }, now: Pt): { ax: number; ay: number } | null {
  if (b.rot || !b.w || !b.h) return null;
  const middle = bind.ax === 0.5 && bind.ay === 0.5, nearly = (a: number) => middle || Math.abs(normAngle(a)) < SNAP_ANGLE;
  const ang = Math.atan2(now.y - o.y, now.x - o.x), level = Math.round(ang / (Math.PI / 2)) % 2 === 0;
  const inY = o.y > b.y + 1 && o.y < b.y + b.h - 1, inX = o.x > b.x + 1 && o.x < b.x + b.w - 1;
  const side = o.x <= b.x || o.x >= b.x + b.w, cap = o.y <= b.y || o.y >= b.y + b.h;
  if (inY && side && (middle || level) && nearly(ang - Math.round(ang / Math.PI) * Math.PI)) return { ax: o.x <= b.x ? 0 : 1, ay: (o.y - b.y) / b.h };
  if (inX && cap && (middle || !level) && nearly(ang - (Math.round((ang - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2))) return { ax: (o.x - b.x) / b.w, ay: o.y <= b.y ? 0 : 1 };
  return null;
}

export class Editor {
  store = new Store();
  overlay = emptyOverlay();
  view = { w: 1, h: 1 };
  cursor = "default";
  /** Design choices with alternatives; see variant.ts. */
  opts: { arm: "stay" | "once"; connect: "stubs" | "hover" | "keys"; snap: "gentle" | "always" | "held" | "off"; attach: "centre" | "exact" } = { arm: "once", connect: "hover", snap: "gentle", attach: "centre" };
  /** Called whenever the canvas needs repainting. */
  invalidate: () => void = () => {};
  /** Called before a pointer press so text being typed is saved first. */
  flushText: () => void = () => {};
  private g: Gesture = { type: "idle" };
  private space = false;
  /** Space is held: a press anywhere moves the board. */
  get panning() {
    return this.space;
  }
  /** Nothing is in hand (no drag, no drawing): safe for something else to change the board. */
  get idle() {
    return this.g.type === "idle";
  }
  private last: Pt = { x: 0, y: 0 };
  /** Where the pointer last was on the board, on screen. */
  get pointer(): Pt {
    return this.last;
  }
  private touches = new Map<number, Pt>();
  private clip: Shape[] = [];
  private style: { tone: Tone; fill: Fill; route: Arrow["route"] } = { tone: "ink", fill: "none", route: readRoute() };
  /** How the next arrow will be routed: the last choice made, kept between visits. */
  get arrowRoute() {
    return this.style.route;
  }
  // how fast the pointer is travelling, in screen px per ms, and when it last moved
  /** The last press came from a finger: targets are larger and nothing waits for a hover. */
  private finger = false;
  /** A finger's tap being played as the press it was (see down). */
  private tapping = false;
  /** How far (screen px) a press may land from a handle and still take it. */
  private grip(mouse: number) {
    return this.finger ? Math.max(mouse, 18) : mouse;
  }
  private speed = 0;
  private movedAt = 0;
  private rested = true;

  // ── coordinates and camera ──────────────────────────────────────
  world(p: Pt): Pt {
    const c = this.store.cam;
    return { x: p.x / c.z + c.x, y: p.y / c.z + c.y };
  }
  screen(p: Pt): Pt {
    const c = this.store.cam;
    return { x: (p.x - c.x) * c.z, y: (p.y - c.y) * c.z };
  }
  private viewRect(): Rect {
    const c = this.store.cam;
    return { x: c.x, y: c.y, w: this.view.w / c.z, h: this.view.h / c.z };
  }
  zoomAt(at: Pt, factor: number) {
    const c = this.store.cam;
    const z = Math.min(8, Math.max(0.05, c.z * factor));
    const w = this.world(at);
    this.stopGlide();
    this.store.setCamera({ x: w.x - at.x / z, y: w.y - at.y / z, z });
    this.invalidate();
  }
  private gliding = 0;
  private stopGlide() {
    if (this.gliding) cancelAnimationFrame(this.gliding);
    this.gliding = 0;
  }
  /** Ease the camera to `to`. Direct input (wheel, drag) never glides;
   *  only jumps the user asked for by button or key do. */
  private glide(to: Camera) {
    this.stopGlide();
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || typeof requestAnimationFrame === "undefined") {
      this.store.setCamera(to);
      return this.invalidate();
    }
    const from = { ...this.store.cam };
    const { w, h } = this.view;
    // travel between the two view centres, and through zoom levels evenly
    const c0 = { x: from.x + w / 2 / from.z, y: from.y + h / 2 / from.z };
    const c1 = { x: to.x + w / 2 / to.z, y: to.y + h / 2 / to.z };
    const t0 = performance.now(), dur = 200;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e);
      const cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e;
      this.store.setCamera(k === 1 ? to : { x: cx - w / 2 / z, y: cy - h / 2 / z, z });
      this.invalidate();
      this.gliding = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this.gliding = requestAnimationFrame(step);
  }
  /** Bring one thing to the middle of the window at reading size (or as near to it as fits). */
  focusOn(id: Id) {
    const b = this.store.doc.shapes[id];
    if (!b || b.kind === "arrow") return;
    const top = 56, bottom = 76, side = 24;
    const aw = Math.max(80, this.view.w - side * 2), ah = Math.max(80, this.view.h - top - bottom);
    const z = Math.min(1, aw / b.w, ah / b.h);
    const cx = side + aw / 2, cy = top + ah / 2;
    this.glide({ x: b.x + b.w / 2 - cx / z, y: b.y + b.h / 2 - cy / z, z });
  }
  /** Ease the view to a place. */
  flyTo(cam: Camera) {
    this.glide(cam);
  }
  zoomTo(z: number) {
    const c = this.store.cam;
    const nz = Math.min(8, Math.max(0.05, z));
    const mid = this.world({ x: this.view.w / 2, y: this.view.h / 2 });
    this.glide({ x: mid.x - this.view.w / 2 / nz, y: mid.y - this.view.h / 2 / nz, z: nz });
    void c;
  }
  fit(ids?: Iterable<Id>) {
    const r = boundsOf(this.store.doc, ids ?? this.store.doc.order);
    if (!r) return this.glide({ x: -this.view.w / 2, y: -this.view.h / 2, z: 1 });
    // keep clear of the controls: style bar above, tools below
    // …and, where movement is on show, the bar that hangs under a group
    const top = 76, bottom = 84 + (this.motion && this.store.doc.scenes ? 56 : 0), side = 56;
    const aw = Math.max(80, this.view.w - side * 2), ah = Math.max(80, this.view.h - top - bottom);
    const z = Math.min(2, Math.max(0.05, Math.min(aw / (r.w || 1), ah / (r.h || 1))));
    const cx = side + aw / 2, cy = top + ah / 2;
    this.glide({ x: r.x + r.w / 2 - cx / z, y: r.y + r.h / 2 - cy / z, z });
  }
  /** Pan just enough to bring `r` on screen. */
  private reveal(r: Rect) {
    const v = this.viewRect(), c = this.store.cam, m = 72 / c.z;
    let x = c.x, y = c.y;
    if (r.x - m < v.x) x = r.x - m;
    else if (r.x + r.w + m > v.x + v.w) x = r.x + r.w + m - v.w;
    if (r.y - m < v.y) y = r.y - m;
    else if (r.y + r.h + m + 84 / c.z > v.y + v.h) y = r.y + r.h + m + 84 / c.z - v.h;
    if (x !== c.x || y !== c.y) this.glide({ x, y, z: c.z });
  }

  // ── what is under the pointer ───────────────────────────────────
  private single(): Shape | undefined {
    const s = this.store;
    if (s.sel.size !== 1) return undefined;
    return s.doc.shapes[[...s.sel][0]!];
  }
  private handleAt(sp: Pt): Handle | null {
    const s = this.store, z = s.cam.z;
    const one = this.single();
    if (one && isArrow(one)) {
      // an end can be grabbed by its visible tip, or by the exact anchor it is pinned to
      const pts = arrowPath(s.doc, one);
      const tips = { a: pts[0], b: pts[pts.length - 1] };
      for (const end of ["b", "a"] as const) {
        const tip = tips[end];
        if (tip && dist(sp, this.screen(tip)) <= this.grip(9)) return { type: "end", id: one.id, end };
        if (one[end].bind && dist(sp, this.screen(endPoint(s.doc, one[end]))) <= this.grip(7)) return { type: "end", id: one.id, end };
      }
      // its middle can be taken and pulled: a bend, a bow, or a moved run
      if (!one.via?.length && dist(sp, this.screen(bowHandle(s.doc, one))) <= this.grip(8)) return { type: "bow", id: one.id };
      return null;
    }
    if (one && isBox(one) && (one.kind === "timeline" || one.kind === "segments")) {
      const gs = grips(one);
      for (let i = 0; i < gs.length; i++) if (dist(sp, this.screen(gs[i]!)) <= this.grip(8)) return { type: "grip", id: one.id, i };
    }
    if (one && isBox(one) && !wiring(s.tool) && this.opts.connect !== "keys") {
      const pts = visibleStubs(s.doc, one, z);
      for (let i = 0; i < pts.length; i++) if (pts[i] && dist(sp, this.screen(pts[i]!)) <= this.grip(11)) return { type: "stub", dir: i };
    }
    const fr = selectionFrame(s.doc, s.sel);
    if (!fr) return null;
    const r = { x: (fr.x - s.cam.x) * z, y: (fr.y - s.cam.y) * z, w: fr.w * z, h: fr.h * z };
    // everything below is judged in the frame's own upright terms
    const lp = turn(sp, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, -fr.rot);
    const pad = one && isText(one) ? 4 : 0;
    if (dist(lp, { x: r.x + r.w + pad + ROTATE_OUT, y: r.y - pad / 2 - ROTATE_OUT }) <= this.grip(9) && ![...s.sel].every((id) => isLive(s.doc.shapes[id]))) return { type: "rotate" };
    if (one && isText(one)) return null;
    const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] as const;
    // a selection that is tiny on screen keeps its middle for moving: the
    // corners only claim what they can without meeting each other
    const reach = Math.min(this.grip(HANDLE), Math.min(r.w, r.h) / 3);
    for (let i = 0; i < 4; i++) if (dist(lp, { x: corners[i]![0], y: corners[i]![1] }) <= reach) return { type: "resize", h: i };
    // the edges of a lone box resize too; no handle is drawn for them
    if (one && isBox(one) && r.w >= 24 && r.h >= 24) {
      const t = 5;
      const inX = lp.x > r.x + t && lp.x < r.x + r.w - t, inY = lp.y > r.y + t && lp.y < r.y + r.h - t;
      if (inX && Math.abs(lp.y - r.y) <= t) return { type: "resize", h: 4 };
      if (inY && Math.abs(lp.x - (r.x + r.w)) <= t) return { type: "resize", h: 5 };
      if (inX && Math.abs(lp.y - (r.y + r.h)) <= t) return { type: "resize", h: 6 };
      if (inY && Math.abs(lp.x - r.x) <= t) return { type: "resize", h: 7 };
    }
    return null;
  }
  /** What a press at `p` takes hold of. The selected box wins over
   *  anything lying behind it: an outline placed on top of a filled box
   *  can still be grabbed and typed into by its inside. */
  private pick(p: Pt) {
    const found = this.hit(p), one = this.single();
    if (found && isBox(one) && found.id !== one.id && insideBox(one, p)) {
      const order = this.store.doc.order;
      if (order.indexOf(one.id) > order.indexOf(found.id)) return one;
    }
    return found;
  }
  /** The group whose frame `p` lies within (the one on top), and that frame. */
  private groupAt(p: Pt): { g: Id; r: Rect } | null {
    const doc = this.store.doc, seen = new Set<Id>(), m = 6 / this.store.cam.z;
    for (let i = doc.order.length - 1; i >= 0; i--) {
      const g = doc.shapes[doc.order[i]!]?.group;
      if (!g || seen.has(g)) continue;
      seen.add(g);
      const r = boundsOf(doc, this.members(doc, g).filter((m) => !m.away).map((m) => m.id));
      // a little beyond the line counts, so the line itself can be pressed
      if (r && p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m) return { g, r };
    }
    return null;
  }
  shapeAt(p: Pt) {
    return this.hit(p);
  }
  private hit(p: Pt) {
    const doc = this.store.doc;
    // what is locked is not there to be picked up
    const found = hitTest(doc, p, 4 / this.store.cam.z, (sh) => !!sh.locked || (!!sh.away && (sh.group !== stage.g || (stage.mute.has(sh.id) && !this.store.sel.has(sh.id)))));
    if (found && !isBox(found)) return found;
    // an arrow's label is part of the arrow, even where it stands clear of
    // the line; but not where a filled box lies over it
    const cover = found && isBox(found) && found.fill !== "none" ? doc.order.indexOf(found.id) : -1;
    for (let i = doc.order.length - 1; i > cover; i--) {
      const sh = doc.shapes[doc.order[i]!];
      if (!isArrow(sh) || !sh.text || sh.locked) continue;
      if (inRect(p, arrowLabelRect(doc, sh), 3 / this.store.cam.z)) return sh;
    }
    return found;
  }

  // ── pointer ─────────────────────────────────────────────────────
  down(e: PointerInput) {
    const s = this.store;
    // a press on what is playing stops it, and does nothing else; a press anywhere else stops it and goes on as a press
    // there (one click picks the next drawing). A preview just gets out of the way.
    const sp = { x: e.x, y: e.y }, was = this.playing, under = was && !was.until ? this.hit(this.world(sp)) : null;
    const onIt = !!under && s.doc.shapes[under.id]?.group === was!.g;
    if (this.stop() && onIt) return;
    this.last = sp;
    this.finger = e.touch;
    // speed is measured from the press, not from wherever the pointer last was
    this.speed = 0;
    this.movedAt = performance.now();
    this.stopGlide();
    this.settle();
    if (s.editing) this.flushText();
    if (e.touch) {
      this.touches.set(e.id, sp);
      if (this.touches.size === 2) {
        this.abort();
        const [a, b] = [...this.touches.values()] as [Pt, Pt];
        this.g = { type: "pinch", d: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...s.cam } };
        return;
      }
    }
    if (this.g.type !== "idle") return;
    // a finger on a drawing it has not picked, or on the bare board, drags the board: on a board full of drawings every
    // press lands on one. A tap still picks (it is played as a press when the finger lifts without moving).
    if (e.touch && !this.tapping && s.tool === "select" && !s.editing && !this.handleAt(sp)) {
      const hit = this.hit(this.world(sp)), under = hit && s.doc.shapes[hit.id];
      // (a lone shape still goes where the finger takes it; a drawing, a group, waits to be picked first)
      if (!hit || (under?.group && !s.sel.has(hit.id))) {
        this.g = { type: "pan", sx: e.x, sy: e.y, cx: s.cam.x, cy: s.cam.y, tap: e };
        return;
      }
    }
    if (e.button === 1 || this.space || s.tool === "hand") {
      this.g = { type: "pan", sx: e.x, sy: e.y, cx: s.cam.x, cy: s.cam.y };
      this.refreshCursor(sp);
      return;
    }
    if (e.button !== 0) return;
    const p = this.world(sp);

    if (s.tool === "stamp") {
      // a pattern goes down where you press, whatever is under the pointer, and the tool hands back
      const placed = this.stamp(p);
      if (placed ? this.opts.arm === "once" : true) {
        s.tool = "select";
        this.disarm();
      }
      this.refreshCursor(sp);
      s.emit();
      return;
    }

    // (with a line or an arrow in hand, a press draws a new one, even where the last one ended)
    const h0 = this.handleAt(sp), h = wiring(s.tool) && h0?.type === "end" ? null : h0;
    const fr = h?.type === "resize" || h?.type === "rotate" ? selectionFrame(s.doc, s.sel) : null;
    if (h?.type === "resize" && fr) {
      const orig = this.snapshot(s.sel);
      // what is inside a panel is resized with it, as one picture
      let riders: Set<Id> | undefined;
      if (s.sel.size === 1) {
        const all = this.withinside(s.sel);
        if (all.size > 1) { riders = new Set([...all].filter((id) => !s.sel.has(id) && !isArrow(s.doc.shapes[id]))); for (const id of riders) orig.set(id, s.doc.shapes[id]!); }
      }
      // turned shapes inside a group cannot be stretched without shearing: the group keeps its proportions
      // (and a picture keeps its shape: a stretched screenshot reads wrong)
      const uniform = [...orig.values()].some((sh) => sh.kind === "image") || (!fr.rot && [...orig.values()].some((sh) => !isArrow(sh) && !!sh.rot));
      this.g = { type: "resize", h: h.h, from: { x: fr.x, y: fr.y, w: fr.w, h: fr.h }, rot: fr.rot, uniform, orig, moved: false, ...(riders?.size ? { riders } : {}) };
      return;
    }
    if (h?.type === "rotate" && fr) {
      const c = center(fr);
      this.g = { type: "rotate", c, start: Math.atan2(p.y - c.y, p.x - c.x), base: fr.rot, orig: this.snapshot(s.sel), moved: false };
      return;
    }
    if (h?.type === "grip") {
      const b = s.doc.shapes[h.id];
      if (isBox(b)) { s.mark(); this.g = { type: "grip", id: h.id, i: h.i, from: b, down: sp, moved: false }; this.overlay.busy = true; return; }
    }
    if (h?.type === "bow") {
      s.mark();
      this.g = { type: "bow", id: h.id, down: sp, moved: false };
      this.overlay.busy = true;
      return;
    }
    if (h?.type === "end") {
      s.mark();
      this.g = { type: "arrow", id: h.id, end: h.end, fresh: false, down: sp, moved: false, spawn: null };
      this.overlay.busy = true;
      return;
    }
    if (h?.type === "stub") {
      this.g = { type: "stub", dir: h.dir, box: this.single()!.id, down: sp };
      return;
    }

    if (wiring(s.tool)) return this.beginArrow(p, sp, null);

    const hit = this.pick(p);
    // pressing anywhere outside the group you stepped into steps back out of it
    // (a tool in hand is making something for the group, so it stays stepped into)
    if (this.scope && hit?.group !== this.scope && s.tool === "select") this.leave();
    if (s.tool === "text") {
      // the text tool types into whatever it lands on, or starts a new line of text
      if (hit) {
        s.select([hit.id]);
        return this.edit(hit.id);
      }
      return this.newText(p);
    }
    // a shape tool always makes a shape, also on top of or inside another:
    // the tool was chosen for exactly that, and it hands back after one use
    if (hit && !making(s.tool)) {
      // a press goes straight to the part under it, never to its group
      // …unless that group is what is selected: then a drag moves all of it, and only a click reaches in
      if (hit.group && hit.group !== this.scope && !e.shift && !this.family(hit.id).every((id) => s.sel.has(id))) this.enter(hit.group);
      // a grouped shape stands for its whole group
      const ids = this.family(hit.id);
      const wasSelected = ids.every((id) => s.sel.has(id));
      // the group was already the whole selection: a click on it now, without dragging, reaches in for the part
      const whole = wasSelected && !!hit.group && hit.group !== this.scope && s.sel.size === ids.length;
      if (e.shift) {
        for (const id of ids) wasSelected ? s.sel.delete(id) : s.sel.add(id);
      } else if (!wasSelected) s.select(ids);
      this.g = { type: "move", start: p, down: sp, orig: new Map(), moved: false, hit: hit.id, wasSelected, whole, dup: e.alt };
      s.emit();
      this.invalidate();
      return;
    }
    if (making(s.tool)) {
      this.g = { type: "draw", kind: s.tool, origin: p, down: sp, id: null };
      return;
    }
    if (s.tool === "select" && !e.shift) {
      // the space between a group's parts is the group
      const g = this.groupAt(p)?.g;
      if (g) {
        const ids = this.members(s.doc, g).map((m) => m.id), wasSelected = ids.every((id) => s.sel.has(id));
        this.leave();
        if (!wasSelected) s.select(ids);
        this.g = { type: "move", start: p, down: sp, orig: new Map(), moved: false, hit: ids[0]!, wasSelected, dup: e.alt };
        s.emit();
        this.invalidate();
        return;
      }
    }
    this.g = { type: "marquee", origin: p, base: e.shift ? new Set(s.sel) : new Set() };
    if (!e.shift) s.select([]);
    s.emit();
    this.invalidate();
  }

  private lastInput: PointerInput | null = null;
  /** Called every frame. While something is being dragged against the
   *  edge of the window, the board scrolls under it, faster the closer
   *  the pointer is to the edge. */
  tick() {
    const t = this.g.type, e = this.lastInput;
    if (!e || (t !== "move" && t !== "resize" && t !== "draw" && t !== "arrow" && t !== "marquee")) return;
    if (this.g.type === "move" && !this.g.moved) return;
    // the pointer has come to rest mid-drag: settle onto whatever line is near
    if ((t === "move" || t === "resize" || t === "draw") && !this.rested && performance.now() - this.movedAt > 60) {
      this.rested = true;
      this.speed = 0;
      this.move(e, true);
    }
    const edge = 36, max = 16;
    const push = (v: number, size: number) => (v < edge ? -((edge - Math.max(v, 0)) / edge) : v > size - edge ? (Math.min(v, size) - (size - edge)) / edge : 0);
    const dx = push(e.x, this.view.w) * max, dy = push(e.y, this.view.h) * max;
    if (!dx && !dy) return;
    const c = this.store.cam;
    this.store.setCamera({ x: c.x + dx / c.z, y: c.y + dy / c.z, z: c.z });
    if (this.g.type === "draw") this.g.down = { x: this.g.down.x - dx, y: this.g.down.y - dy };
    this.move(e, true);
  }

  move(e: PointerInput, replay = false) {
    const s = this.store, g = this.g;
    const sp = { x: e.x, y: e.y };
    if (this.overlay.ghost) {
      this.overlay.ghost.at = this.world(sp);
      this.invalidate();
    }
    if (!replay) {
      const now = performance.now(), dt = Math.max(1, now - this.movedAt);
      // smoothed a little, so one jittery sample neither grabs nor lets go
      this.speed = this.speed * 0.5 + (dist(sp, this.last) / dt) * 0.5;
      this.movedAt = now;
      this.rested = false;
    }
    this.last = sp;
    this.lastInput = e;
    if (e.touch && this.touches.has(e.id)) this.touches.set(e.id, sp);
    const p = this.world(sp);
    const z = s.cam.z;

    if (g.type === "pinch") {
      const [a, b] = [...this.touches.values()] as [Pt, Pt];
      if (!a || !b) return;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nz = Math.min(8, Math.max(0.05, g.cam.z * (dist(a, b) / (g.d || 1))));
      const w = { x: g.mid.x / g.cam.z + g.cam.x, y: g.mid.y / g.cam.z + g.cam.y };
      s.setCamera({ x: w.x - mid.x / nz, y: w.y - mid.y / nz, z: nz });
    } else if (g.type === "pan") {
      s.setCamera({ x: g.cx - (e.x - g.sx) / z, y: g.cy - (e.y - g.sy) / z, z });
    } else if (g.type === "marquee") {
      const r = normRect(g.origin, p);
      this.overlay.marquee = r;
      const ids = new Set(g.base);
      for (const id of s.doc.order) {
        const sh = s.doc.shapes[id]!;
        if (sh.locked || (sh.away && sh.group !== stage.g)) continue;
        const b = bounds(s.doc, sh);
        // boxes must be touched; an arrow only when wholly inside, so it is never caught by accident
        if (isArrow(sh) ? contains(r, b) : overlaps(r, b)) ids.add(id);
      }
      s.select(this.grown(ids));
      s.emit();
    } else if (g.type === "move") {
      if (!g.moved) {
        if (dist(sp, g.down) < 3) return;
        g.moved = true;
        s.mark();
        if (!s.sel.has(g.hit)) s.select([g.hit]);
        if (g.dup) this.duplicateInPlace();
        g.orig = this.detached(this.snapshot(this.movingSet()));
        this.overlay.busy = true;
      }
      this.applyMove(g.orig, { x: p.x - g.start.x, y: p.y - g.start.y }, e.shift, e.meta);
    } else if (g.type === "resize") {
      if (!g.moved) {
        g.moved = true;
        s.mark();
        this.overlay.busy = true;
      }
      this.applyResize(g, p, e.shift, e.alt, e.meta);
    } else if (g.type === "rotate") {
      if (!g.moved) {
        g.moved = true;
        s.mark();
        this.overlay.busy = true;
      }
      this.applyRotate(g, p, e.shift);
    } else if (g.type === "draw") {
      if (!g.id) {
        if (dist(sp, g.down) < 4) return;
        s.mark();
        g.id = newId();
        this.overlay.busy = true;
        if (this.catching(e.meta, true)) {
          // the corner you started from lines up with its neighbours too
          const sn = snapRect({ x: g.origin.x, y: g.origin.y, w: 0, h: 0 }, snapTargets(s.doc, new Set(), this.viewRect()), 6 / z, [0], [0]);
          g.origin = { x: g.origin.x + sn.dx, y: g.origin.y + sn.dy };
        }
      }
      let r = normRect(g.origin, p);
      this.overlay.guides = [];
      if (e.shift) {
        const m = Math.max(r.w, r.h);
        r = { x: p.x < g.origin.x ? g.origin.x - m : g.origin.x, y: p.y < g.origin.y ? g.origin.y - m : g.origin.y, w: m, h: m };
      } else if (this.catching(e.meta)) {
        // the dragged corner catches the edges of what is near
        const xs = [p.x < g.origin.x ? 0 : 2], ys = [p.y < g.origin.y ? 0 : 2];
        const sn = snapRect(r, snapTargets(s.doc, new Set([g.id]), this.viewRect()), 6 / z, xs, ys);
        const q = { x: p.x + sn.dx, y: p.y + sn.dy };
        r = normRect(g.origin, q);
        this.overlay.guides = sn.guides;
      }
      s.put(this.fresh(g.id, g.kind, r));
      s.select([g.id]);
      s.emit();
    } else if (g.type === "arrow") {
      if (!g.moved && dist(sp, g.down) < 4) return;
      g.moved = true;
      this.dragEnd(g, p, e.shift);
    } else if (g.type === "grip") {
      if (!g.moved && dist(sp, g.down) < 3) return;
      g.moved = true;
      const b = s.doc.shapes[g.id];
      if (!isBox(b)) return;
      // a point slid along its line of time, or a seam between two parts: the two either side share what they had
      s.put({ ...b, levels: slid(b, g.from, g.i, p.x) });
    } else if (g.type === "bow") {
      if (!g.moved && dist(sp, g.down) < 3) return;
      g.moved = true;
      const w = s.doc.shapes[g.id];
      if (!isArrow(w)) return;
      // pulled to where the pointer is, measured from the middle of its ends as they lie unpulled; close to straight, it snaps straight
      const { bow: _b, ...flat } = w, base = arrowPath(s.doc, flat), m = { x: (base[0]!.x + base[base.length - 1]!.x) / 2, y: (base[0]!.y + base[base.length - 1]!.y) / 2 };
      const off = { x: p.x - m.x, y: p.y - m.y }, near = Math.hypot(off.x, off.y) * s.cam.z < 6;
      s.put(near ? flat : { ...w, bow: off });
    } else if (g.type === "stub") {
      if (dist(sp, g.down) < 5) return;
      // dragging a stub pulls an arrow out of the box
      const box = s.doc.shapes[g.box];
      if (!isBox(box)) return void (this.g = { type: "idle" });
      this.beginArrow(center(box), g.down, box);
      if (this.g.type === "arrow") {
        this.g.moved = true;
        this.dragEnd(this.g, p, e.shift);
      }
    } else {
      const changed = this.hover(sp, p);
      this.refreshCursor(sp);
      if (changed) this.invalidate();
      return;
    }
    this.refreshCursor(sp);
    this.invalidate();
  }

  up(e: PointerInput) {
    const s = this.store, g = this.g;
    if (this.reached > 0) this.reached--;
    const count = s.doc.order.length;
    if (e.touch) this.touches.delete(e.id);
    if (g.type === "pinch") {
      if (this.touches.size < 2) this.g = { type: "idle" };
      return;
    }
    const sp = { x: e.x, y: e.y };
    const p = this.world(sp);
    this.g = { type: "idle" };
    if (g.type === "pan" && g.tap && Math.hypot(e.x - g.sx, e.y - g.sy) < 8) {
      // a finger that pressed and lifted without dragging: a tap, played as the press it would have been
      this.tapping = true;
      try { this.down(g.tap); this.up({ ...e, x: g.tap.x, y: g.tap.y }); } finally { this.tapping = false; }
      return;
    }
    this.lastInput = null;
    this.overlay.busy = false;
    this.overlay.guides = [];
    this.overlay.marquee = null;
    this.overlay.bindBox = null;
    this.overlay.bindPoint = null;

    if (g.type === "move") {
      if (g.moved) {
        this.carryMoments(g.orig);
        s.commit();
      }
      else if (!e.shift && g.whole) {
        const group = s.doc.shapes[g.hit]?.group;
        if (group) {
          this.enter(group);
          this.reached = 2; // this release, and the one that may follow as the second half of a double-click
          s.select([g.hit]);
          s.emit();
        }
      }
      else if (!e.shift && g.wasSelected && s.sel.size > 1) {
        s.select(this.family(g.hit));
        s.emit();
      }
    } else if (g.type === "resize" || g.type === "rotate") {
      if (g.moved) {
        // a live thing is never left too small to use
        for (const id of s.sel) {
          const b = s.doc.shapes[id];
          // (a thread folded to its title keeps its bar's height: only pulled taller on purpose does it open)
          const folded = !!(b as Box | undefined)?.live?.tall && (b as Box).h <= 46;
          if (isLive(b) && (b.w < 300 || (!folded && b.h < 180) || b.rot)) s.patch<Box>(id, { w: Math.max(300, b.w), h: folded ? b.h : Math.max(180, b.h), rot: undefined });
        }
        if (g.type === "resize" && !g.rot) this.carryResize(g.orig);
        s.commit();
      }
    } else if (g.type === "draw") {
      if (!g.id) {
        // a click places a box of the usual size, centred where you clicked
        s.mark();
        const id = newId();
        const size = KINDS[g.kind];
        let r: Rect = { x: g.origin.x - size.w / 2, y: g.origin.y - size.h / 2, w: size.w, h: size.h };
        // placed on top of something, it stays where it was put: lining up
        // with what is underneath could hide it exactly behind
        if (!this.hit(g.origin) && this.catching(e.meta, true)) {
          const sn = snapRect(r, snapTargets(s.doc, new Set(), this.viewRect()), 6 / s.cam.z);
          r = { ...r, x: r.x + sn.dx, y: r.y + sn.dy };
        }
        s.put(this.fresh(id, g.kind, r));
        s.select([id]);
      } else {
        const b = s.doc.shapes[g.id];
        if (isBox(b) && (b.w < MIN || b.h < MIN)) s.patch<Box>(b.id, { w: Math.max(b.w, KINDS[b.kind].w / 2), h: Math.max(b.h, KINDS[b.kind].h / 2) });
        else if (isLive(b) && (b.w < 300 || b.h < 180)) s.patch<Box>(b.id, { w: Math.max(300, b.w), h: Math.max(180, b.h) });
      }
      s.commit();
    } else if (g.type === "arrow") {
      this.finishArrow(g, p);
    } else if (g.type === "bow" || g.type === "grip") {
      s.commit();
    } else if (g.type === "stub") {
      this.quickCreate(g.dir);
    }
    // one use, then back to the pointer; a press that made nothing is not a use
    const made = g.type === "draw" ? !!g.id || s.doc.order.length > count : g.type === "arrow" && g.fresh && !!s.doc.shapes[g.id];
    if (this.opts.arm === "once" && made && s.tool !== "select") s.tool = "select";
    this.hover(sp, p);
    this.refreshCursor(sp);
    s.emit();
    this.invalidate();
  }

  /** Stop whatever gesture is live and undo its effect. */
  abort() {
    if (this.g.type === "idle") return false;
    this.g = { type: "idle" };
    this.overlay = emptyOverlay();
    this.store.cancel();
    this.invalidate();
    return true;
  }

  dblclick(sp: Pt) {
    const s = this.store;
    if (s.tool === "hand" || this.space) return; // the hand only ever moves the board
    const p = this.world(sp);
    const hit = this.pick(p);
    // the second click of a double-click has just reached into the group: that was the whole of it
    if (this.reached > 0) { this.reached = 0; return; }
    if (hit?.group && hit.group !== this.scope) {
      // the first double-click steps into a group and takes the part under the pointer
      this.enter(hit.group);
      s.select([hit.id]);
      s.emit();
      this.invalidate();
    } else if (hit) {
      s.select([hit.id]);
      this.edit(hit.id);
    } else this.newText(p);
  }

  wheel(sp: Pt, dx: number, dy: number, zoom: boolean) {
    const s = this.store;
    this.stopGlide();
    if (zoom) this.zoomAt(sp, Math.exp(-dy * 0.01));
    else {
      s.setCamera({ x: s.cam.x + dx / s.cam.z, y: s.cam.y + dy / s.cam.z, z: s.cam.z });
      this.invalidate();
    }
  }

  /** Update what the pointer is over. Returns whether anything visible changed. */
  private hover(sp: Pt, p: Pt): boolean {
    const s = this.store, o = this.overlay;
    const was = `${o.hoverFrame?.x},${o.hoverFrame?.y}|${o.stubsFor}|${o.onlyStub}|${o.hoverStub}|${o.hover}|${o.bindBox}|${o.bindPoint?.x},${o.bindPoint?.y}`;
    const one = this.single();
    o.stubsFor = one && isBox(one) && !wiring(s.tool) && this.opts.connect !== "keys" ? one.id : null;
    o.onlyStub = -1;
    // a finger cannot approach without touching, so for it every stub shows
    if (o.stubsFor && isBox(one) && this.opts.connect === "hover" && !this.finger) {
      // only the stub nearest the pointer shows, and only when the pointer is close
      const pts = visibleStubs(s.doc, one, s.cam.z);
      let best = -1, bd = 40;
      pts.forEach((pt, i) => {
        const d = pt ? dist(sp, this.screen(pt)) : Infinity;
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) o.stubsFor = null;
      else o.onlyStub = best;
    }
    const h = this.handleAt(sp);
    o.hoverStub = h?.type === "stub" ? h.dir : -1;
    const wasTurn = o.hoverRotate;
    o.hoverRotate = h?.type === "rotate";
    const hit = h ? undefined : this.hit(p);
    o.hover = hit ? hit.id : null;
    // over any part of a group, or the space between, its frame shows: the frame is there to be taken too
    const fr = !h && s.tool === "select" ? this.groupAt(p) : null;
    o.hoverFrame = fr && fr.g !== this.scope && !this.members(s.doc, fr.g).every((m) => s.sel.has(m.id)) ? fr.r : null;
    if (wiring(s.tool)) {
      const b = boxAt(s.doc, p);
      o.bindBox = b ? b.id : null;
      if (b) {
        const a = this.anchor(b, p);
        o.bindPoint = { x: b.x + a.ax * b.w, y: b.y + a.ay * b.h };
      } else o.bindPoint = null;
    }
    return wasTurn !== o.hoverRotate || was !== `${o.hoverFrame?.x},${o.hoverFrame?.y}|${o.stubsFor}|${o.onlyStub}|${o.hoverStub}|${o.hover}|${o.bindBox}|${o.bindPoint?.x},${o.bindPoint?.y}`;
  }
  private refreshCursor(sp: Pt) {
    const s = this.store, g = this.g;
    let c = "default";
    if (g.type === "pan") c = "grabbing";
    else if (this.space || s.tool === "hand") c = "grab";
    else if (g.type === "resize") c = resizeCursor(g.h, g.rot);
    else if (g.type === "rotate") c = TURN_CURSOR;
    else if (g.type === "grip") c = "ew-resize";
    else if (g.type === "idle") {
      const h = this.handleAt(sp);
      if (h?.type === "resize") c = resizeCursor(h.h, selectionFrame(s.doc, s.sel)?.rot ?? 0);
      else if (h?.type === "rotate") c = TURN_CURSOR;
      else if (h?.type === "grip") c = "ew-resize";
      else if (h) c = "pointer";
      else if (wiring(s.tool)) c = "crosshair";
      else if (making(s.tool) || s.tool === "stamp") c = "crosshair";
      else if (this.overlay.hover) c = "default";
      else if (s.tool === "text") c = "text";
      else if (s.tool !== "select") c = "crosshair";
    } else if (g.type === "draw" || g.type === "arrow") c = "crosshair";
    if (c !== this.cursor) {
      this.cursor = c;
      s.emit();
    }
  }

  // ── moving and resizing ─────────────────────────────────────────
  private snapshot(ids: Iterable<Id>): Map<Id, Shape> {
    const m = new Map<Id, Shape>();
    for (const id of ids) {
      const sh = this.store.doc.shapes[id];
      if (sh) m.set(id, sh);
    }
    return m;
  }
  /** The selection, plus arrows whose both ends ride on selected boxes. */
  private movingSet(): Set<Id> {
    return this.withinside(this.store.sel);
  }
  /** These shapes and whatever sits inside them: what stands wholly within a panel, a machine or a fence
   *  (and above it) belongs to it, and goes where it goes. */
  private withinside(ids: Iterable<Id>): Set<Id> {
    const doc = this.store.doc, out = new Set(ids);
    const holders = [...out].map((id) => doc.shapes[id]).filter((sh): sh is Box => isBox(sh) && !sh.rot && (sh.kind === "panel" || sh.kind === "machine" || sh.kind === "boundary" || sh.kind === "frame"));
    // a port is fixed to the rim it sits on: it goes with that shape
    const hosts = [...out].map((id) => doc.shapes[id]).filter((sh): sh is Box => isBox(sh) && !sh.rot && sh.kind !== "pad" && sh.kind !== "junction" && sh.kind !== "boundary" && sh.kind !== "frame");
    if (hosts.length) for (const id of doc.order) {
      const p = doc.shapes[id]!;
      if (!isBox(p) || p.kind !== "pad" || out.has(id) || p.locked) continue;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, m = Math.max(p.w, p.h) * 0.75;
      if (hosts.some((h) => h.group === p.group && !!h.away === !!p.away && cx >= h.x - m && cx <= h.x + h.w + m && cy >= h.y - m && cy <= h.y + h.h + m && Math.min(Math.abs(cx - h.x), Math.abs(cx - h.x - h.w), Math.abs(cy - h.y), Math.abs(cy - h.y - h.h)) <= m)) out.add(id);
    }
    // a wire with corners of its own, joined to something that is going, has those corners looked after as it goes
    for (const id of doc.order) { const sh = doc.shapes[id]!; if (isArrow(sh) && sh.via?.length && !out.has(id) && !sh.locked && [sh.a, sh.b].some((e) => e.bind && out.has(e.bind.id))) out.add(id); }
    if (!holders.length) return out;
    for (const h of holders) {
      const from = doc.order.indexOf(h.id);
      for (let i = from + 1; i < doc.order.length; i++) {
        const sh = doc.shapes[doc.order[i]!]!;
        if (out.has(sh.id) || sh.locked || sh.group !== h.group || !!sh.away !== !!h.away) continue;
        // a wire joined to something outside stays joined there; a loose one inside comes along
        if (isArrow(sh) ? !sh.a.bind && !sh.b.bind && contains(h, bounds(doc, sh)) : contains(h, sh)) out.add(sh.id);
      }
    }
    // a wire between two things that are both going goes whole, corners and all
    for (const id of doc.order) { const sh = doc.shapes[id]!; if (isArrow(sh) && !out.has(id) && sh.a.bind && sh.b.bind && out.has(sh.a.bind.id) && out.has(sh.b.bind.id)) out.add(id); }
    return out;
  }
  /** May lines catch what is being dragged right now? One rule for moving,
   *  drawing and resizing. In flight nothing catches; `atRest` is for a
   *  placement that is not a drag at all. */
  private catching(off: boolean, atRest = false): boolean {
    if (!this.store.snap) return false;
    const m = this.opts.snap;
    if (m === "off") return false;
    if (m === "held") return off; // ⌘ asks for lines in this mode
    return !off && (m === "always" || atRest || this.speed < 0.35);
  }
  /** An arrow dragged by its own body comes away from the boxes it was
   *  joined to, unless one of those boxes is coming along. Its ends stay
   *  exactly where they were drawn. */
  private detached(orig: Map<Id, Shape>): Map<Id, Shape> {
    const doc = this.store.doc;
    for (const [id, sh] of orig) {
      if (!isArrow(sh)) continue;
      const rides = (e: End) => !!e.bind && orig.has(e.bind.id);
      if (rides(sh.a) || rides(sh.b) || (!sh.a.bind && !sh.b.bind)) continue;
      const pts = arrowPath(doc, sh);
      const free = (e: End, at: Pt | undefined): End => (e.bind && at ? { x: at.x, y: at.y } : e);
      orig.set(id, { ...sh, a: free(sh.a, pts[0]), b: free(sh.b, pts[pts.length - 1]) });
    }
    return orig;
  }
  private applyMove(orig: Map<Id, Shape>, d: Pt, axisLock: boolean, noSnap: boolean) {
    const s = this.store;
    let dx = d.x, dy = d.y;
    if (axisLock) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const solid = [...orig.values()].filter((sh) => !isArrow(sh));
    this.overlay.guides = [];
    // Snapping must never make a drag feel sticky. By default a shape in
    // full flight goes exactly where the pointer goes; lines only catch it
    // as the hand slows to place it. ⌘ turns snapping off for the drag.
    const mode = this.opts.snap;
    if (this.catching(noSnap) && solid.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const sh of solid) {
        const r = aabb(sh as Rect & { rot?: number });
        x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
      }
      const sn = snapRect({ x: x0 + dx, y: y0 + dy, w: x1 - x0, h: y1 - y0 }, snapTargets(s.doc, new Set(orig.keys()), this.viewRect(), { x: x0 + dx, y: y0 + dy, w: x1 - x0, h: y1 - y0 }), (mode === "always" ? 6 : 5) / s.cam.z, [0, 1, 2], [0, 1, 2], mode === "always");
      dx += axisLock && dx === 0 ? 0 : sn.dx;
      dy += axisLock && dy === 0 ? 0 : sn.dy;
      this.overlay.guides = sn.guides;
    }
    const next: Shape[] = [];
    for (const sh of orig.values()) {
      if (isArrow(sh)) {
        // a free end moves; a bound end stays with its box
        const held = (e: End) => !!e.bind && !orig.has(e.bind.id);
        if (held(sh.a) && held(sh.b)) continue; // nothing of it can move: leave it exactly as it is
        const mv = (e: End): End => (held(e) ? e : { ...e, x: e.x + dx, y: e.y + dy });
        next.push({ ...sh, a: mv(sh.a), b: mv(sh.b), ...rerouted(sh, (e) => !held(e), dx, dy) });
      } else next.push({ ...sh, x: sh.x + dx, y: sh.y + dy });
    }
    if (next.length) s.put(...next);
    s.emit();
  }
  /** Turn the selection about its middle. Shift steps by 15°; otherwise it
   *  settles onto upright and the quarter turns when it comes within 2°. */
  private applyRotate(g: Extract<Gesture, { type: "rotate" }>, p: Pt, steps: boolean) {
    const s = this.store;
    let total = normAngle(g.base + Math.atan2(p.y - g.c.y, p.x - g.c.x) - g.start);
    const STEP = Math.PI / 12, QUARTER = Math.PI / 2;
    if (steps) total = Math.round(total / STEP) * STEP;
    else if (Math.abs(total - Math.round(total / QUARTER) * QUARTER) < 0.035) total = Math.round(total / QUARTER) * QUARTER;
    const d = total - g.base;
    const next: Shape[] = [];
    for (const sh of g.orig.values()) {
      if (isArrow(sh)) {
        // a free end goes round with the rest; an end joined to a box stays with its box
        const mv = (e: End): End => (e.bind ? e : { ...e, ...turn(e, g.c, d) });
        if (sh.a.bind && sh.b.bind) continue;
        next.push({ ...sh, a: mv(sh.a), b: mv(sh.b) });
      } else {
        const c = turn(center(sh), g.c, d), rot = normAngle(rotOf(sh) + d);
        const o: Box | Text = { ...sh, x: c.x - sh.w / 2, y: c.y - sh.h / 2, rot };
        if (!rot) delete o.rot;
        next.push(o);
      }
    }
    if (next.length) s.put(...next);
    s.emit();
  }
  private applyResize(g: Extract<Gesture, { type: "resize" }>, p: Pt, keepAspect: boolean, fromCentre: boolean, noSnap: boolean) {
    const s = this.store, f = g.from;
    const c0 = center(f);
    // a turned shape is resized in its own upright terms, then set back at its angle
    if (g.rot) p = turn(p, c0, -g.rot);
    if (g.uniform) keepAspect = true;
    let l = f.x, t = f.y, r = f.x + f.w, b = f.y + f.h;
    const h = g.h;
    const movesL = h === 0 || h === 3 || h === 7, movesR = h === 1 || h === 2 || h === 5;
    const movesT = h === 0 || h === 1 || h === 4, movesB = h === 2 || h === 3 || h === 6;
    let q = p;
    this.overlay.guides = [];
    if (this.catching(noSnap) && !keepAspect && !g.rot) {
      const probe: Rect = { x: movesL ? p.x : l, y: movesT ? p.y : t, w: 0, h: 0 };
      probe.w = (movesR ? p.x : r) - probe.x;
      probe.h = (movesB ? p.y : b) - probe.y;
      const sn = snapRect(normRect({ x: probe.x, y: probe.y }, { x: probe.x + probe.w, y: probe.y + probe.h }),
        snapTargets(s.doc, new Set(g.orig.keys()), this.viewRect()), 6 / s.cam.z,
        movesL ? [0] : movesR ? [2] : [], movesT ? [0] : movesB ? [2] : []);
      q = { x: p.x + sn.dx, y: p.y + sn.dy };
      this.overlay.guides = sn.guides;
    }
    if (movesL) l = q.x;
    if (movesR) r = q.x;
    if (movesT) t = q.y;
    if (movesB) b = q.y;
    if (keepAspect && f.w > 0 && f.h > 0) {
      if (h < 4) {
        // from the corner that stays put, toward wherever the pointer has gone
        const k = Math.max(Math.abs(r - l) / f.w, Math.abs(b - t) / f.h);
        const w = f.w * k, hh = f.h * k;
        const ax = movesL ? r : l, ay = movesT ? b : t;
        const dx = (movesL ? l : r) >= ax ? w : -w, dy = (movesT ? t : b) >= ay ? hh : -hh;
        if (movesL) l = ax + dx; else r = ax + dx;
        if (movesT) t = ay + dy; else b = ay + dy;
      } else if (h === 5 || h === 7) {
        // an edge sets the size; the other dimension follows about its middle
        const hh = (Math.abs(r - l) / f.w) * f.h, cy = f.y + f.h / 2;
        t = cy - hh / 2; b = cy + hh / 2;
      } else {
        const w = (Math.abs(b - t) / f.h) * f.w, cx = f.x + f.w / 2;
        l = cx - w / 2; r = cx + w / 2;
      }
    }
    if (fromCentre) {
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      if (movesL || movesR) { const half = Math.abs((movesL ? l : r) - cx); l = cx - half; r = cx + half; }
      if (movesT || movesB) { const half = Math.abs((movesT ? t : b) - cy); t = cy - half; b = cy + half; }
    }
    const nx = Math.min(l, r);
    let ny = Math.min(t, b);
    const nw = Math.max(MIN, Math.abs(r - l));
    let nh = Math.max(MIN, Math.abs(b - t));
    // no labelled box gets smaller than its words; the edge you are not dragging stays put
    const kx0 = f.w ? nw / f.w : 1;
    let least = 0;
    for (const sh of g.orig.values()) {
      if (isBox(sh) && sh.text && sh.h > 0) least = Math.max(least, (this.labelNeed({ ...sh, w: Math.max(MIN, sh.w * kx0) }) / sh.h) * f.h);
    }
    if (nh < least) {
      if (movesT && !movesB) ny = ny + nh - least;
      nh = least;
    }
    const kx = f.w ? nw / f.w : 1, ky = f.h ? nh / f.h : 1;
    // where a point of the old frame lands in the new one
    const place = (q: Pt): Pt => turn({ x: nx + (q.x - f.x) * kx, y: ny + (q.y - f.y) * ky }, c0, g.rot);
    const next: Shape[] = [];
    for (const sh of g.orig.values()) {
      if (isArrow(sh)) {
        const mv = (e: End): End => (e.bind ? e : { ...e, ...place(e) });
        next.push({ ...sh, a: mv(sh.a), b: mv(sh.b) });
      } else if (isText(sh)) {
        // text keeps its proportions, so it scales by the smaller factor and stays inside the frame
        const size = Math.min(400, Math.max(6, sh.size * Math.min(kx, ky)));
        const l = textLayout(sh, sh.text, size);
        const c = place(sh.rot ? center(sh) : { x: sh.x, y: sh.y });
        next.push(sh.rot ? { ...sh, x: c.x - l.w / 2, y: c.y - l.h / 2, size, w: l.w, h: l.h } : { ...sh, x: c.x, y: c.y, size, w: l.w, h: l.h });
      } else {
        const w = Math.max(MIN, sh.w * kx), hh = Math.max(MIN, sh.h * ky), c = place(center(sh));
        // a thing inside a panel that is being resized is scaled whole: its words, its header and its margins with it
        const k = g.riders?.has(sh.id) ? Math.min(kx, ky) : 1, kind = KINDS[sh.kind];
        const scaled = k === 1 ? {} : { size: Math.min(400, Math.max(5, (sh.size ?? (kind.label === "header" ? (sh.kind === "machine" ? 12 : 11) : LABEL_SIZE)) * k)), ...(sh.head === undefined ? {} : { head: sh.head * k }), ...(sh.pad === undefined ? {} : { pad: sh.pad * k }) };
        next.push({ ...sh, x: c.x - w / 2, y: c.y - hh / 2, w, h: hh, ...scaled });
      }
    }
    s.put(...next);
    s.emit();
  }
  /** A new shape of `kind`, in the colours last used. */
  /** What a new shape needs to belong where it is made: inside the group that is stepped into, if one is. */
  private within(): { group?: Id } {
    return this.scope ? { group: this.scope } : {};
  }
  private fresh(id: Id, kind: BoxKind, r: Rect): Box {
    const k = KINDS[kind];
    // (a conversation, terminal or page made while a drawing that plays is stepped into isn't made part of it; one made in
    // a group that stays still is, as before)
    const live = kind === "thread" || kind === "terminal" || kind === "browser";
    const out = live && !!this.scope && !!this.store.doc.scenes?.[this.scope];
    return { id, kind, ...r, text: "", tone: this.style.tone, fill: k.fills ? this.style.fill : "none", ...(k.level ? { value: k.level.start } : {}), ...(out ? {} : this.within()) };
  }
  /** What one step of the selected timeline stands for ("100 ms"); empty, its gaps are counted in steps. */
  unit(u: string) {
    const b = this.single();
    if (!b || !isBox(b) || b.kind !== "timeline" || (b.unit ?? "") === u) return;
    const { unit: _u, ...rest } = b;
    this.store.run(() => this.store.put(u ? { ...rest, unit: u } : rest));
    this.invalidate();
  }
  /** Raise or lower the level the selected marks show, a step at a time. */
  level(dir: 1 | -1) {
    if (this.g.type !== "idle") return;
    const s = this.store, next: Shape[] = [];
    for (const sh of this.selected()) {
      const lv = isBox(sh) ? KINDS[sh.kind].level : undefined;
      if (!isBox(sh) || !lv) continue;
      // a timeline goes as far as its points, segments as far as their parts, units as far as their columns
      const top = sh.kind === "table" ? tableRows(sh.text).length : sh.kind === "timeline" ? timelinePoints(sh).at.length : sh.kind === "segments" ? segmentParts(sh).ws.length : sh.kind === "units" ? unitColumns(sh).length : lv.max;
      const v = Math.min(top, Math.max(sh.kind === "timeline" ? 1 : 0, Math.round((Math.min(top, sh.value ?? lv.start) + dir * lv.step) * 100) / 100));
      if (v !== sh.value) next.push({ ...sh, value: v });
    }
    if (next.length) s.run(() => s.put(...next));
    this.invalidate();
  }
  /** The least height a box needs to hold its label. */
  private labelNeed(b: Box): number {
    // only words set in a shape's middle can outgrow it
    if (b.kind === "table") return tableRows(b.text).length * 26; // every row keeps room for its words
    if (!b.text || KINDS[b.kind].label !== "centre" || b.kind === "button") return MIN;
    const l = layoutText(labelText(b), labelWidth(b), b.size ?? LABEL_SIZE, labelTrack(b));
    if (b.kind !== "ellipse" && b.kind !== "diamond") return l.h + PAD * (b.kind === "pill" ? 0.6 : 1.25);
    if (b.kind === "ellipse") return l.h * 1.6 + PAD;
    // a diamond narrows toward its points: tall enough that the label's corners clear the slopes
    const across = Math.min(0.8, (l.w + PAD) / (b.w || 1));
    return l.h / (1 - across) + 4;
  }
  /** `b`, grown about its centre if its label does not fit. Never shrinks. */
  private fitted(b0: Box): Box {
    return withFace(b0.face, () => this.fitted0(b0));
  }
  private fitted0(b0: Box): Box {
    let b = b0;
    if ((b.kind === "ellipse" || b.kind === "diamond") && b.text) {
      // a round or pointed shape widens first, so a short phrase stays on a line or two
      while (b.w < 360 && layoutText(b.text, labelWidth(b), b.size ?? LABEL_SIZE).lines.length > 2) b = { ...b, x: b.x - 12, w: b.w + 24 };
    }
    const need = this.labelNeed(b);
    return need > b.h ? { ...b, y: b.y - (need - b.h) / 2, h: need } : b;
  }
  private fitLabel(id: Id) {
    const b = this.store.doc.shapes[id];
    if (!isBox(b)) return;
    const f = this.fitted(b);
    if (f !== b) this.store.put(f);
  }

  // ── arrows ──────────────────────────────────────────────────────
  private endAt(p: Pt, skip?: Id, line = false): End {
    const b = boxAt(this.store.doc, p, skip ? new Set([skip]) : undefined);
    if (!b) return { x: p.x, y: p.y };
    // a plain line is drawn freely, over and inside shapes: it holds on to one only when its end is put on the centre
    if (line) return dist(p, center(b)) * this.store.cam.z <= LINE_HOLD ? { x: p.x, y: p.y, bind: { id: b.id, ax: 0.5, ay: 0.5 } } : { x: p.x, y: p.y };
    return { x: p.x, y: p.y, bind: { id: b.id, ...this.anchor(b, p) } };
  }
  /** Where on a box a dropped arrow end attaches. Shipped: anywhere in the
   *  body means the centre, only the rim pins a spot. Alternative: always
   *  exactly where it was dropped. */
  private anchor(b: Box, p: Pt): { ax: number; ay: number } {
    if (this.opts.attach === "exact") {
      p = toLocal(b, p);
      const f = (v: number) => Math.min(1, Math.max(0, v));
      return { ax: f((p.x - b.x) / (b.w || 1)), ay: f((p.y - b.y) / (b.h || 1)) };
    }
    return anchorFor(b, p, 10 / this.store.cam.z);
  }
  private beginArrow(p: Pt, sp: Pt, from: Box | null) {
    const s = this.store;
    s.mark();
    // (started on a box's rim, it starts at that spot, as an end dropped there would; anywhere in its body, at its middle;
    // a plain line starts free unless it starts on a centre, and starts straight, so pulling its middle bends it)
    const line = this.store.tool === "line";
    const a: End = line ? this.endAt(p, undefined, true) : from ? { x: p.x, y: p.y, bind: { id: from.id, ...this.anchor(from, p) } } : this.endAt(p);
    const arrow: Arrow = { ...this.within(), id: newId(), kind: "arrow", a, b: { x: p.x, y: p.y }, text: "", route: line ? "straight" : this.style.route, heads: line ? "none" : "end", tone: this.style.tone === "ink" ? "ink" : this.style.tone };
    s.put(arrow);
    this.g = { type: "arrow", id: arrow.id, end: "b", fresh: true, down: sp, moved: false, spawn: line ? null : from };
    this.overlay.busy = true;
  }
  private dragEnd(g: Extract<Gesture, { type: "arrow" }>, p: Pt, constrain: boolean) {
    const s = this.store;
    const arrow = s.doc.shapes[g.id];
    if (!isArrow(arrow)) return;
    const other = arrow[g.end === "a" ? "b" : "a"];
    const end = this.endAt(p, other.bind?.id, arrow.heads === "none");
    const o = endPoint(s.doc, other);
    if (!end.bind) {
      // a line snaps level or upright when it is nearly so, as in any drawing tool; hold shift for diagonals too
      const step = constrain ? Math.PI / 4 : Math.PI / 2, raw = Math.atan2(p.y - o.y, p.x - o.x), ang = Math.round(raw / step) * step;
      if (constrain || Math.abs(normAngle(raw - ang)) < SNAP_ANGLE) {
        const len = dist(p, o);
        end.x = o.x + Math.cos(ang) * len;
        end.y = o.y + Math.sin(ang) * len;
      }
    } else if (!constrain) {
      // and into a box: its end moves along the facing side to meet the other end straight on; or, when it cannot, the
      // other end does (when it sits in the middle of a box that faces this one)
      const b = s.doc.shapes[end.bind.id] as Box | undefined, at = b && straightOn(b, o, end.bind, endPoint(s.doc, end));
      if (at) end.bind = { ...end.bind, ...at };
      else if (other.bind) {
        const ob = s.doc.shapes[other.bind.id] as Box | undefined, here = endPoint(s.doc, end), there = ob && straightOn(ob, here, other.bind, o);
        if (there) s.patch<Arrow>(arrow.id, { [g.end === "a" ? "b" : "a"]: { ...other, bind: { ...other.bind, ...there } } } as Partial<Arrow>);
      }
    }
    this.overlay.bindBox = end.bind ? end.bind.id : null;
    this.overlay.bindPoint = end.bind ? endPoint(s.doc, end) : null;
    s.patch<Arrow>(arrow.id, { [g.end]: end } as Partial<Arrow>);
    s.select([arrow.id]);
    s.emit();
  }
  private finishArrow(g: Extract<Gesture, { type: "arrow" }>, p: Pt) {
    const s = this.store;
    const arrow = s.doc.shapes[g.id];
    if (!isArrow(arrow)) return void s.cancel();
    if (!g.moved) {
      // a click, not a drag. On an existing end it selects what lies under it,
      // so an anchor inside a box never stops you picking up the box
      s.cancel();
      if (!g.fresh) {
        const under = hitTest(s.doc, p, 4 / s.cam.z, (sh) => sh.id === g.id);
        if (under) s.select([under.id]);
      }
      return;
    }
    const pts = arrowPath(s.doc, arrow);
    const tooShort = dist(endPoint(s.doc, arrow.a), endPoint(s.doc, arrow.b)) * s.cam.z < 8;
    // an arrow with no length is no arrow: a new one is dropped, an old one goes back as it was
    if (tooShort) return void s.cancel();
    // pulled out of a box and dropped on nothing: a new box grows there
    if (g.spawn && !arrow.b.bind && pts.length) {
      const src = g.spawn;
      const nb: Box = { ...src, id: newId(), text: "", x: p.x - src.w / 2, y: p.y - src.h / 2 };
      const sn = snapRect(nb, snapTargets(s.doc, new Set(), this.viewRect()), 16 / s.cam.z);
      nb.x += sn.dx;
      nb.y += sn.dy;
      s.put(nb, { ...arrow, b: { x: p.x, y: p.y, bind: { id: nb.id, ax: 0.5, ay: 0.5 } } });
      s.select([nb.id]);
      s.editing = nb.id; // stays one undo step with the typing that follows
      return;
    }
    s.select([arrow.id]);
    s.commit();
  }

  /** Add a box beside the selected one, joined by an arrow, ready to type in. */
  quickCreate(dir: number) {
    const s = this.store;
    const real = this.single();
    if (!isBox(real)) return;
    // a turned box is stepped away from by the upright frame that holds it
    const src: Box = { ...real, ...aabb(real) };
    const horizontal = dir === 0 || dir === 2;
    // what follows a decision is a step: a diamond's neighbour is a rectangle of the usual size
    // the new box stands upright, whatever its neighbour does
    const upright: Box = { ...real };
    delete upright.rot;
    // a step follows a step of the same kind; after anything else (a decision, a mark, a fence) comes a plain rectangle
    const chains = ["rect", "ellipse", "card", "machine", "panel", "pill"].includes(src.kind);
    delete upright.value;
    const nb: Box = chains ? { ...upright, id: newId(), text: "" } : { ...upright, id: newId(), text: "", kind: "rect", w: DEFAULT_W, h: DEFAULT_H, fill: this.style.fill };
    if (!chains) {
      nb.x = src.x + src.w / 2 - nb.w / 2;
      nb.y = src.y + src.h / 2 - nb.h / 2;
    }
    const sx0 = nb.x, sy0 = nb.y;
    nb.x = dir === 0 ? src.x + src.w + GAP : dir === 2 ? src.x - nb.w - GAP : sx0;
    nb.y = dir === 1 ? src.y + src.h + GAP : dir === 3 ? src.y - nb.h - GAP : sy0;
    // if that spot is taken, step sideways until one is free, so repeated adds fan out
    const blocker = (r: Rect) => {
      for (const id of s.doc.order) {
        const o = s.doc.shapes[id];
        if (o && !isArrow(o) && overlaps({ x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }, aabb(o))) return aabb(o);
      }
      return undefined;
    };
    // each step clears whatever is in the way, however large, so a free spot is always reached
    for (let i = 0; i < 200; i++) {
      const o = blocker(nb);
      if (!o) break;
      if (horizontal) nb.y = Math.max(nb.y + nb.h + 24, o.y + o.h + 24);
      else nb.x = Math.max(nb.x + nb.w + 24, o.x + o.w + 24);
    }
    s.mark();
    const arrow: Arrow = {
      ...(src.group ? { group: src.group } : {}), id: newId(), kind: "arrow", text: "", route: this.style.route, heads: "end", tone: src.tone === "muted" ? "muted" : "ink",
      a: { x: 0, y: 0, bind: { id: src.id, ax: 0.5, ay: 0.5 } },
      b: { x: 0, y: 0, bind: { id: nb.id, ax: 0.5, ay: 0.5 } },
    };
    s.put(nb, arrow);
    s.select([nb.id]);
    s.editing = nb.id;
    this.reveal(nb);
    s.emit();
    this.invalidate();
  }

  // ── text ────────────────────────────────────────────────────────
  private newText(p: Pt) {
    const s = this.store;
    s.mark();
    const t: Text = { ...this.within(), id: newId(), kind: "text", x: p.x, y: p.y - (18 * LINE) / 2, w: 2, h: 18 * LINE, text: "", size: 18, tone: this.style.tone };
    s.put(t);
    s.select([t.id]);
    s.editing = t.id;
    s.emit();
    this.invalidate();
  }
  edit(id: Id) {
    const s = this.store;
    if (!s.doc.shapes[id]) return;
    if (isLive(s.doc.shapes[id])) return this.focusOn(id);
    s.mark();
    s.editing = id;
    s.emit();
    this.invalidate();
  }
  /** Finish typing. One undo step covers the shape and its words. */
  commitText(text: string) {
    const s = this.store;
    const id = s.editing;
    if (!id) return;
    s.editing = null;
    const sh = s.doc.shapes[id];
    const clean = text.replace(/ /g, " ").replace(/\s+$/g, "");
    if (!sh) return void s.commit();
    if (isText(sh)) {
      if (!clean) {
        s.remove([id]);
      } else {
        const l = textLayout(sh, clean);
        if (clean !== sh.text || l.w !== sh.w) s.patch<Text>(id, { text: clean, w: l.w, h: l.h });
      }
    } else if (clean !== sh.text) {
      s.patch(id, { text: clean });
      this.fitLabel(id);
    }
    this.echoText(id, sh.text);
    s.commit();
    // one use, then back to the pointer; a text abandoned empty is not a use
    if (this.opts.arm === "once" && s.tool === "text" && clean) s.setTool("select");
    this.invalidate();
  }

  /** Words changed in one moment say so from that moment on: the moments after it that still said the old thing follow,
   *  up to the first that says something else. The moments before keep what they said, so what a thing says can change
   *  as the drawing plays (typed in the first moment, a change reaches them all). */
  private echoText(id: Id, was: string) {
    const s = this.store, now = s.doc.shapes[id], g = now?.group, sc = g ? s.doc.scenes?.[g] : undefined;
    if (!now || !g || !sc || now.text === was) return;
    let on = true;
    const moments = sc.moments.map((m, i) => {
      if (i <= sc.at || !on) return m;
      const there = m.shapes.find((sh) => sh.id === id);
      if (there && there.text !== was) { on = false; return m; }
      return { ...m, shapes: m.shapes.map((sh) => (sh.id !== id ? sh : isText(sh) && isText(now) ? { ...sh, text: now.text, w: now.w, h: now.h } : { ...sh, text: now.text })) };
    });
    s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { ...sc, moments } } });
  }

  // ── commands ────────────────────────────────────────────────────
  setTool(t: Tool) {
    this.abort();
    if (t !== "stamp") this.disarm();
    this.store.setTool(t);
    this.overlay.bindBox = null;
    this.overlay.bindPoint = null;
    this.refreshCursor(this.last);
    this.invalidate();
  }
  remove() {
    if (this.g.type !== "idle") return;
    const s = this.store;
    if (!s.sel.size) return;
    s.run(() => {
      const gone = new Set(s.sel);
      // a wire is fixed to what it joins: it goes when either of those goes, rather than being left pointing at nothing
      for (const id of s.doc.order) { const w = s.doc.shapes[id]!; if (isArrow(w) && !w.locked && [w.a, w.b].some((e) => e.bind && gone.has(e.bind.id) && !isArrow(s.doc.shapes[e.bind.id]))) gone.add(id); }
      s.remove([...gone]);
      // deleted means gone: from every moment of a group that moves, not only the one on show
      this.tidyScenes(gone);
    });
    this.overlay.hover = null;
    this.overlay.stubsFor = null;
    this.invalidate();
  }
  selectAll() {
    const doc = this.store.doc;
    this.store.select(doc.order.filter((id) => !doc.shapes[id]?.locked));
    this.store.emit();
    this.invalidate();
  }
  /** Copies of `shapes` with fresh ids; arrows keep bindings to boxes copied with them. */
  private clone(shapes: Shape[], dx: number, dy: number): Shape[] {
    const doc = this.store.doc;
    const map = new Map<Id, Id>();
    for (const sh of shapes) map.set(sh.id, newId());
    // copies of grouped shapes form a group of their own
    const groups = new Map<Id, Id>();
    const regroup = <T extends Shape>(sh: T): T => {
      if (!sh.group) return sh;
      if (!groups.has(sh.group)) groups.set(sh.group, newId());
      return { ...sh, group: groups.get(sh.group)! };
    };
    // (every group's copy is named before any shape is copied, so what a copied thread is connected to can follow it)
    for (const sh of shapes) if (sh.group && !groups.has(sh.group)) groups.set(sh.group, newId());
    this.cloned = { map, groups, dx, dy };
    return shapes.map((sh0) => {
      const sh = regroup(sh0);
      const id = map.get(sh.id)!;
      if (!isArrow(sh)) {
        // what a copied thread is connected to, and whose a copied page is, are the copies where those were copied too
        const live = (sh as Box).live;
        // (a copy the person made is the person's doing, whoever made the original)
        const { by: _by, ...kept } = live ?? {};
        const moved = live
          ? { live: { ...kept, ...(live.from && map.has(live.from) ? { from: map.get(live.from)! } : {}), ...(live.sees ? { sees: live.sees.map((k) => k.replace(/[^:,]+(?=,|$)/g, (x) => map.get(x) ?? groups.get(x) ?? x)) } : {}) } }
          : {};
        // (a copied picture likewise: the person's)
        const img = (sh as Box).img;
        const pic = img?.by ? { img: (({ by: _b, ...rest }) => rest)(img) } : {};
        return { ...sh, id, x: sh.x + dx, y: sh.y + dy, ...moved, ...pic };
      }
      // an end whose box is not copied lets go where the arrow visibly ends
      const pts = arrowPath(doc, sh);
      const re = (e: End, tip: Pt | undefined): End => {
        const to = e.bind ? map.get(e.bind.id) : undefined;
        // (its place kept with it, moved as the copy is: a moment that keeps it keeps where it is)
        if (e.bind && to) return { ...e, x: e.x + dx, y: e.y + dy, bind: { ...e.bind, id: to } };
        const at = e.bind && tip ? tip : endPoint(doc, e);
        return { x: at.x + dx, y: at.y + dy };
      };
      return { ...sh, id, a: re(sh.a, pts[0]), b: re(sh.b, pts[pts.length - 1]), ...carried(sh, dx, dy) };
    });
  }
  /** Keep the moments honest after shapes are deleted or regrouped: deleted shapes leave every moment, and a
   *  group with nothing left on the board (dissolved, or emptied) is no longer one that moves. */
  private tidyScenes(deleted?: Set<Id>) {
    const s = this.store, scenes0 = s.doc.scenes;
    if (!scenes0) return;
    let doc = s.doc, changed = false;
    const scenes: Record<Id, Scene> = {};
    for (const [g, sc0] of Object.entries(scenes0)) {
      let sc = sc0;
      if (deleted && sc.moments.some((m) => m.shapes.some((sh) => deleted.has(sh.id)))) {
        changed = true;
        sc = { ...sc, moments: sc.moments.map((m) => ({ ...m, shapes: m.shapes.filter((sh) => !deleted.has(sh.id)).map((sh) => {
          // a wire joined to something deleted lets go there
          if (!isArrow(sh)) return sh;
          const free = (e: End): End => (e.bind && deleted.has(e.bind.id) ? { x: e.x, y: e.y } : e);
          return { ...sh, a: free(sh.a), b: free(sh.b) };
        }) })) };
      }
      const live = this.members(doc, g);
      // moments left with nothing in them go; with fewer than two left, the group no longer moves
      const full = sc.moments.map((m, i) => (i === sc.at ? live.length > 0 : m.shapes.length > 0));
      if (full.every(Boolean)) { scenes[g] = sc; continue; }
      changed = true;
      if (!live.length && full.some(Boolean)) {
        // the moment on show was emptied: the nearest one with something in it takes its place on the board
        const to = full.findIndex(Boolean), target = sc.moments[to]!;
        doc = { ...doc, shapes: { ...doc.shapes, ...Object.fromEntries(target.shapes.map((sh) => [sh.id, sh])) }, order: [...doc.order, ...target.shapes.map((sh) => sh.id)] };
        sc = { ...sc, at: to };
      }
      const kept = sc.moments.filter((_, i) => full[i] || i === sc.at), at = kept.indexOf(sc.moments[sc.at]!);
      if (kept.length >= 2) scenes[g] = { moments: kept, at: Math.max(0, at) };
    }
    if (changed) s.setDoc({ shapes: doc.shapes, order: doc.order, ...(Object.keys(scenes).length ? { scenes } : {}) });
  }
  /** A group that moves, moved whole: its other moments go with it, so playing does not jump back to where it was. */
  private carryMoments(orig: Map<Id, Shape>) {
    const s = this.store;
    let scenes = s.doc.scenes;
    if (!scenes) return;
    for (const [g, sc] of Object.entries(scenes)) {
      const members = this.members(s.doc, g);
      if (g === this.scope || !members.length || !members.every((m) => orig.has(m.id))) continue;
      const now = members.find((m) => !isArrow(m)), was = now && orig.get(now.id);
      if (!now || !was || isArrow(now) || isArrow(was)) continue;
      const dx = now.x - was.x, dy = now.y - was.y;
      if (!dx && !dy) continue;
      scenes = { ...scenes, [g]: { ...sc, moments: sc.moments.map((m, i) => (i === sc.at ? m : { ...m, shapes: m.shapes.map((sh) => shifted(sh, dx, dy)) })) } };
    }
    if (scenes !== s.doc.scenes) s.setDoc({ ...s.doc, scenes });
  }
  /** A group that moves, resized whole: its other moments are resized the same way about the same frame. */
  private carryResize(orig: Map<Id, Shape>) {
    const s = this.store;
    let scenes = s.doc.scenes;
    if (!scenes) return;
    const docOf = (shapes: Shape[]): Doc => ({ shapes: Object.fromEntries(shapes.map((sh) => [sh.id, sh])), order: shapes.map((sh) => sh.id) });
    for (const [g, sc] of Object.entries(scenes)) {
      const members = this.members(s.doc, g);
      if (g === this.scope || !members.length || !members.every((m) => orig.has(m.id))) continue;
      const before = docOf(members.map((m) => orig.get(m.id)!)), was = boundsOf(before, before.order), now = boundsOf(s.doc, members.map((m) => m.id));
      if (!was || !now || was.w < 1 || was.h < 1) continue;
      const kx = now.w / was.w, ky = now.h / was.h;
      if (Math.abs(kx - 1) < 1e-6 && Math.abs(ky - 1) < 1e-6 && Math.abs(now.x - was.x) < 1e-6 && Math.abs(now.y - was.y) < 1e-6) continue;
      const px = (x: number) => now.x + (x - was.x) * kx, py = (y: number) => now.y + (y - was.y) * ky;
      const fit = (sh: Shape): Shape => {
        if (isArrow(sh)) { const e = (p: End): End => ({ ...p, x: px(p.x), y: py(p.y) }); return { ...sh, a: e(sh.a), b: e(sh.b), ...(sh.via ? { via: sh.via.map((p) => ({ x: px(p.x), y: py(p.y) })) } : {}) }; }
        if (isText(sh)) { const size = Math.min(400, Math.max(6, sh.size * Math.min(kx, ky))), l = textLayout(sh, sh.text, size); return { ...sh, x: px(sh.x), y: py(sh.y), size, w: l.w, h: l.h }; }
        return { ...sh, x: px(sh.x), y: py(sh.y), w: sh.w * kx, h: sh.h * ky };
      };
      scenes = { ...scenes, [g]: { ...sc, moments: sc.moments.map((m, i) => (i === sc.at ? m : { ...m, shapes: m.shapes.map(fit) })) } };
    }
    if (scenes !== s.doc.scenes) s.setDoc({ ...s.doc, scenes });
  }
  /** What the last copy was made of: old names to new, old groups to new, and how far it was moved. */
  private cloned: { map: Map<Id, Id>; groups: Map<Id, Id>; dx: number; dy: number } | null = null;
  /** The moments of copied groups, under the copies' names (a group copied whole keeps its moments). */
  private scenesFor(source: Record<Id, Scene> | undefined, dx = 0, dy = 0): Record<Id, Scene> {
    const c = this.cloned, out: Record<Id, Scene> = {};
    if (!c || !source) return out;
    for (const [g0, g1] of c.groups) {
      const sc = source[g0];
      if (!sc) continue;
      const names = new Map(c.map);
      const fresh = (id: Id) => names.get(id) ?? (names.set(id, newId()), names.get(id)!);
      out[g1] = { at: sc.at, moments: sc.moments.map((m) => { const here = new Set(m.shapes.map((x) => x.id)); return { ...m, id: newId(), shapes: m.shapes.map((sh): Shape => {
        const o = shifted({ ...sh, id: fresh(sh.id), group: g1 }, c.dx + dx, c.dy + dy);
        if (!isArrow(o)) return unowned(o as Box);
        // a wire joined to something outside its group lets go, as the copy on the board does, unless that was copied with
        // it (a conversation it is wired to, which is never in a moment): it is joined to the copy
        // (an end joined to such a card, which no moment holds, is on the card where it is now, the copy if it is on the
        // board yet, never where this moment last saw it; such cards are never turned)
        const re = (e: End): End => {
          if (!e.bind) return e;
          const to = fresh(e.bind.id);
          if (here.has(e.bind.id)) return { ...e, bind: { ...e.bind, id: to } };
          if (!c.map.has(e.bind.id)) return { x: e.x, y: e.y };
          const copy = this.store.doc.shapes[to], src = this.store.doc.shapes[e.bind.id];
          const t = copy && isBox(copy) ? copy : src && isBox(src) ? shifted(src, c.dx + dx, c.dy + dy) : null;
          return { ...(t && isBox(t) ? { x: t.x + e.bind.ax * t.w, y: t.y + e.bind.ay * t.h } : { x: e.x, y: e.y }), bind: { ...e.bind, id: to } };
        };
        return { ...o, a: re(o.a), b: re(o.b) };
      }) }; }) };
    }
    return out;
  }
  /** The scenes of the animated groups that are selected whole, up to date. */
  private wholeScenes(): Record<Id, Scene> {
    const s = this.store, out: Record<Id, Scene> = {};
    for (const g of Object.keys(s.doc.scenes ?? {})) { const m = this.members(s.doc, g); if (m.length && m.every((x) => s.sel.has(x.id))) out[g] = this.synced(s.doc, g); }
    return out;
  }
  private addScenes(scenes: Record<Id, Scene>) {
    const s = this.store;
    if (Object.keys(scenes).length) s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, ...scenes } });
  }
  private selected(): Shape[] {
    const s = this.store, doc = s.doc;
    if (!s.sel.size) return [];
    // (in the board's order, found from the selection rather than by reading the whole board)
    let at = orderAt.get(doc);
    if (!at) { at = new Map(doc.order.map((id, i) => [id, i])); orderAt.set(doc, at); }
    return [...s.sel].filter((id) => at!.has(id) && doc.shapes[id]).sort((x, y) => at!.get(x)! - at!.get(y)!).map((id) => doc.shapes[id]!);
  }
  private duplicateInPlace() {
    const s = this.store;
    const whole = this.wholeScenes(), copies = this.clone(this.selected(), 0, 0);
    s.put(...copies);
    this.addScenes(this.scenesFor(whole));
    s.select(copies.map((c) => c.id));
  }
  duplicate() {
    if (this.g.type !== "idle") return;
    const s = this.store;
    if (!s.sel.size) return;
    s.run(() => {
      const whole = this.wholeScenes(), copies = this.clone(this.selected(), 20, 20);
      s.put(...copies);
      this.addScenes(this.scenesFor(whole));
      s.select(copies.map((c) => c.id));
    });
    this.invalidate();
  }
  /** Moments that came with what is on the clipboard, by its groups. */
  private clipScenes: Record<Id, Scene> = {};
  copy() {
    const whole = this.wholeScenes();
    this.clip = this.clone(this.selected(), 0, 0);
    this.clipScenes = this.scenesFor(whole);
  }
  cut() {
    if (this.g.type !== "idle") return;
    this.copy();
    this.remove();
  }
  /** The selection as text for the system clipboard. */
  serialize(): string {
    const whole = this.wholeScenes(), shapes = this.clone(this.selected(), 0, 0), scenes = this.scenesFor(whole);
    return (this.copied = JSON.stringify({ canvas: 1, shapes, ...(Object.keys(scenes).length ? { scenes } : {}) }));
  }
  /** What this board last put on the clipboard: pasted back exactly, it is the person's own copy. */
  private copied = "";
  /** Paste from the system clipboard: our own shapes, or plain text as a line of text. */
  pasteText(text: string, at?: Pt) {
    if (this.g.type !== "idle") return;
    try {
      const data = JSON.parse(text) as { canvas?: number; shapes?: unknown; scenes?: unknown } | null;
      if (data && data.canvas === 1) {
        // the clipboard is outside the board: only well-formed shapes come in, and unless they are the person's own
        // copy, nothing in them runs, opens a local file or speaks for a thread by being put down
        const ours = text === this.copied;
        const raw = ours ? cleanShapes(data.shapes) : fromOutside(cleanShapes(data.shapes));
        if (!raw.length) return;
        // (cleaned together, as a board is opened: a moment's wire may be joined to a shape that comes with it, and a
        // conversation, terminal or page copied inside a drawing that plays (as before) comes out of it, on show)
        const together = cleanDoc({ shapes: Object.fromEntries(raw.map((x) => [x.id, x])), order: raw.map((x) => x.id), scenes: data.scenes });
        const shapes = together.order.map((id) => together.shapes[id]!), scenes = together.scenes ?? {};
        this.clip = shapes;
        this.clipScenes = ours ? scenes : scenesFromOutside(scenes);
        return this.paste(at);
      }
    } catch {
      /* not ours: fall through to plain text */
    }
    const clean = text.replace(/\r/g, "").trim();
    if (!clean) return;
    const s = this.store, p = at ?? this.world(this.last);
    const t0: Text = { id: newId(), kind: "text", x: 0, y: 0, w: 1, h: 1, text: clean, size: 18, tone: this.style.tone }, l = textLayout(t0);
    const t: Text = { ...t0, x: p.x - l.w / 2, y: p.y - l.h / 2, w: l.w, h: l.h };
    s.run(() => {
      s.put(t);
      s.select([t.id]);
    });
    this.invalidate();
  }
  get canPaste() {
    return this.clip.length > 0;
  }
  paste(at?: Pt) {
    if (this.g.type !== "idle" || !this.clip.length) return;
    this.place(this.clip, at ?? this.world(this.last));
  }
  /** Put fresh copies of `shapes` on the board, centred as they look on `target`, and select them. */
  private place(shapes: Shape[], target: Pt) {
    const s = this.store;
    s.run(() => {
      const temp = { shapes: Object.fromEntries(shapes.map((sh) => [sh.id, sh])), order: shapes.map((sh) => sh.id) };
      const cb = boundsOf(temp, temp.order) ?? { x: 0, y: 0, w: 0, h: 0 };
      const dx = target.x - (cb.x + cb.w / 2), dy = target.y - (cb.y + cb.h / 2);
      const copies = this.clone(shapes, 0, 0).map((sh) => {
        if (!isArrow(sh)) return { ...sh, x: sh.x + dx, y: sh.y + dy };
        const mv = (e: End): End => ({ ...e, x: e.x + dx, y: e.y + dy });
        return { ...sh, a: mv(sh.a), b: mv(sh.b), ...carried(sh, dx, dy) };
      });
      // arrows keep joins only among what came with them
      const ids = new Set(copies.map((c) => c.id));
      const fixed = copies.map((sh) => {
        if (!isArrow(sh)) return sh;
        const fx = (e: End): End => (e.bind && !ids.has(e.bind.id) ? { x: e.x, y: e.y } : e);
        return { ...sh, a: fx(sh.a), b: fx(sh.b) };
      });
      s.put(...fixed);
      if (shapes === this.clip) this.addScenes(this.scenesFor(this.clipScenes, dx, dy));
      s.select(fixed.map((c) => c.id));
    });
    this.invalidate();
  }
  /** The pattern the next click will put down. */
  pattern: string | null = null;
  private patternDef: StampDef | null = null;
  armPattern(slug: string | StampDef) {
    // (a stamp handed over whole is put down without being added to the library: the server places agents' diagrams so)
    const def = typeof slug === "string" ? findStamp(slug) : slug;
    if (!def) return;
    this.setTool("stamp");
    this.pattern = def.slug;
    this.patternDef = typeof slug === "string" ? null : def;
    // built once: what is shown in hand is exactly what goes down
    const shapes = def.build();
    const doc = { shapes: Object.fromEntries(shapes.map((sh) => [sh.id, sh])), order: shapes.map((sh) => sh.id) };
    const b = boundsOf(doc, doc.order) ?? { x: 0, y: 0, w: 0, h: 0 };
    this.overlay.ghost = { doc, c: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, at: null };
    this.store.emit();
  }
  private disarm() {
    this.pattern = null;
    this.patternDef = null;
    this.overlay.ghost = null;
  }
  /** Put a whole pattern down as one group: move it as one, double-click into it, or ungroup it. */
  private stamp(p: Pt) {
    const g = this.overlay.ghost;
    if (!g) return false;
    const group = newId(), def = this.patternDef ?? (this.pattern ? findStamp(this.pattern) : undefined), scene = def?.moments?.();
    if (!scene?.moments.length) {
      this.place(g.doc.order.map((id) => ({ ...g.doc.shapes[id]!, group })), p);
      return true;
    }
    // a stamp that moves: every moment goes down under the same fresh names, the one shown in hand on the board
    const { moments } = laidMoments(scene.moments, group, p.x - g.c.x, p.y - g.c.y);
    // a diagram that moves is put down at its beginning
    const at = 0, s = this.store;
    s.run(() => {
      s.put(...moments[at]!.shapes);
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [group]: { moments, at } } });
      s.select(moments[at]!.shapes.map((sh) => sh.id));
    });
    // (one put down by hand is there to be seen moving: its moments show, with Play)
    // (put down by hand is being animated: its moments show)
    if (!this.motion) this.setMotion(true);
    this.invalidate();
    return true;
  }
  // ── animation: a group with moments ─────────────────────────────
  /** The animated group the selection belongs to (all of it in one group), if it is one. */
  get sceneGroup(): Id | null {
    const scenes = this.store.doc.scenes;
    if (!scenes) return null;
    // (a conversation, terminal or page picked with it is never part of a drawing: it doesn't count either way)
    const groups = new Set(this.selected().filter((sh) => !isLive(sh)).map((sh) => sh.group ?? ""));
    // (shapes picked with it that belong to nothing are its company, not another group: its moments still show)
    const moving = [...groups].filter((x) => x && scenes[x]), others = [...groups].filter((x) => x && !scenes[x]);
    const g = groups.size === 1 ? [...groups][0]! : moving.length === 1 && !others.length ? moving[0]! : "";
    // …or the one stepped into, with nothing in it picked yet
    return g && scenes[g] ? g : !this.store.sel.size && this.scope && scenes[this.scope] ? this.scope : null;
  }
  /** Shapes picked along with a moving group that belong to nothing join it, alike in every moment (part of one change). */
  private join(g: Id) {
    // (a conversation, terminal or page picked along with it stays out: it is never a part of a drawing that plays)
    const s = this.store, sc = s.doc.scenes?.[g], loose = this.selected().filter((sh) => !sh.group && !isLive(sh));
    if (!sc || !loose.length) return;
    const joined = loose.map((sh) => ({ ...sh, group: g }));
    s.put(...joined);
    // (each moment keeps the board's stacking: a face drawn first stays under the mouth drawn on it)
    const rank = new Map(s.doc.order.map((id, i) => [id, i]));
    const stack = (shapes: Shape[]) => [...shapes].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { ...sc, moments: sc.moments.map((m) => ({ ...m, shapes: stack([...m.shapes, ...joined]) })) } } });
  }
  scene(g: Id | null): Scene | null {
    return (g && this.store.doc.scenes?.[g]) || null;
  }
  private members(doc: Doc, g: Id): Shape[] {
    // (indexed once per board state: a board of hundreds of groups asks this for each of them on every pointer move)
    let by = byGroup.get(doc);
    if (!by) {
      by = new Map();
      for (const id of doc.order) { const sh = doc.shapes[id]; if (sh?.group) { const l = by.get(sh.group); if (l) l.push(sh); else by.set(sh.group, [sh]); } }
      byGroup.set(doc, by);
    }
    return by.get(g) ?? [];
  }
  /** The scene with the moment on show brought up to date with the board. */
  private synced(doc: Doc, g: Id): Scene {
    const sc = doc.scenes![g]!, live = this.members(doc, g);
    // a shape no moment has seen before was made in this one: it is there from here on
    const known = new Set(sc.moments.flatMap((m) => m.shapes.map((sh) => sh.id))), made = live.filter((sh) => !known.has(sh.id));
    return { ...sc, moments: sc.moments.map((m, i) => (i === sc.at ? { ...m, shapes: live } : i > sc.at && made.length ? { ...m, shapes: [...m.shapes, ...made] } : made.length ? { ...m, shapes: [...m.shapes, ...made.map((sh) => ({ ...sh, away: true as const }))] } : m)) };
  }
  /** The moments as they stand, the one on show included (for thumbnails and playing). */
  moments(g: Id): Moment[] {
    return this.store.doc.scenes?.[g] ? this.synced(this.store.doc, g).moments : [];
  }
  /** Whether what is selected can be made to move (a conversation, terminal or page can't). */
  get canAnimate() {
    return this.selected().some((sh) => !isLive(sh));
  }
  /** Make what is selected move: it becomes one group, and gains a second moment to change. */
  animate() {
    // (a conversation, terminal or page picked along with it isn't made to move: it stays as it is)
    const parts = this.selected().filter((sh) => !isLive(sh));
    if (this.g.type !== "idle" || !this.canAnimate) return;
    const s = this.store;
    this.stop();
    s.run(() => {
      const groups = new Set(parts.map((sh) => sh.group ?? ""));
      let g = groups.size === 1 ? [...groups][0]! : "";
      if (!g) {
        g = newId();
        s.put(...parts.map((sh) => ({ ...sh, group: g })));
      }
      // (a conversation, terminal or page picked along leaves whatever group it was in, as itself)
      const stray = this.selected().filter((sh) => isLive(sh) && sh.group && sh.group !== g);
      if (stray.length) s.put(...stray.map((sh) => { const o = { ...sh }; delete o.group; return o; }));
      if (s.doc.scenes?.[g]) return;
      // (a group that begins to move lets go of a conversation, terminal or page in it: they stay as they are)
      const held = this.members(s.doc, g).filter((sh) => isLive(sh));
      if (held.length) s.put(...held.map((sh) => { const o = { ...sh }; delete o.group; return o; }));
      const shapes = this.members(s.doc, g);
      // two moments to begin with, alike, the second on show and stepped into: whatever part is changed now is what will move
      s.select([]);
      this.enter(g);
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { moments: [{ id: newId(), shapes, over: OVER, hold: HOLD }, { id: newId(), shapes, over: OVER, hold: HOLD }], at: 1 } } });
    });
    this.invalidate();
  }
  /** Show another moment of a group: the board's shapes become that moment's. */
  showMoment(g: Id, i: number) {
    const s = this.store, sc0 = s.doc.scenes?.[g];
    if (!sc0 || i === sc0.at || i < 0 || i >= sc0.moments.length || this.g.type !== "idle") return;
    this.stop();
    if (s.editing) return;
    s.run(() => {
      this.join(g);
      s.setDoc(this.shown(s.doc, g, i));
    });
    // a moment picked is a moment to change: its parts are picked one at a time
    const ids = new Set(this.members(s.doc, g).map((sh) => sh.id)), keep = [...s.sel].filter((id) => ids.has(id));
    const whole = keep.length === ids.size && ids.size > 1;
    if (!whole) this.enter(g);
    s.select(keep);
    this.overlay.stubsFor = null;
    s.emit();
    this.invalidate();
  }
  private shown(doc0: Doc, g: Id, i: number): Doc {
    const sc = this.synced(doc0, g), target = sc.moments[i]!;
    const mine = new Set(this.members(doc0, g).map((sh) => sh.id));
    const shapes = Object.fromEntries(Object.entries(doc0.shapes).filter(([id]) => !mine.has(id)));
    for (const sh of target.shapes) shapes[sh.id] = sh;
    // the group keeps its place in the stack
    const first = doc0.order.findIndex((id) => mine.has(id)), rest = doc0.order.filter((id) => !mine.has(id));
    const before = first < 0 ? rest.length : doc0.order.slice(0, first).filter((id) => !mine.has(id)).length;
    const order = [...rest.slice(0, before), ...target.shapes.map((sh) => sh.id), ...rest.slice(before)];
    return { shapes, order, scenes: { ...doc0.scenes, [g]: { ...sc, at: i } } };
  }
  /** A new moment after the one on show, alike to begin with, and shown. */
  addMoment(g: Id) {
    const s = this.store;
    if (!s.doc.scenes?.[g] || this.g.type !== "idle" || s.doc.scenes[g]!.moments.length >= 32) return;
    this.stop();
    s.run(() => {
      this.join(g);
      const sc = this.synced(s.doc, g), cur = sc.moments[sc.at]!;
      const moments = [...sc.moments.slice(0, sc.at + 1), { id: newId(), shapes: cur.shapes, over: OVER, hold: HOLD }, ...sc.moments.slice(sc.at + 1)];
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { moments, at: sc.at + 1 } } });
    });
    const ids = new Set(this.members(s.doc, g).map((sh) => sh.id));
    if ([...this.store.sel].filter((id) => ids.has(id)).length !== ids.size) this.enter(g);
    this.invalidate();
  }
  removeMoment(g: Id, i: number) {
    const s = this.store, sc0 = s.doc.scenes?.[g];
    if (!sc0 || this.g.type !== "idle") return;
    this.stop();
    s.run(() => {
      if (sc0.moments.length <= 2) {
        // with one moment left there is nothing to move between: the group is still again, as it is shown
        const keep = i === sc0.at ? this.shown(s.doc, g, i === 0 ? 1 : 0) : s.doc;
        const { [g]: _gone, ...others } = keep.scenes ?? {};
        s.setDoc({ shapes: keep.shapes, order: keep.order, ...(Object.keys(others).length ? { scenes: others } : {}) });
        return;
      }
      const doc = i === sc0.at ? this.shown(s.doc, g, i === 0 ? 1 : i - 1) : { ...s.doc, scenes: { ...s.doc.scenes, [g]: this.synced(s.doc, g) } };
      const sc = doc.scenes![g]!, moments = sc.moments.filter((_, k) => k !== i);
      s.setDoc({ ...doc, scenes: { ...doc.scenes, [g]: { moments, at: sc.at > i ? sc.at - 1 : sc.at } } });
    });
    const ids = this.members(s.doc, g).map((sh) => sh.id);
    s.select(ids);
    s.emit();
    this.invalidate();
  }
  /** Put a moment somewhere else in the order (the one on show stays on show). */
  moveMoment(g: Id, from: number, to: number) {
    const s = this.store, sc0 = s.doc.scenes?.[g];
    if (!sc0 || from === to || from < 0 || to < 0 || from >= sc0.moments.length || to >= sc0.moments.length || this.g.type !== "idle") return;
    this.stop();
    s.run(() => {
      const sc = this.synced(s.doc, g), shown = sc.moments[sc.at]!, moments = [...sc.moments], [m] = moments.splice(from, 1);
      moments.splice(to, 0, m!);
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { moments, at: moments.indexOf(shown) } } });
    });
    this.invalidate();
  }
  /** How long playing takes to arrive at a moment, and how long it rests there. */
  timeMoment(g: Id, i: number, change: { over?: number; hold?: number; ease?: "smooth" | "spring" | "even" }) {
    const s = this.store, sc = s.doc.scenes?.[g];
    if (!sc?.moments[i]) return;
    const clampMs = (v: number) => Math.min(20000, Math.max(0, Math.round(v / 100) * 100));
    s.run(() => s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { ...sc, moments: sc.moments.map((m, k) => (k === i ? { ...m, ...(change.over !== undefined ? { over: clampMs(change.over) } : {}), ...(change.hold !== undefined ? { hold: clampMs(change.hold) } : {}) } : m)).map((m, k) => { if (k !== i || change.ease === undefined) return m; const { ease: _e, ...rest } = m; return change.ease === "smooth" ? rest : { ...rest, ease: change.ease }; }) } } }));
    if (i === sc.at && (change.over !== undefined || change.ease !== undefined)) this.preview(g);
    this.invalidate();
  }
  /** Put the selection, as it is now, into every moment of its group. */
  spread() {
    const s = this.store, g = this.sceneGroup;
    if (!g || this.g.type !== "idle") return;
    const now = new Map(this.selected().map((sh) => [sh.id, sh]));
    s.run(() => {
      const sc = this.synced(s.doc, g);
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { ...sc, moments: sc.moments.map((m) => ({ ...m, shapes: [...m.shapes.map((sh) => now.get(sh.id) ?? sh), ...[...now.values()].filter((sh) => !m.shapes.some((o) => o.id === sh.id))] })) } } });
    });
    this.invalidate();
  }
  /** A travelling mark on the selected wires, or none. */
  /** Take what is selected out of the moment on show, or bring it back: it stays in the others. */
  hide(on: boolean) {
    const s = this.store, g = this.sceneGroup;
    // what sits inside a panel is hidden and shown with it (a conversation, terminal or page picked along, which is no
    // part of the drawing, is never hidden in its moments, nor are the wires to it on that account)
    const set = this.withinside(new Set([...s.sel].filter((id) => !isLive(s.doc.shapes[id]) || (!!g && s.doc.shapes[id]?.group === g))));
    // a wire joined to a thing goes when the thing goes (it would end in thin air), and comes back with it
    // once whatever is at its other end is there too
    for (const id of s.doc.order) {
      const w = s.doc.shapes[id]!;
      if (!isArrow(w) || set.has(id) || w.locked) continue;
      const ends = [w.a, w.b].map((e) => (e.bind ? s.doc.shapes[e.bind.id] : undefined));
      if (!ends.some((b) => b && set.has(b.id))) continue;
      if (on ? !w.away : !!w.away && ends.every((b) => !b || set.has(b.id) || !b.away)) set.add(id);
    }
    const all = [...set].map((id) => s.doc.shapes[id]!).filter(Boolean);
    s.run(() => s.put(...all.map((sh) => { const { away: _a, ...rest } = sh; return (on ? { ...rest, away: true as const } : rest) as Shape; })));
    this.preview(g);
    this.invalidate();
  }
  pulse(on: boolean) {
    this.along(on ? "mark" : null);
  }
  /** What travels the selected wires in the moment on show: one thing at a time, or nothing. It is shown at once, by playing into this moment. */
  along(what: "mark" | "pour" | "back" | "fizzle" | "squash" | null) {
    const s = this.store, g = this.sceneGroup;
    s.run(() => s.put(...this.selected().filter(isArrow).map((a) => { const { pulse: _p, run: _r, ...rest } = a; return (what === "mark" ? { ...rest, pulse: { dur: 900, every: 1500 } } : what ? { ...rest, run: what } : rest) as Arrow; })));
    if (what) this.preview(g, 1600);
    this.invalidate();
  }
  /** In the moment on show: how long the selected parts wait before their own change, and how they come and go. */
  part(change: { wait?: number }) {
    const s = this.store, g = this.sceneGroup;
    s.run(() => s.put(...this.selected().map((sh) => {
      const { wait: w0, ...rest } = sh;
      const wait = change.wait !== undefined ? Math.min(5000, Math.max(0, Math.round(change.wait / 100) * 100)) : (w0 ?? 0);
      return { ...rest, ...(wait > 0 ? { wait } : {}) } as Shape;
    })));
    this.preview(g);
    this.invalidate();
  }
  /** Whether a group plays once and rests, or goes round. */
  once(g: Id, on: boolean) {
    const s = this.store, sc = s.doc.scenes?.[g];
    if (!sc) return;
    this.stop();
    const { once: _o, ...rest } = this.synced(s.doc, g);
    s.run(() => s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: on ? { ...rest, once: true as const } : rest } }));
    this.invalidate();
  }
  /** Pick one part of a group that moves, stepping into it. */
  pickPart(g: Id, id: Id) {
    if (this.g.type !== "idle" || !this.store.doc.shapes[id]) return;
    this.stop();
    this.enter(g);
    this.store.select([id]);
    this.store.emit();
    this.invalidate();
  }
  /** A compute mark at work, or not, in the moment on show. */
  busy(on: boolean) {
    const s = this.store, g = this.sceneGroup;
    s.run(() => s.put(...this.selected().filter((sh): sh is Box => isBox(sh) && sh.kind === "glyph").map((b) => { const { busy: _b, ...rest } = b; return (on ? { ...rest, busy: true as const } : rest) as Box; })));
    if (on) this.preview(g, 1500);
    this.invalidate();
  }
  // playing
  playing: { g: Id; t0: number; moments: Moment[]; doc: Doc; once?: true; held?: number; until?: number; open?: [number, number] } | null = null;
  /** Show a change just made: play into the moment on show once, then hand the board back. */
  /** Whether the controls for movement are on show: a way of looking at the board, not part of the drawing. */
  motion = false;
  /** Whether the movement switch has been turned by hand (until then a board with moments shows them). */
  motionChosen = false;
  /** Whether c, s and b put down a thread, a terminal and a browser (only where the board has live things). */
  liveKeys = true;
  setMotion(on: boolean) {
    this.motion = on;
    this.motionChosen = true;
    if (!on) this.stop();
    this.store.emit();
    this.invalidate();
  }
  preview(g: Id | null, extra = 0) {
    const sc = this.scene(g);
    if (!g || !sc || this.g.type !== "idle" || this.store.editing) return;
    this.play(g, true);
    const m = this.playing?.moments[sc.at];
    if (!this.playing || !m) return;
    // it rests a beat on the moment before, so the eye has somewhere to start from, and a beat on arrival
    this.playing.t0 += 350;
    this.playing.until = performance.now() - this.playing.t0 + m.over + 600 + extra;
  }
  /** Hold the playing at one instant (ms from the first moment), to look at it. */
  scrub(g: Id, ms: number) {
    const sc = this.scene(g);
    if (!sc || this.g.type !== "idle" || this.store.editing) return;
    this.playing = { g, t0: 0, moments: this.moments(g), doc: this.store.doc, held: Math.max(0, ms) };
    this.store.emit();
    this.invalidate();
  }
  /** How far playing has got, in ms from the first moment (the loop's own time). */
  get playedMs(): number {
    const p = this.playing;
    if (!p) return 0;
    const total = p.moments.reduce((n, m) => n + m.over + m.hold, 0) || 1, ms = p.held ?? performance.now() - p.t0;
    return p.once ? Math.min(ms, total) : ((ms % total) + total) % total;
  }
  /** Take a part out of one moment, or put it back, whichever moment is on show. */
  awayIn(g: Id, i: number, id: Id, on: boolean) {
    this.changeIn(g, i, id, (sh) => { const { away: _a, ...rest } = sh; return (on ? { ...rest, away: true as const } : rest) as Shape; });
  }
  /** How long a part waits before its own change, in any one moment. */
  waitIn(g: Id, i: number, id: Id, ms: number) {
    const wait = Math.min(5000, Math.max(0, Math.round(ms / 100) * 100));
    this.changeIn(g, i, id, (sh) => { const { wait: _w, ...rest } = sh; return (wait > 0 ? { ...rest, wait } : rest) as Shape; });
  }
  private changeIn(g: Id, i: number, id: Id, set: (sh: Shape) => Shape) {
    const s = this.store, sc0 = s.doc.scenes?.[g];
    if (!sc0 || this.g.type !== "idle") return;
    this.stop();
    s.run(() => {
      if (i === sc0.at) { const sh = s.doc.shapes[id]; if (sh) s.put(set(sh)); return; }
      const sc = this.synced(s.doc, g);
      s.setDoc({ ...s.doc, scenes: { ...s.doc.scenes, [g]: { ...sc, moments: sc.moments.map((m, k) => (k === i ? { ...m, shapes: m.shapes.map((sh) => (sh.id === id ? set(sh) : sh)) } : m)) } } });
    });
    if (i === sc0.at) this.preview(g);
    this.invalidate();
  }
  play(g: Id, arriving = false) {
    const sc = this.scene(g);
    if (!sc || this.g.type !== "idle") return;
    if (this.store.editing) return;
    const moments = this.moments(g);
    // it starts from the moment on show
    let lead = 0;
    for (let i = 0; i < sc.at; i++) lead += moments[i]!.hold + moments[i + 1]!.over;
    // …or from just before it, to see it arrive
    if (arriving) lead -= moments[sc.at]!.over;
    // …or from the moment on show standing still for a beat, so the opening picture is taken in; then the moment plays as if just arrived
    // (what runs its wires travels, and it gets its full rest) before moving on
    const OPEN = 700, open: [number, number] | undefined = arriving ? undefined : [lead, lead + (moments[sc.at]?.hold ?? 0)];
    this.playing = { g, t0: performance.now() - lead + (open ? OPEN : 0), moments, doc: this.store.doc, ...(sc.once ? { once: true as const } : {}), ...(open ? { open } : {}) };
    this.store.emit();
    this.invalidate();
  }
  /** Hold the playing where it has got to, or let it run on from there. */
  pause() {
    const p = this.playing;
    if (!p || p.held !== undefined) return;
    this.playing = { ...p, held: performance.now() - p.t0 };
    this.store.emit();
    this.invalidate();
  }
  resume() {
    const p = this.playing;
    if (!p || p.held === undefined) return;
    const { held, ...rest } = p;
    this.playing = { ...rest, t0: performance.now() - held };
    this.store.emit();
    this.invalidate();
  }
  stop() {
    if (!this.playing) return false;
    this.playing = null;
    clock.t = null;
    clock.since = null;
    this.store.emit();
    this.invalidate();
    return true;
  }
  /** What to draw right now: the board itself, or, while a group plays, the board with that group part-way between two of its moments. */
  viewDoc(th: Theme): Doc {
    const doc = this.store.doc;
    // whatever changes the board (an edit, another tab's save) ends the playing: it was showing what is no longer there
    if (this.playing && this.playing.doc !== doc) { this.playing = null; clock.t = null; clock.since = null; queueMicrotask(() => this.store.emit()); }
    const p = this.playing;
    // hidden parts and traces are for working inside a group: merely selected, it looks as it will play
    stage.g = p || !this.motion ? null : this.scope && doc.scenes?.[this.scope] ? this.scope : null;
    if (!p) { stage.live = null; this.mute(doc); return this.trailed(doc); }
    const ms = p.held ?? performance.now() - p.t0;
    // a preview has shown what it had to show
    if (p.until !== undefined && ms >= p.until) { this.playing = null; clock.t = null; clock.since = null; queueMicrotask(() => { this.store.emit(); this.invalidate(); }); return this.trailed(doc); }
    const o = p.open, pos = position({ moments: p.moments, at: 0, ...(p.once ? { once: true as const } : {}) }, o ? Math.max(ms, o[0]) : ms);
    clock.t = ms;
    // (the opening: still before its wires play, then timed from when they set off, not from an arrival it never made)
    clock.since = o && ms < o[0] ? null : o && ms < o[1] ? ms - o[0] : pos.since;
    // what runs a wire belongs to the moment arriving, from the start of its arrival
    const to = new Map(p.moments[pos.b]!.shapes.map((sh) => [sh.id, sh]));
    const wraps = pos.b === 0 && pos.a === p.moments.length - 1 && pos.a > 0;
    const shapes = (wraps ? restart(p.moments[pos.a]!, p.moments[0]!, pos.t) : frame(th, p.moments[pos.a]!, p.moments[pos.b]!, pos.t)).map((sh) => { const b = to.get(sh.id); if (!isArrow(sh) || !b || !isArrow(b) || (sh.run === b.run && sh.heads === b.heads)) return sh; const { run: _r, ...rest } = sh; return (b.run ? { ...rest, heads: b.heads, run: b.run } : { ...rest, heads: b.heads }) as Shape; });
    // (heads belong to the moment arriving too: a wire that has stopped playing loses its head with its run, not a beat later)
    const mine = new Set(this.members(doc, p.g).map((sh) => sh.id));
    // only the group played moves: the rest of the board stays as it stands
    stage.live = mine;
    const all = Object.fromEntries(Object.entries(doc.shapes).filter(([id]) => !mine.has(id)));
    for (const sh of shapes) all[sh.id] = sh;
    const first = doc.order.findIndex((id) => mine.has(id)), rest = doc.order.filter((id) => !mine.has(id));
    const before = first < 0 ? rest.length : doc.order.slice(0, first).filter((id) => !mine.has(id)).length;
    return { shapes: all, order: [...rest.slice(0, before), ...shapes.map((sh) => sh.id), ...rest.slice(before)] };
  }
  private muteMemo: { doc: Doc; g: Id | null; set: Set<Id> } | null = null;
  /** Work out which hidden parts stay undrawn: those that would lie across something visible (or all, when they are listed by name instead). */
  private mute(doc: Doc) {
    stage.mute = stage.g ? this.offBoard(doc, stage.g) : NOTHING;
  }
  /** The parts of a group, hidden in the moment on show, that are kept off the board. */
  offBoard(doc: Doc, g: Id): Set<Id> {
    if (this.muteMemo && this.muteMemo.doc === doc && this.muteMemo.g === g) return this.muteMemo.set;
    const set = new Set(this.members(doc, g).filter((sh) => sh.away).map((sh) => sh.id));
    this.muteMemo = { doc, g, set };
    return set;
  }
  private trailMemo: { doc: Doc; g: Id | null; out: Doc } | null = null;
  /** The board with, for the group being worked on, a faint trace of each part where it was in the moment before: what has moved is there to see. */
  private trailed(doc: Doc): Doc {
    // a trace says where a part came from: one that would lie mostly under the part itself (it only grew, or barely moved) says nothing and muddles its words
    const apart = (a: Rect, b: Rect) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w <= 0 || h <= 0 || w * h < b.w * b.h * 0.4; };
    const g = stage.g, sc = g ? doc.scenes?.[g] : undefined;
    // the first moment is where it starts: there is no "before" to show a trace of
    if (!g || !sc || sc.at === 0 || this.g.type !== "idle") return doc;
    if (this.trailMemo && this.trailMemo.doc === doc && this.trailMemo.g === g) return this.trailMemo.out;
    const prev = sc.moments[(sc.at - 1 + sc.moments.length) % sc.moments.length]!;
    const ghosts = prev.shapes.filter((p): p is Exclude<Shape, Arrow> => { const now = doc.shapes[p.id]; return !isArrow(p) && !p.away && !!now && !isArrow(now) && !now.away && (now.x !== p.x || now.y !== p.y) && apart(now, p); }).map((p) => ({ ...p, id: p.id + "~was", away: true as const }));
    let out = doc;
    if (ghosts.length) {
      const first = doc.order.findIndex((id) => doc.shapes[id]?.group === g);
      out = { ...doc, shapes: { ...doc.shapes, ...Object.fromEntries(ghosts.map((s) => [s.id, s])) }, order: [...doc.order.slice(0, Math.max(0, first)), ...ghosts.map((s) => s.id), ...doc.order.slice(Math.max(0, first))] };
    }
    this.trailMemo = { doc, g, out };
    return out;
  }
  /** Which moment playing is on, or heading to. */
  get playingAt(): number {
    const p = this.playing;
    return p ? position({ moments: p.moments, at: 0 }, p.held ?? performance.now() - p.t0).b : -1;
  }

  order(where: "front" | "back") {
    const s = this.store;
    if (!s.sel.size) return;
    s.run(() => s.reorder(s.sel, where));
    this.invalidate();
  }
  private nudging = false;
  /** Close a run of arrow-key nudges into its one undo step. */
  /** While typing on a phone the keyboard covers the lower part of the
   *  screen: bring what is being typed up into the part still showing. */
  keepTypingVisible(visibleHeight: number) {
    const s = this.store, sh = s.editing ? s.doc.shapes[s.editing] : undefined;
    if (!sh) return;
    const r = bounds(s.doc, sh), bottom = (r.y + r.h - s.cam.y) * s.cam.z, top = (r.y - s.cam.y) * s.cam.z;
    const room = visibleHeight - 24;
    if (bottom <= room && top >= 72) return;
    const dy = bottom > room ? bottom - room : top - 72;
    s.setCamera({ x: s.cam.x, y: s.cam.y + dy / s.cam.z, z: s.cam.z });
    this.invalidate();
  }
  /** Finish anything half-open that needs no pointer, before the page goes away. */
  rest() {
    this.flushText();
    this.settle();
  }
  private settle() {
    if (!this.nudging) return;
    this.nudging = false;
    this.store.commit();
  }
  nudge(dx: number, dy: number) {
    const s = this.store;
    if (!s.sel.size) return;
    if (!this.nudging) {
      s.mark();
      this.nudging = true;
    }
    const orig = this.snapshot(this.movingSet());
    const next: Shape[] = [];
    for (const sh of orig.values()) {
      if (isArrow(sh)) {
        const mv = (e: End): End => (e.bind && !orig.has(e.bind.id) ? e : { ...e, x: e.x + dx, y: e.y + dy });
        next.push({ ...sh, a: mv(sh.a), b: mv(sh.b), ...rerouted(sh, (e) => !(e.bind && !orig.has(e.bind.id)), dx, dy) });
      } else next.push({ ...sh, x: sh.x + dx, y: sh.y + dy });
    }
    s.put(...next);
    this.carryMoments(orig);
    s.emit();
    this.invalidate();
  }
  /** Once the real font is known, make sure every saved box still holds
   *  its label. Not a step: nothing the user did. */
  refit() {
    const s = this.store;
    // only before anything has been done: history then starts from the fitted board
    if (s.editing || this.g.type !== "idle" || s.canUndo || s.canRedo) return;
    const next: Shape[] = [];
    for (const id of s.doc.order) {
      const sh = s.doc.shapes[id];
      if (!isBox(sh) || !sh.text) continue;
      const f = this.fitted(sh);
      if (f.h !== sh.h || f.w !== sh.w || f.y !== sh.y) next.push(f);
    }
    if (next.length) {
      s.put(...next);
      s.emit();
    }
  }
  // ── locking ─────────────────────────────────────────────────────
  /** Hold the selection in place. Locked shapes are let go of at once: they can no longer be selected. */
  lock() {
    if (this.g.type !== "idle" || !this.store.sel.size) return;
    const s = this.store;
    s.run(() => {
      s.put(...this.selected().map((sh) => ({ ...sh, locked: true as const })));
      s.select([]);
    });
    this.overlay.stubsFor = null;
    this.invalidate();
  }
  /** The locked shape under `p`, if any: the only thing to do with it is unlock it. */
  lockedAt(p: Pt): Shape | undefined {
    return hitTest(this.store.doc, p, 4 / this.store.cam.z, (sh) => !sh.locked);
  }
  unlock(id: Id) {
    const s = this.store, doc = s.doc;
    const ids = this.family(id).filter((o) => doc.shapes[o]?.locked);
    if (this.g.type !== "idle" || !ids.length) return;
    s.run(() => {
      s.put(...ids.map((o) => {
        const sh = { ...doc.shapes[o]! };
        delete sh.locked;
        return sh;
      }));
      s.select(ids);
    });
    this.invalidate();
  }

  // ── groups ──────────────────────────────────────────────────────
  /** Everything that moves with `id`: itself, or its whole group. */
  family(id: Id): Id[] {
    const doc = this.store.doc, g = doc.shapes[id]?.group;
    return g && g !== this.scope ? doc.order.filter((o) => doc.shapes[o]?.group === g) : [id];
  }
  /** The group that has been stepped into: its parts are picked one at a time until you step out. */
  scope: Id | null = null;
  private reached = 0;
  private leave(select = false) {
    const g = this.scope;
    if (!g) return false;
    this.scope = null;
    this.overlay.scope = null;
    const doc = this.store.doc;
    if (select) this.store.select(doc.order.filter((o) => doc.shapes[o]?.group === g));
    return true;
  }
  private enter(g: Id) {
    this.scope = g;
    this.overlay.scope = g;
  }
  private grown(ids: Iterable<Id>): Set<Id> {
    const doc = this.store.doc, out = new Set(ids), groups = new Set<Id>();
    for (const id of out) {
      const g = doc.shapes[id]?.group;
      if (g && g !== this.scope) groups.add(g);
    }
    if (groups.size) for (const id of doc.order) if (groups.has(doc.shapes[id]?.group ?? "")) out.add(id);
    return out;
  }
  get canGroup() {
    if (!(this.store.sel.size > 1 && new Set(this.selected().map((sh) => sh.group ?? sh.id)).size > 1)) return false;
    // an animated group can take more shapes in, whole; it cannot be split or merged with another that moves
    const scenes = this.store.doc.scenes ?? {}, touched = [...new Set(this.selected().map((sh) => sh.group).filter((g): g is Id => !!g && !!scenes[g]))];
    if (touched.length === 0) return true;
    // (and only with something it can take: a conversation, terminal or page stays out of one)
    return touched.length === 1 && this.members(this.store.doc, touched[0]!).every((m) => this.store.sel.has(m.id)) && this.selected().some((sh) => sh.group !== touched[0] && !isLive(sh));
  }
  get canUngroup() {
    return this.selected().some((sh) => !!sh.group);
  }
  group() {
    if (this.g.type !== "idle" || !this.canGroup) return;
    const s = this.store, scenes = s.doc.scenes ?? {};
    // shapes grouped with a group that moves join it (and are there from this moment on)
    const gid = this.selected().map((sh) => sh.group).find((g) => !!g && !!scenes[g]) ?? newId();
    const moving = !!scenes[gid];
    s.run(() => {
      // (a conversation, terminal or page doesn't join a group that moves: it leaves whatever group it was in, as itself,
      // and what stays picked is the drawing that moves, its moments still to hand)
      s.put(...this.selected().map((sh) => {
        if (!moving || !isLive(sh)) return { ...sh, group: gid };
        const o = { ...sh };
        delete o.group;
        return o;
      }));
      this.tidyScenes();
      if (moving) s.select(this.members(s.doc, gid).map((sh) => sh.id));
    });
    this.invalidate();
  }
  ungroup() {
    if (this.g.type !== "idle" || !this.canUngroup) return;
    const s = this.store;
    s.run(() =>
      {
        const gone = new Set(this.selected().map((sh) => sh.group).filter(Boolean));
        // a group that moves stops moving: its parts stay where the moment on show has them, every one of them there
        // (a part not in this moment comes back rather than being lost), and its moments go with the group
        const all = s.doc.order.map((id) => s.doc.shapes[id]!).filter((sh) => gone.has(sh.group));
        const shapes = { ...s.doc.shapes };
        for (const sh of all) { const o = { ...sh }; delete o.group; delete o.away; shapes[o.id] = o; }
        const scenes = Object.fromEntries(Object.entries(s.doc.scenes ?? {}).filter(([g]) => !gone.has(g)));
        s.setDoc({ shapes, order: s.doc.order, ...(Object.keys(scenes).length ? { scenes } : {}) });
        if (this.scope && gone.has(this.scope)) this.leave();
        this.tidyScenes();
        s.select(all.map((sh) => sh.id));
      },
    );
    this.invalidate();
  }

  // ── lining up ───────────────────────────────────────────────────
  /** Where each selected shape would go if lined up `how`. */
  private aligned(how: Align): { sh: Box | Text; r: Rect; dx: number; dy: number }[] {
    const s = this.store, shapes = this.selected().filter((sh): sh is Box | Text => !isArrow(sh));
    const all = boundsOf(s.doc, shapes.map((sh) => sh.id));
    if (shapes.length < 2 || !all) return [];
    return shapes.map((sh) => {
      const r = aabb(sh);
      const dx = how === "left" ? all.x - r.x : how === "right" ? all.x + all.w - (r.x + r.w) : how === "centre" ? all.x + all.w / 2 - (r.x + r.w / 2) : 0;
      const dy = how === "top" ? all.y - r.y : how === "bottom" ? all.y + all.h - (r.y + r.h) : how === "middle" ? all.y + all.h / 2 - (r.y + r.h / 2) : 0;
      return { sh, r: { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, dx, dy };
    });
  }
  /** Lining up is only offered where it tidies: never where it would pile
   *  shapes on top of each other (a row lined up by its left edges). */
  canAlign(how: Align): boolean {
    const to = this.aligned(how);
    if (to.length < 2 || to.length > 300) return false;
    for (let i = 0; i < to.length; i++)
      for (let j = i + 1; j < to.length; j++) {
        const a = to[i]!.r, b = to[j]!.r;
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return false;
      }
    return true;
  }
  /** Line the selected shapes up by an edge or their middles. Arrows follow their boxes. */
  align(how: Align) {
    if (this.g.type !== "idle" || !this.canAlign(how)) return;
    const s = this.store;
    const next: Shape[] = this.aligned(how).filter((o) => o.dx || o.dy).map((o) => ({ ...o.sh, x: o.sh.x + o.dx, y: o.sh.y + o.dy }));
    if (next.length) s.run(() => s.put(...next));
    this.invalidate();
  }
  /** Even out the gaps between three or more shapes; the outer two stay where they are. */
  /** Spacing evenly makes sense along the direction the shapes are laid out in: each must be clear of the next. */
  /** Can the selection be wired one to many (or many to one)? Three or more things, none of them wires. */
  canFan(): boolean {
    const boxes = this.selected().filter(isBox);
    return boxes.length >= 3 && boxes.length === this.selected().length;
  }
  /** Wires the first thing selected to all the others through one junction (`out`), or all the others into the last (`in`):
   *  one trunk that branches, as a request fans out to many, or many arrive at one. */
  fan(dir: "out" | "in") {
    const s = this.store, sel = [...s.sel].map((id) => s.doc.shapes[id]).filter(isBox);
    if (sel.length < 3) return;
    const hub = dir === "out" ? sel[0]! : sel[sel.length - 1]!, rest = sel.filter((b) => b !== hub);
    const hc = { x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 };
    const others = rest.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    const ax = others.reduce((n, p) => n + p.x, 0) / others.length, ay = others.reduce((n, p) => n + p.y, 0) / others.length;
    // the others lie mostly beside the hub, or mostly above or below it: the trunk runs that way
    const across = Math.abs(ax - hc.x) >= Math.abs(ay - hc.y), J = 10;
    let jx = hc.x, jy = hc.y;
    if (across) {
      const right = ax > hc.x, edge = right ? hub.x + hub.w : hub.x, near = right ? Math.min(...rest.map((b) => b.x)) : Math.max(...rest.map((b) => b.x + b.w));
      jx = edge + (near - edge) * 0.4;
    } else {
      const down = ay > hc.y, edge = down ? hub.y + hub.h : hub.y, near = down ? Math.min(...rest.map((b) => b.y)) : Math.max(...rest.map((b) => b.y + b.h));
      jy = edge + (near - edge) * 0.4;
    }
    const j: Box = { id: newId(), kind: "junction", x: jx - J / 2, y: jy - J / 2, w: J, h: J, text: "", tone: "ink", fill: "none" };
    const wire = (from: string, to: string, heads: Arrow["heads"]): Arrow => ({ id: newId(), kind: "arrow", a: { x: 0, y: 0, bind: { id: from, ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: to, ax: 0.5, ay: 0.5 } }, text: "", route: "elbow", heads, tone: this.style.tone === "ink" ? "muted" : this.style.tone });
    const wires = dir === "out" ? [wire(hub.id, j.id, "none"), ...rest.map((b) => wire(j.id, b.id, "end"))] : [...rest.map((b) => wire(b.id, j.id, "none")), wire(j.id, hub.id, "end")];
    s.run(() => { s.put(j, ...wires); s.select(wires.map((w) => w.id)); });
    this.invalidate();
  }
  canDistribute(axis: "x" | "y"): boolean {
    const shapes = this.selected().filter((sh): sh is Box | Text => !isArrow(sh));
    if (shapes.length < 3) return false;
    const rs = shapes.map(aabb).sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    for (let i = 1; i < rs.length; i++) {
      const p = rs[i - 1]!, q = rs[i]!;
      if (axis === "x" ? q.x < p.x + p.w : q.y < p.y + p.h) return false;
    }
    return true;
  }
  distribute(axis: "x" | "y") {
    if (this.g.type !== "idle" || !this.canDistribute(axis)) return;
    const s = this.store, shapes = this.selected().filter((sh): sh is Box | Text => !isArrow(sh));
    if (shapes.length < 3) return;
    const lo = (r: Rect) => (axis === "x" ? r.x : r.y), size = (r: Rect) => (axis === "x" ? r.w : r.h);
    const sorted = shapes.map((sh) => ({ sh, r: aabb(sh) })).sort((a, b) => lo(a.r) + size(a.r) / 2 - (lo(b.r) + size(b.r) / 2));
    const first = sorted[0]!, last = sorted[sorted.length - 1]!;
    const free = lo(last.r) + size(last.r) - lo(first.r) - sorted.reduce((n, o) => n + size(o.r), 0);
    const gap = free / (sorted.length - 1);
    let at = lo(first.r);
    const next: Shape[] = [];
    for (const o of sorted) {
      const d = at - lo(o.r);
      if (Math.abs(d) > 1e-9) next.push(axis === "x" ? { ...o.sh, x: o.sh.x + d } : { ...o.sh, y: o.sh.y + d });
      at += size(o.r) + gap;
    }
    if (next.length) s.run(() => s.put(...next));
    this.invalidate();
  }

  /** Change how the selection looks, and how the next shape will look. */
  /** Give the selected wires a port at one end, or take it away; and light their ports or leave them empty. */
  port(end: "a" | "b", on: boolean) {
    const s = this.store;
    s.run(() => s.put(...this.selected().filter(isArrow).map((w) => {
      const { ports: had, ...rest } = w, a = end === "a" ? on : had === "a" || had === "both", b = end === "b" ? on : had === "b" || had === "both";
      return { ...rest, ...(a && b ? { ports: "both" as const } : a ? { ports: "a" as const } : b ? { ports: "b" as const } : {}), ...(end === "b" && on && w.heads !== "none" ? { heads: "none" as const } : {}) } as Arrow;
    })));
    this.invalidate();
  }
  lit(on: boolean) {
    const s = this.store;
    s.run(() => s.put(...this.selected().filter(isArrow).map((w) => { const { unlit: _u, ...rest } = w; return (on ? rest : { ...rest, unlit: true as const }) as Arrow; })));
    this.invalidate();
  }
  restyle(change: { title?: "edge" | "corner"; pill?: boolean; ground?: "none" | "tint" | "solid" | "hatch" | "cross"; tone?: Tone; fill?: Fill; kind?: BoxKind; route?: Arrow["route"]; heads?: Arrow["heads"]; ports?: boolean; size?: number; line?: Line | "solid"; weight?: number; face?: string; align?: "left" | "center" | "right"; track?: number; case?: "upper" | "lower" | "title" }) {
    const s = this.store;
    if (change.tone) this.style.tone = change.tone;
    if (change.fill) this.style.fill = change.fill;
    if (change.route) {
      this.style.route = change.route;
      try {
        if (s.persist) localStorage.setItem(ROUTE_KEY, change.route);
      } catch {
        /* storage blocked */
      }
    }
    s.run(() => {
      // one write for the whole selection, however large
      const next: Shape[] = [];
      // (words being typed are restyled as they are typed, selected or not)
      const typing = s.editing && !s.sel.has(s.editing) ? s.doc.shapes[s.editing] : undefined;
      for (const sh0 of typing ? [...this.selected(), typing] : this.selected()) {
        // a colour or fill chosen here wins over an exact look brought in with the shape
        const sh = eased(sh0, change);
        // a shape the change says nothing about is left exactly as it is
        const mine = change.tone || change.face || (isBox(sh) ? change.size || change.weight || change.track !== undefined || change.case || change.fill || change.kind || change.line || ((change.ground || change.title) && sh.kind === "boundary") : isArrow(sh) ? change.route || change.heads || change.line || change.pill !== undefined : change.size || change.weight || change.face || change.align || change.case);
        if (!mine) continue;
        if (change.line && !isText(sh)) {
          const o: Box | Arrow = { ...sh, line: change.line === "solid" ? undefined : change.line };
          if (!o.line) delete o.line;
          next.push(isBox(o) ? this.fitted(o) : o);
          continue;
        }
        if (isBox(sh)) {
          let b: Box = { ...sh, ...(change.tone && { tone: change.tone }), ...(change.fill && { fill: change.fill }), ...(change.kind && { kind: change.kind }) };
          if (change.face) { const { face: _f, ...rest } = b; b = change.face === face() ? rest : { ...rest, face: change.face }; }
          // its words: how big, how heavy, how far apart, and in what case (a case chosen here is kept as typed)
          if (change.size) b = { ...b, size: change.size };
          if (change.weight) b = { ...b, weight: change.weight };
          if (change.track !== undefined) b = { ...b, track: change.track };
          if (change.case) b = { ...b, text: recase(b.text, change.case), cased: true };
          if (change.title && b.kind === "boundary") { const { title: _t, ...rest } = b; b = change.title === "corner" ? { ...rest, title: "corner" } : rest; }
          if (change.ground && b.kind === "boundary") {
            // a place's ground: bare, tinted, shaded, or ruled one way or both
            const { pattern: _p, ...rest } = b;
            b = { ...rest, fill: change.ground === "tint" ? "tint" : change.ground === "solid" ? "solid" : "none", ...(change.ground === "hatch" || change.ground === "cross" ? { pattern: change.ground } : {}) };
          }
          // a diamond needs height to read as one: at least 3:5, grown about its centre
          if (change.kind === "diamond" && b.h < b.w * 0.6) b = { ...b, y: b.y - (b.w * 0.6 - b.h) / 2, h: b.w * 0.6 };
          next.push(this.fitted(b));
        }
        else if (isArrow(sh)) { const { ports: had, pill: hadPill, ...rest0 } = sh; const { bow: hadBow, ...rest1 } = rest0; const rest = change.route && change.route !== sh.route ? rest1 : rest0; void hadBow; const pill = change.pill ?? !!hadPill; const { face: hadFace, ...rest2 } = rest; const fc = change.face ? (change.face === face() ? undefined : change.face) : hadFace; next.push({ ...rest2, ...(fc ? { face: fc } : {}), ...(pill ? { pill: true as const } : {}), ...(change.ports === undefined ? (had ? { ports: had } : {}) : change.ports ? { ports: "both" as const } : {}), ...(change.tone && { tone: change.tone }), ...(change.route && { route: change.route }), ...(change.heads && { heads: change.heads }) }); }
        else if (isText(sh)) {
          const size = change.size ?? sh.size;
          const { weight: _w, face: _f, align: _a, ...bare0 } = sh;
          const bare = { ...bare0, ...(change.case ? { text: recase(sh.text, change.case) } : {}) };
          // (the usual weight, face and setting are simply absent)
          const weight = change.weight ?? sh.weight, face = change.face ?? sh.face, align = change.align ?? sh.align ?? "left";
          const t: Text = { ...bare, ...(change.tone && { tone: change.tone }), size, ...(weight && weight !== 500 ? { weight } : {}), ...(face ? { face } : {}), ...(align !== "left" ? { align } : {}) };
          const l = textLayout(t);
          // set from its middle or its right, it grows from there
          const dx = align === "center" ? (sh.w - l.w) / 2 : align === "right" ? sh.w - l.w : 0;
          next.push({ ...t, x: sh.x + (sh.rot ? (sh.w - l.w) / 2 : dx), y: sh.y + (sh.h - l.h) / 2, w: l.w, h: l.h });
        }
      }
      if (next.length) s.put(...next);
    });
    // (while words are being typed the change is part of that edit, which has not ended: say so now, so the bar shows it)
    if (s.editing) s.emit();
    this.invalidate();
  }

  // ── keyboard ────────────────────────────────────────────────────
  /** Returns true when the key was used. */
  key(e: { key: string; code: string; shift: boolean; alt: boolean; meta: boolean; repeat: boolean }): boolean {
    const s = this.store;
    // any key stops what is playing; Escape does only that
    if (this.stop() && e.key === "Escape") return true;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!k.startsWith("Arrow") || e.meta) this.settle();
    if (e.code === "Space") {
      if (!this.space) {
        this.space = true;
        this.refreshCursor(this.last);
      }
      return true;
    }
    // While something is held, the keyboard only lets go of it: Escape and
    // ⌘Z both drop the drag. No command runs underneath a live gesture.
    if (this.g.type !== "idle" && k !== "Escape") {
      if (e.meta && k === "z") this.abort();
      return true;
    }
    if (e.meta) {
      if (k === "z") return (this.history(e.shift ? "redo" : "undo"), true);
      if (k === "y") return (this.history("redo"), true);
      if (k === "a") return (this.selectAll(), true);
      if (k === "d") return (this.duplicate(), true);
      if (k === "g") return (e.shift ? this.ungroup() : this.group(), true);
      if (k === "l" && e.shift) return (this.lock(), true);
      // copy, cut and paste arrive as clipboard events, so they reach other tabs and survive reloads
      if (k === "c" || k === "x" || k === "v") return false;
      if (k === "0") return (this.zoomTo(1), true);
      if (k === "=" || k === "+") return (this.zoomTo(s.cam.z * 1.25), true);
      if (k === "-") return (this.zoomTo(s.cam.z / 1.25), true);
      const dir = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }[k];
      if (dir !== undefined && isBox(this.single())) return (this.quickCreate(dir), true);
      return false;
    }
    if (e.alt) return false;
    if (k === "Escape") {
      // Escape always leads back to the pointer: it drops whatever is in
      // hand, leaves any tool, and only then lets go of the selection
      const dropped = this.abort();
      if (s.tool !== "select") this.setTool("select");
      else if (dropped) return true;
      else if (this.leave(true)) {
        s.emit();
        this.invalidate();
      } else if (s.sel.size) {
        s.select([]);
        this.overlay.stubsFor = null;
        s.emit();
        this.invalidate();
      }
      return true;
    }
    if (k === "Backspace" || k === "Delete") return (this.remove(), true);
    if (k === "Enter") {
      const one = this.single();
      if (one) this.edit(one.id);
      return !!one;
    }
    if (k === "Tab") {
      if (!isBox(this.single())) return false;
      this.quickCreate(e.shift ? 1 : 0);
      return true;
    }
    const step = e.shift ? 10 : 1;
    if (k === "ArrowLeft") return (this.nudge(-step, 0), true);
    if (k === "ArrowRight") return (this.nudge(step, 0), true);
    if (k === "ArrowUp") return (this.nudge(0, -step), true);
    if (k === "ArrowDown") return (this.nudge(0, step), true);
    if (e.shift) {
      if (e.code === "Digit1") return (this.fit(), true);
      if (e.code === "Digit2") return (s.sel.size ? this.fit(s.sel) : this.fit(), true);
      if (e.code === "Digit0") return (this.zoomTo(1), true);
      return false;
    }
    if (k === "]") return (this.order("front"), true);
    if (k === "[") return (this.order("back"), true);
    // (where the board has no live things, c and b keep the card and the boundary they name among the shapes)
    const tools: Record<string, Tool> = { ...KEY_TO_KIND, v: "select", h: "hand", a: "arrow", l: "line", t: "text", ...(this.liveKeys ? { c: "thread", s: "terminal", b: "browser" } as const : {}) };
    const tool = tools[k];
    if (tool && !e.repeat) return (this.setTool(tool), true);
    return false;
  }
  keyUp(code: string) {
    if (code.startsWith("Arrow")) this.settle();
    if (code === "Space") {
      this.space = false;
      this.refreshCursor(this.last);
    }
  }
  /** Undo or redo. Anything half-done is dropped first, so history never
   *  runs underneath a live drag. */
  history(dir: "undo" | "redo") {
    if (this.store.editing) this.flushText(); // what was being typed becomes its own step first
    this.abort();
    this.settle();
    if (dir === "undo") this.store.undo();
    else this.store.redo();
    this.overlay = emptyOverlay();
    this.invalidate();
  }
  /** The pointer was taken away mid-gesture: put everything back. */
  cancelPointer(id: number) {
    this.touches.delete(id);
    this.abort();
  }
  /** The window lost focus: nothing is held down any more. */
  blur() {
    this.space = false;
    this.touches.clear();
    this.abort();
    this.settle();
    this.refreshCursor(this.last);
  }
}

const ROUTE_KEY = "canvas:route:v1";
function readRoute(): Arrow["route"] {
  try {
    const r = typeof localStorage !== "undefined" ? localStorage.getItem(ROUTE_KEY) : null;
    return r === "straight" || r === "curve" ? r : "elbow";
  } catch {
    return "elbow";
  }
}

/** Words put into a case: all capitals, all small, or a capital to each word. */
export function recase(text: string, to: "upper" | "lower" | "title"): string {
  return to === "upper" ? text.toUpperCase() : to === "lower" ? text.toLowerCase() : text.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
}
