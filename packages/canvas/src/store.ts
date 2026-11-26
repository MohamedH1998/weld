// The board's state: the document, what is selected, where the camera
// is, and an undo history with one step per intention.
import { cleanDoc } from "./clean";
import { arrowPath } from "./geometry";
import { isArrow } from "./types";
import type { Box, Camera, Doc, End, Id, Shape, Tool } from "./types";

// (the page's own copy of each board under a name of its own: one board's copy never stands in for another's)
const BOARD = (globalThis as { weld?: { info?: { board?: { id?: string } } } }).weld?.info?.board?.id;
const PER = !BOARD || BOARD === "main" ? "" : `:${BOARD}`;
/** A drawing as it was (a step taken back, a gesture abandoned), with the threads kept off the board as they are now. */
const keepAway = (doc: Doc, now: Doc): Doc => {
  if (!now.away && !doc.away) return doc;
  const { away: _was, ...rest } = doc;
  return now.away ? { ...rest, away: now.away } : rest;
};
export const DOC_KEY = `canvas:doc:v1${PER}`;
export const CAM_KEY = `canvas:cam:v1${PER}`;
// further than any board reaches; beyond it positions lose their precision
const CAM_FAR = 2e7;

/** Same shapes, in the same order. Shapes are replaced, never mutated,
 *  so identity is enough. */
function sameDoc(a: Doc, b: Doc): boolean {
  if (a === b) return true;
  if (a.scenes !== b.scenes) return false;
  if (a.order.length !== b.order.length) return false;
  for (let i = 0; i < a.order.length; i++) {
    const id = a.order[i]!;
    if (id !== b.order[i] || a.shapes[id] !== b.shapes[id]) return false;
  }
  return true;
}

interface Step {
  doc: Doc;
  sel: Id[];
  /** Made by a helper on the person's behalf (a smith): its next step joins this one. */
  by?: object;
}

/** Whether two shapes say the same thing (one level into an arrow's ends and joins). */
const alike = (a: object, b: object, depth = 0): boolean => {
  if (a === b) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k];
    if (x === y) continue;
    if (depth < 2 && x && y && typeof x === "object" && typeof y === "object" && alike(x, y, depth + 1)) continue;
    return false;
  }
  return true;
};

export class Store {
  doc: Doc = { shapes: {}, order: [] };
  sel = new Set<Id>();
  cam: Camera = { x: 0, y: 0, z: 1 };
  tool: Tool = "select";
  /** The shape whose text is being typed. */
  editing: Id | null = null;
  snap = true;
  grid = true;
  /** A demo board keeps nothing. */
  persist = true;
  /** The saved board could not be read: it opened empty, not because it is. */
  loadFailed = false;
  /** A board kept on the server: what it sends is taken in like another tab's save. */
  shared = false;
  /** Told whenever a board from elsewhere has actually been taken in (it waits while a change is in hand here). */
  onAdopted: (() => void) | null = null;

  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private pending: Step | null = null;
  /** The person is in the middle of a change (a drag, a draw): it is not finished, and may yet be dropped. */
  get busy() {
    return !!this.pending;
  }
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  // what has changed since the last save: the board and the view are saved
  // separately, so looking around never rewrites the board
  private docDirty = false;
  private camDirty = false;
  /** A board saved by another tab while this one was busy. */
  private incoming: string | null = null;
  /** Bumps on every change; cheap "did anything change" for React. */
  version = 0;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  emit() {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  load() {
    if (!this.persist) return this.emit();
    try {
      // (the app's own file first, as it was read before the page started: the page's storage is a copy that may be
      // stale, or too small for a large board)
      const disk = (globalThis as { __weldBoard?: { doc?: string | null; damaged?: boolean } | null }).__weldBoard;
      const d = disk?.doc ?? localStorage.getItem(DOC_KEY);
      if (d) {
        this.doc = cleanDoc(JSON.parse(d));
      } else if (disk?.damaged) {
        // its file could not be read, and the page has no copy of it: an empty board here is not the board
        this.loadFailed = true;
      }
    } catch {
      // a damaged save: the board starts empty, and says so (nothing is decided from an empty board that is not one)
      this.loadFailed = true;
    }
    try {
      const c = localStorage.getItem(CAM_KEY);
      if (c) {
        const cam = JSON.parse(c) as Camera | null;
        if (cam && Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.z) && cam.z > 0 && Math.abs(cam.x) <= CAM_FAR && Math.abs(cam.y) <= CAM_FAR)
          this.cam = { x: cam.x, y: cam.y, z: Math.min(8, Math.max(0.05, cam.z)) };
      }
    } catch {
      /* a private window or a damaged save: start empty */
    }
    this.emit();
  }
  private save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 250);
  }
  saveNow() {
    if (!this.persist) return;
    try {
      // only finished intentions are saved: a drag in progress may yet be dropped
      if (this.docDirty) localStorage.setItem(DOC_KEY, JSON.stringify(this.pending ? keepAway(this.pending.doc, this.doc) : this.doc));
      if (this.camDirty) localStorage.setItem(CAM_KEY, JSON.stringify(this.cam));
      this.docDirty = this.camDirty = false;
    } catch {
      /* storage full or blocked */
    }
  }
  /** The board as it is kept: what has been finished (a drag in progress may yet be dropped). */
  docJson(): string {
    return JSON.stringify(this.pending ? keepAway(this.pending.doc, this.doc) : this.doc);
  }
  /** Another tab saved the board: show what it saved. If something is in
   *  hand here, wait; whichever tab finishes a change last has the board. */
  adopt(json: string | null) {
    if ((!this.persist && !this.shared) || json === null) return;
    if (this.pending) {
      this.incoming = json;
      return;
    }
    this.incoming = null;
    try {
      let next = cleanDoc(JSON.parse(json));
      // (the threads kept off the board here are as they are here: only this window starts, changes, lands or takes
      // them off, so what it has now is newer than any save it is shown)
      const mine = this.doc.away ?? {};
      if (Object.keys(mine).length) {
        const shapes = { ...next.shapes };
        for (const id of Object.keys(mine)) delete shapes[id];
        next = { ...next, shapes, order: next.order.filter((id) => !mine[id]), away: { ...next.away, ...mine } };
      }
      // (and those this window put on the board stay on it, as they are here)
      for (const id of this.landed) {
        const card = this.doc.shapes[id];
        if (!card || !next.away?.[id]) continue;
        const { [id]: _gone, ...rest } = next.away;
        next = { ...next, away: rest, ...(next.shapes[id] ? {} : { shapes: { ...next.shapes, [id]: card }, order: [...next.order, id] }) };
      }
      this.doc = next;
    } catch {
      return;
    }
    this.sel = new Set([...this.sel].filter((id) => this.doc.shapes[id]));
    this.editing = null;
    // history here describes a board that no longer exists
    this.undoStack = [];
    this.redoStack = [];
    this.docDirty = false;
    this.onAdopted?.();
    this.emit();
  }

  // ── history ─────────────────────────────────────────────────────
  /** A change that is not a step to undo (a page moved on, a thread was named): made and saved, and that is all. */
  quiet(fn: () => void) {
    fn();
    this.docDirty = true;
    this.save();
    this.emit();
  }
  /** Start an intention. Everything until `commit` is one undo step. */
  mark() {
    if (!this.pending) this.pending = { doc: this.doc, sel: [...this.sel] };
  }
  commit() {
    const p = this.pending;
    this.pending = null;
    // only a real difference is a step: something made and then removed
    // again within one intention (an abandoned empty text) leaves no trace
    if (p && !sameDoc(p.doc, this.doc)) {
      this.undoStack.push(p);
      if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
      this.docDirty = true;
      this.incoming = null;
      this.save();
    }
    this.emit();
    if (this.incoming !== null) this.adopt(this.incoming);
  }
  /** Abandon the intention in progress and put everything back. */
  cancel() {
    const p = this.pending;
    this.pending = null;
    if (p) {
      this.doc = keepAway(p.doc, this.doc);
      this.sel = new Set(p.sel);
    }
    this.emit();
    if (this.incoming !== null) this.adopt(this.incoming);
  }
  /** Do `fn` as a single undo step. */
  run(fn: () => void) {
    const nested = !!this.pending;
    this.mark();
    try {
      fn();
    } catch (e) {
      // a step that fails part way is taken back whole, and the board is not left waiting for it to finish
      if (!nested) this.cancel();
      throw e;
    }
    if (!nested) this.commit();
  }
  /** Do `fn` as an undo step that joins the one `who` made last, if nothing else has been done since: a helper's
   *  whole piece of work is one step for the person to take back. */
  runJoined(who: object, fn: () => void) {
    const top = this.undoStack[this.undoStack.length - 1];
    this.run(fn);
    const n = this.undoStack.length;
    // (nothing changed, no step was made: there is nothing to join, and the person's last step stays their own)
    if (this.undoStack[n - 1] === top) return;
    // the step before is this helper's own (marked as such, so other agents' work rewriting the steps does not lose it)
    if (n >= 2 && this.undoStack[n - 2]!.by === who) this.undoStack.pop();
    else this.undoStack[n - 1]!.by = who;
  }
  /** Who made the last step that can be undone, when a helper did (see runJoined). */
  get lastStepBy(): object | undefined {
    return this.undoStack[this.undoStack.length - 1]?.by;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    // (whose step it was goes with it, so the same step redone is still theirs)
    this.redoStack.push({ doc: this.doc, sel: [...this.sel], ...(s.by ? { by: s.by } : {}) });
    this.restore(s);
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ doc: this.doc, sel: [...this.sel], ...(s.by ? { by: s.by } : {}) });
    this.restore(s);
  }
  /** Changes made by someone else (an agent), as a collaborator's are: they land on the board as it is, and are written
   *  into every moment the person can step back or forward to, so the person's undo is of their own steps only. A shape
   *  changed by both keeps, for each property, the last change made to it. */
  applyForeign(put: Shape[], patch: { id: Id; change: Partial<Shape> | ((s: Shape) => Partial<Shape>) }[], remove: Id[], scenes?: (next: Doc, before: Doc) => Doc) {
    type Ends = Shape & { a?: { bind?: { id: Id } }; b?: { bind?: { id: Id } } };
    const ends = (s: Shape) => [(s as Ends).a?.bind?.id, (s as Ends).b?.bind?.id].filter((x): x is Id => !!x);
    let goneNow = new Set<Id>();
    const apply = (doc: Doc, live: boolean): Doc => {
      const shapes = { ...doc.shapes };
      let order = doc.order;
      // shapes first, then lines (a line is only put where both its ends are, in this moment as in that one)
      for (const s of [...put].sort((a, b) => Number(a.kind === "arrow") - Number(b.kind === "arrow"))) {
        if (shapes[s.id] && !live) continue;
        if (s.kind === "arrow" && !ends(s).every((e) => shapes[e])) continue;
        if (!shapes[s.id]) order = [...order, s.id];
        shapes[s.id] = s;
      }
      for (const p of patch) if (shapes[p.id]) shapes[p.id] = { ...shapes[p.id], ...(typeof p.change === "function" ? p.change(shapes[p.id]!) : p.change) } as Shape;
      // what is taken away goes, and with it any line left with nothing at one end: worked out for each moment on its own
      const gone = new Set(remove);
      if (gone.size) {
        for (const id of Object.keys(shapes)) if (shapes[id]!.kind === "arrow" && ends(shapes[id]!).some((e) => gone.has(e))) gone.add(id);
        for (const id of gone) delete shapes[id];
        order = order.filter((id) => !gone.has(id));
      }
      if (live) goneNow = gone;
      // (and what the change does to the states of drawings that play, in that moment as in this one)
      const next = { ...doc, shapes, order };
      // (a callback may add the first drawing that plays to a board that had none)
      return scenes ? scenes(next, doc) : next;
    };
    this.doc = apply(this.doc, true);
    if (this.pending) this.pending = { ...this.pending, doc: apply(this.pending.doc, false) };
    this.undoStack = this.undoStack.map((st) => ({ ...st, doc: apply(st.doc, false) }));
    this.redoStack = this.redoStack.map((st) => ({ ...st, doc: apply(st.doc, false) }));
    for (const id of goneNow) this.sel.delete(id);
    this.docDirty = true;
    this.save();
    this.emit();
  }
  /** Put shapes down on someone else's behalf (an agent): no step to undo. They are written into every moment the
   *  person can step back or forward to, as if they had always been there: undoing is of the person's own steps, and
   *  only a step of theirs (moving one, removing one) changes them. */
  /** Writes that are nobody's doing (an agent's, the board fitting words to a font): not marked as the person's. */
  unmarked<T>(fn: () => T): T {
    const was = this.foreign;
    this.foreign = true;
    try {
      return fn();
    } finally {
      this.foreign = was;
    }
  }
  putForeign(...shapes: Shape[]) {
    this.unmarked(() => this.put(...shapes));
    const into = (st: Step): Step => {
      const missing = shapes.filter((s) => !st.doc.shapes[s.id]);
      if (!missing.length) return st;
      const next = { ...st.doc.shapes };
      for (const s of missing) next[s.id] = s;
      return { ...st, doc: { ...st.doc, shapes: next, order: [...st.doc.order, ...missing.map((s) => s.id)] } };
    };
    this.undoStack = this.undoStack.map(into);
    this.redoStack = this.redoStack.map(into);
    // a gesture under way when they arrive keeps them, whether it is finished or abandoned, and does not count them as its own
    if (this.pending) {
      const was = this.doc;
      this.doc = this.pending.doc;
      this.unmarked(() => this.put(...shapes));
      this.pending = { ...this.pending, doc: this.doc };
      this.doc = was;
    }
    this.docDirty = true;
    this.save();
    this.emit();
  }
  private restore(s: Step) {
    this.doc = keepAway(s.doc, this.doc);
    this.sel = new Set(s.sel.filter((id) => s.doc.shapes[id]));
    this.editing = null;
    this.docDirty = true;
    this.save();
    this.emit();
  }

  // ── document edits (always inside mark/commit or run) ───────────
  /** Replace the whole drawing (used where shapes, their order and their scenes change together). */
  setDoc(doc: Doc) {
    this.doc = doc.away ? doc : keepAway(doc, this.doc);
  }
  put(...shapes: Shape[]) {
    const next = { ...this.doc.shapes };
    const order = [...this.doc.order];
    let changed = false;
    for (const s0 of shapes) {
      const was = next[s0.id];
      // a shape written back exactly as it was is not a change, and leaves no step to undo
      if (was && alike(was, s0)) continue;
      // (made or changed here, it is the person's, where the app keeps track: see markEdits)
      const s = this.markEdits && !this.foreign && !s0.edited ? ({ ...s0, edited: true } as Shape) : s0;
      if (!was) order.push(s.id);
      next[s.id] = s;
      changed = true;
    }
    if (changed) this.doc = { ...this.doc, shapes: next, order };
  }
  patch<T extends Shape>(id: Id, change: Partial<T>) {
    const s = this.doc.shapes[id];
    if (s) this.put({ ...s, ...change } as Shape);
    // (a thread kept off the board is changed where it is kept)
    else if (this.doc.away?.[id]) this.doc = { ...this.doc, away: { ...this.doc.away, [id]: { ...this.doc.away[id]!, ...(change as Partial<Box>) } } };
  }
  // ── threads kept off the board (never undone: a thread does not leave or come back with a step taken back) ──
  /** Keep a thread off the board. */
  putAway(box: Box) {
    this.doc = { ...this.doc, away: { ...this.doc.away, [box.id]: box } };
    this.docDirty = true;
    this.save();
    this.emit();
  }
  /** Put a thread kept off the board onto it, as the box given, in every moment the person can step back or forward to. */
  /** Threads this window put on the board (a save made before that, shown later, does not take them back off). */
  private landed = new Set<Id>();
  /** Mark what the person makes or changes as theirs (`edited`), so an agent leaves it be (the Mac app turns this on). */
  markEdits = false;
  /** Writing on an agent's behalf: what is put is not the person's. */
  private foreign = false;
  land(box: Box) {
    this.landed.add(box.id);
    const { [box.id]: _gone, ...rest } = this.doc.away ?? {};
    this.doc = { ...this.doc, away: rest };
    this.putForeign(box);
  }
  /** Take a thread off the board (from every moment of the person's history too), and keep it beside the board. */
  sendAway(id: Id, box: Box) {
    this.landed.delete(id);
    this.applyForeign([], [], [id]);
    this.putAway(box);
  }
  /** Remove shapes. Arrows bound to a removed box keep their place as
   *  free ends, so deleting a box never silently deletes its arrows. */
  remove(ids: Iterable<Id>) {
    const gone = new Set(ids);
    if (!gone.size) return;
    const next: Record<Id, Shape> = {};
    for (const id of this.doc.order) {
      const s = this.doc.shapes[id];
      if (!s || gone.has(id)) continue;
      if (isArrow(s) && ((s.a.bind && gone.has(s.a.bind.id)) || (s.b.bind && gone.has(s.b.bind.id)))) {
        // a freed end stays exactly where it was drawn, not at the hidden anchor
        const pts = arrowPath(this.doc, s);
        const free = (e: End, at: { x: number; y: number } | undefined): End =>
          e.bind && gone.has(e.bind.id) && at ? { x: at.x, y: at.y } : e;
        next[id] = { ...s, a: free(s.a, pts[0]), b: free(s.b, pts[pts.length - 1]) };
      } else next[id] = s;
    }
    this.doc = { ...this.doc, shapes: next, order: this.doc.order.filter((id) => !gone.has(id)) };
    for (const id of gone) this.sel.delete(id);
    if (this.editing && gone.has(this.editing)) this.editing = null;
  }
  reorder(ids: Set<Id>, where: "front" | "back") {
    const picked = this.doc.order.filter((id) => ids.has(id));
    const rest = this.doc.order.filter((id) => !ids.has(id));
    this.doc = { ...this.doc, order: where === "front" ? [...rest, ...picked] : [...picked, ...rest] };
  }

  select(ids: Iterable<Id>) {
    this.sel = new Set(ids);
  }
  setCamera(cam: Camera) {
    // the one place the zoom limits live, so no path can step outside them
    const z = Math.min(8, Math.max(0.05, cam.z));
    const far = (v: number) => Math.min(CAM_FAR, Math.max(-CAM_FAR, v));
    const x = far(cam.x), y = far(cam.y), c = this.told;
    // (a view that has not moved since it was last set, as at the end of the zoom, is not a change: nothing is redrawn
    // for it. A view moved by hand, by setting `cam` and then this, is told all the same)
    if (c && c.x === x && c.y === y && c.z === z && this.cam === c) return;
    this.cam = this.told = { x, y, z };
    this.camDirty = true;
    this.save();
    this.camBumps += 1;
    this.emit();
  }
  /** The view as it was last set here. */
  private told: Camera | null = null;
  /** How many of the changes were only the view moving: what does not care where the view is can leave those out. */
  camBumps = 0;
  /** Bumps on every change but a move of the view. */
  getStill = () => this.version - this.camBumps;
  setTool(tool: Tool) {
    this.tool = tool;
    this.emit();
  }
}
