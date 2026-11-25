// Weld's threads, offered to T3 Code (or any ACP client) as ACP sessions. T3 Code runs `weld acp` (bin/weld-acp.cjs),
// which only carries bytes between its stdin/stdout and the socket here; everything ACP is spoken in this file.
import { APP_ID } from "./identity.mjs";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, realpathSync, statSync, unlinkSync, chmodSync } from "node:fs";

import net from "node:net";
import path from "node:path";

const MAX_LINE = 1 << 20; // a request line, in bytes, before it is parsed
const MAX_UNSENT = 8 << 20; // what may wait to be written to a reader that is not reading
const MAX_IN_FLIGHT = 32;
const MAX_TEXT = 400 * 1024;
const REPLAY_ITEMS = 2000;
const PAGE = 100;

const MODES = [
  { id: "default", name: "Default", description: "Uses the thread's mode in Weld" },
];
const modesOf = (mode) => ({ currentModeId: mode, availableModes: MODES });
// (the agent and model are the thread's own, chosen in Weld; T3 Code is shown one model so its picker has a name)
const MODELS = { currentModelId: "weld", availableModels: [{ modelId: "weld", name: "Weld", description: "The thread's own agent and model, as set in Weld" }] };

/** Where the socket for this data folder lives: short (unix sockets allow 104 bytes), per user, one per data folder. */
export function socketPathFor(userData, tmp) {
  return path.join(tmp, `weld-${createHash("sha256").update(userData).digest("hex").slice(0, 12)}.sock`);
}

/** Listen on the socket, if it is safe to: the folder is this user's and closed to others, the path fits, and any file
 *  already there is a socket of this user's that nobody answers on. Answers the server and how to close it, or why not. */
export async function listen(file, onSocket) {
  if (Buffer.byteLength(file) >= 104) return { why: `the socket path is too long (${file})` };
  const dir = path.dirname(file);
  try {
    const d = statSync(dir);
    if (!d.isDirectory() || d.uid !== process.getuid() || (d.mode & 0o022) !== 0) return { why: `${dir} is not a private folder of this user's` };
  } catch {
    return { why: `${dir} is not there` };
  }
  let there = null;
  try {
    there = lstatSync(file);
  } catch {
    /* nothing there */
  }
  if (there) {
    if (!there.isSocket() || there.uid !== process.getuid()) return { why: `${file} is something else's` };
    const answer = await new Promise((done) => {
      const c = net.connect(file);
      const t = setTimeout(() => (c.destroy(), done("timeout")), 1000);
      c.once("connect", () => (clearTimeout(t), c.destroy(), done("live")));
      c.once("error", (e) => (clearTimeout(t), done(e.code)));
    });
    // only a socket nobody answers on is taken for one left by a Weld that died; anything else is left alone
    if (answer !== "ECONNREFUSED") return { why: answer === "live" ? "another Weld is already answering for this data folder" : `${file} did not answer clearly (${answer})` };
    try {
      unlinkSync(file);
    } catch {
      return { why: `${file} could not be cleared` };
    }
  }
  const server = net.createServer(onSocket);
  const ok = await new Promise((done) => {
    server.once("error", (e) => done(e));
    server.listen(file, () => done(null));
  });
  if (ok) return { why: `could not listen (${ok.code || ok.message})` };
  try {
    chmodSync(file, 0o600);
  } catch {
    server.close();
    return { why: "could not make the socket private" };
  }
  // (which file is ours: its inode and when it was made, since a removed file's inode number can come back at once)
  const mine = lstatSync(file);
  const same = (st) => st.ino === mine.ino && st.birthtimeMs === mine.birthtimeMs && st.ctimeMs === mine.ctimeMs;
  return {
    server,
    close() {
      // Node removes the file at this path when the server closes, whoever's it is by then: closed only while it is ours
      let ours = false;
      try {
        ours = same(lstatSync(file));
      } catch {
        /* gone already */
      }
      if (ours) server.close();
      else server.unref();
    },
  };
}

// ── what T3 Code sends as a message ─────────────────────────────────
const OPEN = "<t3_code_instructions>\n";
const SPLIT = "\n</t3_code_instructions>\n\n<user_request>\n";
const CLOSE = "\n</user_request>";
const RUNTIME = "<runtime_info>In case you're asked: you are running in T3 Code";

/** The person's own words from an ACP prompt: T3 Code's envelope taken off (only when it is exactly T3's), its runtime
 *  block dropped, links and text resources kept. Throws, in words for the person, what cannot be taken. */
export function promptText(blocks) {
  if (!Array.isArray(blocks)) throw new Error("The message is empty.");
  const parts = [];
  let first = true;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") {
      let t = b.text;
      if (first) {
        first = false;
        if (t.startsWith(OPEN) && t.endsWith(CLOSE)) {
          const at = t.indexOf(SPLIT);
          if (at > 0 && at + SPLIT.length <= t.length - CLOSE.length) t = t.slice(at + SPLIT.length, t.length - CLOSE.length);
        }
      } else if (t.startsWith(RUNTIME)) continue;
      parts.push(t);
    } else if (b.type === "resource_link" && typeof b.uri === "string") parts.push(`[${b.name || b.title || b.uri}](${b.uri})`);
    else if (b.type === "resource" && b.resource && typeof b.resource.text === "string") parts.push(b.resource.text);
    else if (b.type === "image" || b.type === "audio" || b.type === "resource") throw new Error("Weld does not take pictures or files from T3 Code yet.");
  }
  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("The message is empty.");
  if (Buffer.byteLength(text) > MAX_TEXT) throw new Error("The message is too long for Weld (more than 400 KB).");
  return text;
}

// ── a thread's record as ACP updates ────────────────────────────────
const KINDS = { Read: "read", Edit: "edit", Write: "edit", MultiEdit: "edit", NotebookEdit: "edit", Bash: "execute", Grep: "search", Glob: "search", WebFetch: "fetch", WebSearch: "fetch" };
const STATUS = { running: "in_progress", done: "completed", error: "failed", stopped: "failed", denied: "failed" };
const clipTo = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…` : s);
const textContent = (text) => [{ type: "content", content: { type: "text", text } }];
const kindOf = (name) => KINDS[name] ?? "other";

/** The updates that tell an item as it stands (replay, or an item seen for the first time). */
function told(it) {
  switch (it.kind) {
    case "user":
      return [{ sessionUpdate: "user_message_chunk", content: { type: "text", text: clipTo(String(it.text ?? ""), 65536) } }];
    case "text":
      return it.text ? [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: clipTo(String(it.text), 65536) } }] : [];
    case "thinking":
      return it.text ? [{ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: clipTo(String(it.text), 65536) } }] : [];
    case "tool": {
      // (an ACP agent's own kind of step and the files it touches, passed on as they came)
      const call = { sessionUpdate: "tool_call", toolCallId: it.id, title: it.title || it.name || "Step", kind: it.acpKind ?? kindOf(it.name), status: STATUS[it.status] ?? "in_progress", rawInput: it.input ?? {} };
      if (Array.isArray(it.locations) && it.locations.length) call.locations = it.locations;
      if (it.output) call.content = textContent(clipTo(String(it.output), 16384));
      return [call];
    }
    case "changes": {
      const n = it.files?.length ?? 0;
      return [{ sessionUpdate: "tool_call", toolCallId: it.id, title: `Changed ${n} file${n === 1 ? "" : "s"}`, kind: "edit", status: "completed", content: textContent(clipTo(String(it.patch ?? (it.files ?? []).map((f) => f.path).join("\n")), 61440)) }];
    }
    case "plan":
      return [{ sessionUpdate: "plan", entries: (it.entries ?? []).map((e) => ({ content: e.content, priority: e.priority ?? "medium", status: e.status ?? "pending" })) }];
    case "note":
      return [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: `\n\n_${it.text}_\n\n` } }];
    case "error":
      return [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: `\n\nError: ${it.text}\n\n` } }];
    default:
      return [];
  }
}

/** Mac turns put in words, for the phone (who said what), most recent last. */
function inWords(items) {
  const lines = [];
  for (const it of items) {
    if (it.kind === "user") lines.push(`You, in Weld: ${it.text}`);
    else if (it.kind === "text" && it.text) lines.push(`Agent: ${it.text}`);
    else if (it.kind === "error") lines.push(`Error: ${it.text}`);
  }
  let text = lines.join("\n\n");
  if (text.length > 32768) text = `…\n${text.slice(-32768)}`;
  return text;
}

const realDir = (p) => {
  try {
    const r = realpathSync(p);
    return statSync(r).isDirectory() ? r : null;
  } catch {
    return null;
  }
};
const newThreadId = () => `s${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

// ── the host ────────────────────────────────────────────────────────
export class AcpHost {
  /** @param {{ threads: any, board: { members(): { ok: true, ids: Set<string> } | { ok: false, reason: string }, create(id: string, cwd: string): Promise<void> }, version: string, log?: (s: string) => void }} o */
  constructor(o) {
    this.o = o;
    this.conns = new Set();
    /** A turn started from ACP, by thread: who started it (the only one told of it as it happens). */
    this.controllers = new Map();
  }
  attach(socket) {
    const c = new Conn(this, socket);
    this.conns.add(c);
  }
  close() {
    for (const c of this.conns) c.socket.destroy();
  }
  /** Something happened in a thread: told, as it happens, to whoever started the turn under way (and nobody else). */
  onThreadEvent(id, ev) {
    const ctl = this.controllers.get(id);
    if (!ctl || ctl.conn.dead) return;
    const s = ctl.conn.sessions.get(ctl.sid);
    if (!s) return;
    if (ev.t === "item") ctl.conn.tellItem(s, ev.item, ctl);
    else if (ev.t === "delta") {
      const was = s.sent.get(ev.id);
      if (!was) return;
      was.len += ev.text.length;
      ctl.conn.update(s.id, { sessionUpdate: was.kind === "thinking" ? "agent_thought_chunk" : "agent_message_chunk", content: { type: "text", text: ev.text } });
    } else if (ev.t === "meta" && ev.meta?.title && ev.meta.title !== s.title) {
      s.title = ev.meta.title;
      ctl.conn.update(s.id, { sessionUpdate: "session_info_update", title: ev.meta.title });
    }
  }
  /** A turn's milestones: what it was shown of the board, and its end. */
  onTurn(id, ev) {
    const ctl = this.controllers.get(id);
    if (!ctl || ctl.turn !== ev.turn) return;
    if (ev.t === "board") {
      if (!ctl.conn.dead) ctl.conn.update(ctl.sid, { sessionUpdate: "tool_call", toolCallId: `${ev.turn}b`, title: "Looked at the board", kind: "read", status: "completed", content: textContent(clipTo(ev.text, 16384)) });
      return;
    }
    if (ev.t !== "settled") return;
    this.controllers.delete(id);
    // T3 Code has kept everything up to the end of this turn (it was streamed into it), as far as can be told: the catch-up
    // mark moves here only if the client was still there to take it (a client gone mid-turn may have missed the catch-up)
    const t = this.o.threads.get(id);
    if (t.items.length && !ctl.conn.dead && !ctl.conn.socket.destroyed) this.o.threads.meta(id, { acpSeen: t.items[t.items.length - 1].id });
    ctl.conn.answer(ctl.req, { stopReason: ev.outcome === "stopped" ? "cancelled" : "end_turn" });
    if (ctl.req !== undefined) ctl.conn.inFlight -= 1;
    // questions still out to the client for this turn are answered no more (only this turn's: another may be asking)
    ctl.conn.retire((w) => w.turn === ev.turn);
  }
}

class Conn {
  constructor(host, socket) {
    this.host = host;
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.inFlight = 0;
    this.dead = false;
    /** Sessions this client has opened, by id (always a Weld thread id). */
    this.sessions = new Map();
    /** Questions put to the client (permission), by request id. */
    this.waiting = new Map();
    this.seq = 0;
    socket.on("data", (d) => this.read(d));
    socket.on("error", () => this.drop());
    socket.on("close", () => this.drop());
  }
  get threads() {
    return this.host.o.threads;
  }
  drop() {
    if (this.dead) return;
    this.dead = true;
    this.host.conns.delete(this);
    // a turn this client started is stopped when it goes (T3 Code's Force stop, a dead shim): nobody could stop it otherwise
    for (const [id, ctl] of this.host.controllers) if (ctl.conn === this) this.threads.stop(id);
    for (const s of this.sessions.values()) s.op?.cancel();
    this.retire(() => true);
  }
  /** Questions put to the client that no longer matter (answered on the Mac, the turn over, the client gone). */
  retire(which) {
    for (const [rid, w] of this.waiting)
      if (which(w)) {
        this.waiting.delete(rid);
        w.done(null);
      }
  }
  read(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    let nl;
    while ((nl = this.buf.indexOf(10)) >= 0) {
      if (nl > MAX_LINE) {
        this.host.o.log?.("acp: a line over 1 MB; closing that connection");
        this.socket.destroy();
        return;
      }
      const line = this.buf.subarray(0, nl).toString("utf8").trim();
      this.buf = this.buf.subarray(nl + 1);
      if (line) this.take(line);
      if (this.dead) return;
    }
    if (this.buf.length > MAX_LINE) {
      this.host.o.log?.("acp: a line over 1 MB; closing that connection");
      this.socket.destroy();
    }
  }
  write(obj) {
    if (this.dead) return;
    if (this.socket.writableLength > MAX_UNSENT) {
      this.host.o.log?.("acp: the client is not reading; closing that connection");
      this.socket.destroy();
      return;
    }
    const line = JSON.stringify(obj);
    this.socket.write(`${line}\n`);
  }
  /** Written, then waited on until the client has taken it in (for a replay, so it never piles up). */
  async writeNow(obj) {
    this.write(obj);
    if (this.dead || !this.socket.writableNeedDrain) return;
    await new Promise((r) => {
      const done = () => (this.socket.off("drain", done), this.socket.off("close", done), r());
      this.socket.on("drain", done).on("close", done);
    });
  }
  answer(id, result) {
    if (id !== undefined) this.write({ jsonrpc: "2.0", id, result });
  }
  fail(id, code, message) {
    if (id !== undefined) this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }
  update(sessionId, update) {
    this.write({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
  }
  ask(method, params, about = {}) {
    const id = `w${(this.seq += 1)}`;
    return new Promise((done) => {
      this.waiting.set(id, { done, ...about });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }
  take(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return this.write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return this.write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
    // an answer to a question put to the client
    if (msg.method === undefined && msg.id !== undefined) {
      const w = this.waiting.get(msg.id);
      if (w) (this.waiting.delete(msg.id), w.done(msg.error ? null : msg.result));
      return;
    }
    if (typeof msg.method !== "string") return this.fail(msg.id ?? null, -32600, "Invalid request");
    if (msg.id !== undefined && this.inFlight >= MAX_IN_FLIGHT) return this.fail(msg.id, -32000, "Too many requests at once.");
    if (msg.id !== undefined) this.inFlight += 1;
    const id = msg.id;
    // (a prompt is answered when its turn ends, which may be long after this request is taken in)
    let held = false;
    const hold = () => {
      held = true;
    };
    Promise.resolve()
      .then(() => this.handle(msg.method, msg.params ?? {}, id, hold))
      .then(
        (r) => {
          if (!held && id !== undefined) this.answer(id, r ?? {});
        },
        (e) => {
          if (id !== undefined) this.fail(id, e?.code ?? -32000, String(e?.message || e));
        },
      )
      .finally(() => {
        // (a held prompt keeps its place until its turn ends: counted down then)
        if (id !== undefined && !held) this.inFlight -= 1;
      });
  }
  members() {
    const m = this.host.o.board.members();
    if (!m.ok) throw Object.assign(new Error(m.reason), { code: -32000 });
    return m.ids;
  }
  session(sessionId) {
    const s = typeof sessionId === "string" ? this.sessions.get(sessionId) : null;
    if (!s) throw Object.assign(new Error("Open this thread first (session/load)."), { code: -32602 });
    return s;
  }
  async handle(method, p, id, hold) {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: true,
            sessionCapabilities: { list: {} },
            promptCapabilities: { image: false, audio: false, embeddedContext: false },
            mcpCapabilities: { http: false, sse: false },
          },
          authMethods: [],
          agentInfo: { name: "weld", title: "Weld", version: this.host.o.version },
        };
      case "authenticate":
        return {};
      case "session/list": {
        const want = typeof p.cwd === "string" ? realDir(p.cwd) : null;
        if (!want) return { sessions: [] };
        const ids = this.members();
        const all = [];
        for (const tid of ids) {
          if (tid.startsWith("smith")) continue;
          const t = this.threads.get(tid);
          if (t.meta.smith || t.meta.acpMade || realDir(t.meta.cwd) !== want) continue;
          const last = t.items.length ? t.items[t.items.length - 1].at : 0;
          const at = Math.max(last || 0, t.meta.endedAt || 0, t.meta.startedAt || 0);
          all.push({ sessionId: tid, cwd: want, title: t.meta.title || "New thread", updatedAt: new Date(at || Date.now()).toISOString(), at });
        }
        all.sort((a, b) => b.at - a.at);
        const from = Math.max(0, Number.parseInt(String(p.cursor ?? "0"), 10) || 0);
        const page = all.slice(from, from + PAGE).map(({ at, ...x }) => x);
        return from + PAGE < all.length ? { sessions: page, nextCursor: String(from + PAGE) } : { sessions: page };
      }
      case "session/new": {
        const cwd = typeof p.cwd === "string" ? realDir(p.cwd) : null;
        if (!cwd) throw Object.assign(new Error("That folder is not there."), { code: -32602 });
        this.members();
        // the id the thread will have; nothing is made until its first message (T3 Code opens sessions to probe)
        const sid = newThreadId();
        this.sessions.set(sid, { id: sid, mode: "default", pending: cwd, ws: cwd, seen: new Set(), sent: new Map(), title: "" });
        return { sessionId: sid, modes: modesOf("default"), models: MODELS };
      }
      case "session/load":
      case "session/resume": {
        const sid = p.sessionId;
        if (typeof sid !== "string" || !this.members().has(sid) || sid.startsWith("smith")) throw Object.assign(new Error("This thread is no longer on the board in Weld."), { code: -32002 });
        const t = this.threads.get(sid);
        if (t.meta.smith) throw Object.assign(new Error("This thread is no longer on the board in Weld."), { code: -32002 });
        // T3 Code's files, terminal and checkpoints work in its project folder: the thread must work in that same one
        const ws = typeof p.cwd === "string" ? realDir(p.cwd) : null;
        const own = realDir(t.meta.cwd);
        if (!ws || ws !== own) throw Object.assign(new Error(`This thread works in ${t.meta.cwd}. Open it from a T3 Code project at that folder.`), { code: -32002 });
        // (a prompt still waiting to be let in is carried over, so it can still be cancelled)
        const s = { id: sid, mode: this.sessions.get(sid)?.mode ?? "default", pending: null, ws, seen: new Set(), sent: new Map(), title: t.meta.title || "", op: this.sessions.get(sid)?.op ?? null };
        this.sessions.set(sid, s);
        if (method === "session/load") {
          const items = t.items.filter((x) => !x.parent || x.kind === "tool").map((x) => ({ ...x }));
          const from = Math.max(0, items.length - REPLAY_ITEMS);
          if (from > 0) await this.writeNow({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "_Earlier messages are in Weld._\n\n" } } } });
          for (const it of items.slice(from)) for (const u of told(it)) await this.writeNow({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: u } });
        }
        // (the catch-up mark is not moved by a load: T3 Code does not keep what a load replays into its saved conversation
        // (as of its server 0.1.9, an import copies no history), so the first message from T3 carries what came before)
        return { modes: modesOf(s.mode), models: MODELS };
      }
      case "session/set_mode": {
        const s = this.session(p.sessionId);
        if (!MODES.some((m) => m.id === p.modeId)) throw Object.assign(new Error(`There is no mode "${p.modeId}".`), { code: -32602 });
        s.mode = p.modeId;
        this.update(s.id, { sessionUpdate: "current_mode_update", currentModeId: s.mode });
        return {};
      }
      case "session/prompt": {
        let s = this.session(p.sessionId);
        const text = promptText(p.prompt);
        if (this.host.controllers.has(s.id) || s.op) throw Object.assign(new Error("This thread is busy in Weld. Send again when it has finished."), { code: -32000 });
        // registered before anything is waited on: a cancel, or this client going, answers it at once and it is never let in
        let cancel;
        const op = { void: false, cancelled: new Promise((r) => (cancel = r)) };
        op.cancel = () => ((op.void = true), cancel());
        s.op = op;
        try {
          if (s.pending) {
            // its first message: the thread is made now, in the folder T3 Code asked for, with Weld's defaults
            // (carried on if the prompt is cancelled meanwhile; making it again is harmless, so the next prompt simply waits for it)
            const made = this.host.o.board.create(s.id, s.pending).then(() => (s.pending = null));
            made.catch(() => {});
            await Promise.race([made, op.cancelled]);
          }
          // (a turn that has ended but is still writing what it changed is waited for, briefly: the thread looks ready;
          // everything below is checked after, as it then stands)
          if (!op.void && !s.pending && this.threads.settling(s.id)) await Promise.race([this.threads.whenFree(s.id, 10000), op.cancelled]);
        } finally {
          if (s.op === op) s.op = null;
          // (and from the session as it now stands, if it was opened again meanwhile)
          const cur = this.sessions.get(s.id);
          if (cur?.op === op) cur.op = null;
        }
        // (the session as it stands after any wait: opened again meanwhile, its mode and folder are the new ones)
        s = this.sessions.get(s.id) ?? s;
        if (op.void || this.dead) return { stopReason: "cancelled" };
        if (!this.members().has(s.id)) throw Object.assign(new Error("This thread is no longer on the board in Weld."), { code: -32002 });
        if (this.host.controllers.has(s.id)) throw Object.assign(new Error("This thread is busy in Weld. Send again when it has finished."), { code: -32000 });
        const now = realDir(this.threads.get(s.id).meta.cwd);
        if (now !== s.ws) throw Object.assign(new Error(`This thread now works in ${this.threads.get(s.id).meta.cwd}, not ${s.ws}. Open it from a T3 Code project at its folder.`), { code: -32000 });
        const busy = this.threads.cannotStart(s.id);
        if (busy) throw Object.assign(new Error(busy), { code: -32000 });
        // what happened in Weld since T3 Code last kept this thread, put in words first (before the turn's own steps)
        const t = this.threads.get(s.id);
        const mark = t.meta.acpSeen ? t.items.findIndex((x) => x.id === t.meta.acpSeen) : -1;
        const missed = (t.meta.acpSeen ? t.items.slice(mark + 1) : t.items).filter((x) => !x.parent);
        const words = inWords(missed);
        if (words) this.update(s.id, { sessionUpdate: "tool_call", toolCallId: `m${Date.now().toString(36)}`, title: "Meanwhile in Weld", kind: "other", status: "completed", content: textContent(words) });
        // this client follows the turn from its very first step (a turn can fail as it is let in: that is told too)
        const ctl = { conn: this, sid: s.id, turn: null, req: id };
        this.host.controllers.set(s.id, ctl);
        const r = this.threads.startFor(s.id, { text });
        if (!r.ok) {
          this.host.controllers.delete(s.id);
          throw Object.assign(new Error(r.reason), { code: -32000 });
        }
        ctl.turn = r.turn;
        hold();
        return undefined;
      }
      case "session/cancel": {
        const sid = p.sessionId;
        const ctl = typeof sid === "string" ? this.host.controllers.get(sid) : null;
        // only the turn this client started; it answers "cancelled" once the turn has wholly ended
        if (ctl && ctl.conn === this) this.threads.stop(sid);
        // a first message still waiting for its card is voided before it can start
        const s = typeof sid === "string" ? this.sessions.get(sid) : null;
        s?.op?.cancel();
        return undefined;
      }
      case "session/set_model": {
        this.session(p.sessionId);
        if (p.modelId !== "weld") throw Object.assign(new Error("The agent and model are chosen in Weld."), { code: -32602 });
        return {};
      }
      case "session/close": {
        if (typeof p.sessionId === "string") this.sessions.delete(p.sessionId);
        return {};
      }
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }
  /** An item, as it changes, told to this client (only while it controls the turn). */
  tellItem(s, it, ctl) {
    if (!it?.id) return;
    const was = s.sent.get(it.id);
    s.seen.add(it.id);
    if (it.kind === "user") return; // the client already has what it sent
    if (it.kind === "ask") {
      // asked of the client only for the turn it started (a turn the agent began by itself is the Mac's to answer)
      if (it.status === "waiting" && !was && ctl?.turn && this.threads.running.get(s.id)?.turn === ctl.turn) {
        s.sent.set(it.id, { len: 0 });
        void this.permission(s, it, ctl.turn);
      } else if (it.status !== "waiting") this.retire((w) => w.askId === it.id); // answered on the Mac, or over
      return;
    }
    if (it.kind === "text" || it.kind === "thinking") {
      const text = String(it.text ?? "");
      if (!was) {
        s.sent.set(it.id, { len: text.length, kind: it.kind });
        if (text) this.update(s.id, { sessionUpdate: it.kind === "text" ? "agent_message_chunk" : "agent_thought_chunk", content: { type: "text", text } });
      } else if (text.length > was.len) {
        this.update(s.id, { sessionUpdate: it.kind === "text" ? "agent_message_chunk" : "agent_thought_chunk", content: { type: "text", text: text.slice(was.len) } });
        was.len = text.length;
      }
      return;
    }
    if (it.kind === "tool") {
      // (Claude names a step before it says what the step is: its title and input are told again as they arrive)
      const title = it.title || it.name || "Step", input = JSON.stringify(it.input ?? {}), kind = it.acpKind ?? kindOf(it.name), locs = JSON.stringify(it.locations ?? []);
      if (!was) {
        s.sent.set(it.id, { status: it.status, out: !!it.output, title, input, kind, locs });
        for (const u of told(it)) this.update(s.id, u);
      } else if (was.status !== it.status || (!was.out && it.output) || was.title !== title || was.input !== input || was.kind !== kind || was.locs !== locs) {
        const u = { sessionUpdate: "tool_call_update", toolCallId: it.id, status: STATUS[it.status] ?? "in_progress" };
        if (was.title !== title) u.title = title;
        if (was.input !== input) u.rawInput = it.input ?? {};
        if (was.kind !== kind) u.kind = kind;
        if (was.locs !== locs) u.locations = it.locations ?? [];
        if (it.output && !was.out) u.content = textContent(clipTo(String(it.output), 16384));
        Object.assign(was, { status: it.status, out: !!it.output, title, input, kind, locs });
        this.update(s.id, u);
      }
      return;
    }
    if (it.kind === "plan") {
      // (a plan is told again whenever its steps change: ACP sends the whole plan each time)
      const now = JSON.stringify(it.entries ?? []);
      if (was?.plan === now) return;
      s.sent.set(it.id, { plan: now });
      for (const u of told(it)) this.update(s.id, u);
      return;
    }
    if (!was) {
      s.sent.set(it.id, {});
      for (const u of told(it)) this.update(s.id, u);
    }
  }
  /** The agent asks to do something: asked of this client (the turn's controller) too; whichever answer comes first counts. */
  async permission(s, it, turn) {
    const r = await this.ask("session/request_permission", {
      sessionId: s.id,
      toolCall: { toolCallId: it.id, title: it.title || it.name || "A step", kind: kindOf(it.name), status: "pending", rawInput: it.input ?? {} },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "decline", name: "Decline", kind: "reject_once" },
      ],
    }, { thread: s.id, askId: it.id, turn });
    // no answer from the client (retired, the client gone, or an error): nothing is decided here, the question stays
    // for the Mac (and a client that went has its turn stopped, which answers it)
    if (r === null) return;
    const allow = r?.outcome?.outcome === "selected" && r.outcome.optionId === "allow";
    // (answered on the Mac already, or the turn has ended: Threads ignores an answer to a question no longer asked)
    this.threads.answer(s.id, it.id, allow);
  }
}

// ── the shim T3 Code runs (bin/weld acp) ────────────────────────────
// Written beside bin/weld at every start, run by Weld's own executable as Node. It only carries bytes between T3 Code
// and the socket; it writes nothing else to stdout (T3 Code ends a session on any line that is not JSON-RPC).
export const SHIM = `"use strict";
const net = require("node:net");
const { spawn } = require("node:child_process");
const [sock, packaged] = process.argv.slice(2);
const say = (s) => process.stderr.write("weld acp: " + s + "\\n");
const connect = () => new Promise((ok, no) => { const c = net.connect(sock); c.once("connect", () => ok(c)); c.once("error", no); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
process.stdout.on("error", () => process.exit(0));
(async () => {
  let c = null;
  try { c = await connect(); } catch {
    if (packaged === "1") {
      say("Weld is not open; opening it");
      try { spawn("open", ["-g", "-b", ${JSON.stringify(APP_ID)}], { stdio: "ignore", detached: true }).unref(); } catch {}
      const until = Date.now() + 20000;
      while (!c && Date.now() < until) { await wait(400); try { c = await connect(); } catch {} }
    }
  }
  if (!c) {
    // nobody to carry to: every request is answered, in words for the person, until T3 Code lets go
    say("Weld is not open on this Mac");
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m && m.id !== undefined && m.method) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: "Weld is not open on this Mac." } }) + "\\n");
      }
    });
    process.stdin.on("end", () => process.exit(1));
    return;
  }
  process.stdin.pipe(c);
  c.pipe(process.stdout);
  process.stdin.on("end", () => c.end());
  c.on("close", () => { say("Weld closed the connection"); process.exit(1); });
  c.on("error", (e) => { say(String(e && e.message || e)); process.exit(1); });
})();
`;
