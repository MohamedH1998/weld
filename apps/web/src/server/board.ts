// One board on the server: a Durable Object found by the board's secret key. It keeps the board's document, hands it to every
// browser that has the board open and passes their edits on to the others, and puts down the diagrams agents draw.
// Edits are whole documents and the last one wins: two people moving the same thing at the same instant is rare enough.
import { DurableObject } from "cloudflare:workers";
import { Editor } from "@weld/canvas/editor";
import { boundsOf } from "@weld/canvas/geometry";
import { cleanDoc } from "@weld/canvas/clean";
import type { Doc, Shape } from "@weld/canvas/types";
import { compile } from "@weld/canvas/notation";
import { outlines } from "./assets";
import type { Spec } from "@weld/canvas/notation";

/** A board's document may grow to this, as JSON (a Durable Object keeps up to 2 MB under one key). */
export const MAX_DOC = 1_500_000;
/** What the agents' diagrams were drawn from, kept to redraw them, all together. */
const MAX_DRAWN = 600_000;
/** A board nobody has opened or changed for this long is cleared away. */
const IDLE = 180 * 24 * 3600 * 1000;
// (per board, per minute: so one runaway browser or agent cannot run up the bill)
const PER_MINUTE = { agent: 60, writes: 300, bytes: 60_000_000 };
const MAX_OPEN = 50;

type Entry = { group: string; spec: Spec };
const MOVED = "this board has moved to a new link: ask for the new one";
const NONE = "there is no board at this link";

export class Board extends DurableObject<Env> {
  private doc: Doc | null = null;
  // (a Map, not an object: a slug is any short word, "constructor" included)
  private drawn = new Map<string, Entry>();
  private v = 0;
  private moved = false;
  /** Made by the server (a new board, or a new link's): a key nobody was given is no board, and keeps nothing. */
  private made = false;
  private seen: Record<"agent" | "writes", number[]> = { agent: [], writes: [] };

  private async load() {
    if (this.doc) return;
    const got = await this.ctx.storage.get<unknown>(["doc", "drawn", "v", "moved", "moving", "made", "seen"]);
    this.moved = got.get("moved") === true;
    // (a board kept before boards were marked made is one: it has something stored)
    this.made = got.get("made") === true || got.has("v") || got.has("seen") || this.moved;
    // a move cut short (the board's server stopped mid-way) is undone: the board stays at this link, and whoever asked for
    // the new one asks again (the half-made copy sits at a key nobody was given, and is cleared with the idle ones)
    if (got.get("moving") && !this.moved) await this.ctx.storage.delete("moving");
    this.doc = (got.get("doc") as Doc | undefined) ?? { shapes: {}, order: [] };
    const drawn = got.get("drawn");
    this.drawn = new Map(Array.isArray(drawn) ? (drawn as [string, Entry][]) : []);
    this.v = (got.get("v") as number | undefined) ?? 0;
  }
  /** Keep a new state: checked whole first, written, and only then taken as the board's (a failed write changes nothing). */
  private async save(doc: Doc, drawn: Map<string, Entry>, from?: WebSocket) {
    const dj = JSON.stringify(doc), rj = JSON.stringify([...drawn]);
    if (dj.length > MAX_DOC) throw new Error("the board would be too big: remove something first");
    if (rj.length > MAX_DRAWN) throw new Error("this board holds too many agent diagrams: remove some first");
    const v = this.v + 1;
    await this.ctx.storage.put({ doc, drawn: [...drawn], v, seen: Date.now() });
    await this.ctx.storage.setAlarm(Date.now() + IDLE);
    this.doc = doc;
    this.drawn = drawn;
    this.v = v;
    const msg = JSON.stringify({ type: "doc", doc, v });
    for (const ws of this.ctx.getWebSockets()) if (ws !== from) try { ws.send(msg); } catch { /* gone */ }
    return v;
  }
  /** One more of `kind` within this minute's allowance; throws when it is spent. */
  private spend(kind: "agent" | "writes") {
    const now = Date.now(), list = (this.seen[kind] = this.seen[kind].filter((t) => now - t < 60_000));
    if (list.length >= PER_MINUTE[kind]) throw new Error(kind === "agent" ? "this board is getting a lot of agent calls: wait a minute and try again" : "this board is changing too fast: wait a minute");
    list.push(now);
  }
  /** `n` more bytes written within this minute's allowance. */
  private spendBytes(n: number) {
    const now = Date.now();
    this.bytes = this.bytes.filter((b) => now - b.t < 60_000);
    if (this.bytes.reduce((a, b) => a + b.n, 0) + n > PER_MINUTE.bytes) throw new Error("this board is changing too fast: wait a minute");
    this.bytes.push({ t: now, n });
  }
  private bytes: { t: number; n: number }[] = [];
  private ready() {
    if (this.moved) throw new Error(MOVED);
    if (!this.made) throw new Error(NONE);
  }
  /** A new, empty board, made by the server: from now on it is one (and is cleared like any other once idle). */
  async make() {
    await this.load();
    if (this.made) return;
    const now = Date.now();
    await this.ctx.storage.put({ made: true, seen: now });
    await this.ctx.storage.setAlarm(now + IDLE);
    this.made = true;
  }

  /** A browser opening the board: the document now, then every change as it happens. */
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    await this.load();
    if (this.ctx.getWebSockets().length >= MAX_OPEN) return new Response("this board is open in too many places", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    if (!this.moved && !this.made) {
      server.send(JSON.stringify({ type: "gone" }));
      server.close(4004, "no such board");
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!this.moved) await this.used();
    if (this.moved) {
      server.send(JSON.stringify({ type: "moved" }));
      server.close(4001, "moved");
    } else server.send(JSON.stringify({ type: "doc", doc: this.doc, v: this.v }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const no = (error: string, id?: number, retry = false) => ws.send(JSON.stringify({ type: "error", error, id, retry }));
    if (typeof msg !== "string" || msg.length > MAX_DOC + 1000) return no("that change is too big for one board");
    let m: { type?: string; doc?: unknown; id?: number };
    try { m = JSON.parse(msg); } catch { return; }
    if (m.type !== "put" || !m.doc || typeof m.doc !== "object") return;
    await this.load();
    if (this.moved) return ws.send(JSON.stringify({ type: "moved" }));
    if (!this.made) return ws.send(JSON.stringify({ type: "gone" }));
    try {
      this.spend("writes");
      this.spendBytes(msg.length);
      const doc = cleanDoc(m.doc);
      // a diagram someone took apart by hand is theirs now: the agent no longer redraws it in place
      const groups = new Set(Object.values(doc.shapes).map((s) => s.group).filter(Boolean));
      const drawn = new Map([...this.drawn].filter(([, d]) => groups.has(d.group)));
      const v = await this.save(doc, drawn, ws);
      ws.send(JSON.stringify({ type: "ack", id: m.id, v }));
    } catch (e) {
      const said = e instanceof Error ? e.message : "that change was not kept";
      no(said, m.id, /wait a minute/.test(said));
    }
  }
  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, "closed"); } catch { /* already */ }
  }
  /** Someone opened or asked about the board: it is in use (kept at most once a day, it is only for clearing idle boards). */
  private async used() {
    const now = Date.now();
    if (now - this.touched < 24 * 3600 * 1000) return;
    this.touched = now;
    await this.ctx.storage.put("seen", now);
    await this.ctx.storage.setAlarm(now + IDLE);
  }
  private touched = 0;
  async alarm() {
    const seen = await this.ctx.storage.get<number>("seen");
    // (a board open somewhere is in use, whatever the date)
    if (this.ctx.getWebSockets().length) return void (await this.ctx.storage.setAlarm(Date.now() + IDLE));
    if (seen && Date.now() - seen < IDLE) return void (await this.ctx.storage.setAlarm(seen + IDLE));
    // (a board that moved keeps saying so, whatever its age: its old link must never become a board again)
    const to = this.moved ? await this.ctx.storage.get<string>("movedTo") : undefined;
    await this.ctx.storage.deleteAll();
    if (this.moved) await this.ctx.storage.put({ moved: true, ...(to ? { movedTo: to } : {}) });
    this.doc = null;
  }

  /** Take over a board's contents (a new link's board, given the old one's). */
  async adopt(doc: Doc, drawn: [string, Entry][], from?: string) {
    await this.load();
    if (this.moved) throw new Error(MOVED);
    // (a board takes over another's only once, unless it is that same board handing over again after a lost answer)
    const was = await this.ctx.storage.get<string>("from");
    if ((this.doc!.order.length || this.drawn.size || this.v) && !(from && was === from)) throw new Error("that link is already in use");
    if (from) await this.ctx.storage.put("from", from);
    await this.ctx.storage.put("made", true);
    this.made = true;
    await this.save(cleanDoc(doc), new Map(drawn));
  }
  /**
   * Move this board to `key`: from the first step no change is taken here, then the contents go over whole, and every browser
   * and agent on this link is told it has moved. Done in one call, so two at once cannot both happen.
   */
  async moveTo(key: string) {
    await this.load();
    // (asked again while it is under way: the same move, waited for; asked again after it, with the key it went to: done)
    if (this.going?.key === key) return this.going.done;
    if (this.moved && (await this.ctx.storage.get<string>("movedTo")) === key) return;
    this.ready();
    const done = this.move(key);
    this.going = { key, done };
    try { await done; } finally { this.going = null; }
  }
  private going: { key: string; done: Promise<void> } | null = null;
  private async move(key: string) {
    // (from here no change is taken: the board is frozen as it goes over)
    await this.ctx.storage.put("moving", key);
    this.moved = true;
    try {
      await this.env.BOARD.get(this.env.BOARD.idFromName(key)).adopt(this.doc!, [...this.drawn], this.ctx.id.toString());
    } catch (e) {
      await this.ctx.storage.delete("moving");
      this.moved = false;
      throw e;
    }
    await this.ctx.storage.put({ moved: true, movedTo: key });
    await this.ctx.storage.delete(["doc", "drawn", "v", "moving"]);
    this.doc = { shapes: {}, order: [] };
    this.drawn = new Map();
    for (const ws of this.ctx.getWebSockets()) try { ws.send(JSON.stringify({ type: "moved" })); ws.close(4001, "moved"); } catch { /* gone */ }
  }

  /** Put an agent's diagram down; one with the slug of a diagram already here replaces it where it stands. Returns its moments. */
  async draw(spec: Spec): Promise<{ slug: string; moments: Shape[][]; replaced: boolean }> {
    await this.load();
    this.ready();
    this.spend("agent");
    // (words are measured as the diagram is laid out, so the face is loaded here, in the board's own isolate, first)
    await outlines();
    // (the board may have moved while the face loaded)
    this.ready();
    const def = compile(spec);
    const doc = this.doc!, before = this.drawn.get(def.slug);
    const editor = new Editor();
    editor.store.persist = false;
    editor.view = { w: 1600, h: 1200 };
    editor.store.setDoc(doc);
    // where it goes: where the one it replaces stood, or under everything on the board
    let at: { x: number; y: number };
    if (before) {
      const old = doc.order.filter((id) => doc.shapes[id]?.group === before.group);
      const b = boundsOf(doc, old);
      at = b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
      editor.store.remove(old);
      const scenes = { ...(editor.store.doc.scenes ?? {}) };
      delete scenes[before.group];
      editor.store.setDoc({ ...editor.store.doc, scenes });
    } else {
      const all = boundsOf(doc, doc.order);
      at = all ? { x: all.x, y: all.y + all.h + 240 } : { x: 0, y: 0 };
    }
    const first = def.build(), fb = boundsOf({ shapes: Object.fromEntries(first.map((s) => [s.id, s])), order: first.map((s) => s.id) }, first.map((s) => s.id));
    const had = new Set(editor.store.doc.order);
    editor.store.cam = { x: 0, y: 0, z: 1 };
    editor.armPattern(def);
    const p = { x: at.x + (fb?.w ?? 0) / 2, y: at.y + (fb?.h ?? 0) / 2, button: 0, shift: false, alt: false, meta: false, id: 1, touch: false };
    editor.down(p);
    editor.up(p);
    const next = editor.store.doc, mine = next.order.filter((id) => !had.has(id));
    const group = next.shapes[mine[0] ?? ""]?.group;
    if (!group) throw new Error("the diagram could not be put down");
    const drawn = new Map(this.drawn).set(def.slug, { group, spec });
    await this.save({ ...next }, drawn);
    return { slug: def.slug, moments: this.momentsOf(next, group), replaced: !!before };
  }
  /** A diagram's moments (or the board as it stands, when no slug is given), for a picture. */
  async look(slug?: string): Promise<Shape[][]> {
    await this.load();
    this.ready();
    this.spend("agent");
    await this.used();
    const doc = this.doc!;
    if (!slug) return [doc.order.map((id) => doc.shapes[id]!).filter(Boolean)];
    const d = this.drawn.get(slug);
    if (!d) throw new Error(`no diagram "${slug}" on this board (read the board to see what is here)`);
    return this.momentsOf(doc, d.group);
  }
  private momentsOf(doc: Doc, group: string): Shape[][] {
    const sc = doc.scenes?.[group];
    if (sc?.moments.length) return sc.moments.map((m, i) => (i === sc.at ? doc.order.map((id) => doc.shapes[id]!).filter((s) => s?.group === group) : m.shapes));
    return [doc.order.map((id) => doc.shapes[id]!).filter((s) => s?.group === group)];
  }
  /** What is on the board: the agents' diagrams with what they were drawn from, and the words of everything else. */
  async read() {
    await this.load();
    this.ready();
    this.spend("agent");
    await this.used();
    const doc = this.doc!, mine = new Set([...this.drawn.values()].map((d) => d.group));
    const others = doc.order.map((id) => doc.shapes[id]!).filter((s) => s && !(s.group && mine.has(s.group)));
    const words = others.map((s) => ("text" in s ? s.text : "")).filter((t): t is string => !!t && !!t.trim());
    return {
      diagrams: [...this.drawn].map(([slug, d]) => ({ slug, name: d.spec.name, spec: d.spec })),
      other: { shapes: others.length, words: words.slice(0, 200) },
    };
  }
}
