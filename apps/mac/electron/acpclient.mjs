// An ACP agent driving a Weld thread: one process per turn, spoken to in ACP v1 over
// its stdin/stdout, and ended (with everything it started) before the turn is over, so nothing it does can land
// outside its turn. Its updates are handed to Threads as events (see acpReader in agents.mjs);
// its permission requests are answered by Weld's policy (acppolicy.mjs) or put to the person.
import { execFile, spawn } from "node:child_process";
import { decide, answerFor, stepOf } from "./acppolicy.mjs";

const T_INIT = 20000, T_REQ = 30000, T_LOAD = 30000, IDLE_GAP = 1500;
const MAX_LINE = 1 << 20, MAX_GARBAGE = 100, MAX_UNREAD = 8 << 20;
const sessionLost = (e) => e?.code === -32002 || /not\s*found|unknown session|no such session/i.test(String(e?.message ?? ""));
const authNeeded = (e) => e?.code === -32000 && /auth|sign.?in|log.?in|credential/i.test(String(e?.message ?? ""));

export class AcpAgent {
  /** @param {{ id: string, name: string, command: string, args: string[], env: Record<string,string>, cwd: string,
   *   flavor: any, version: string, groups?: any, log?: (s: string) => void, onAsk: (ask: any) => void }} o */
  constructor(o) {
    this.o = o;
    this.proc = null;
    this.n = 0;
    this.waiting = new Map();
    this.ready = null;
    this.dead = false;
    this.err = "";
    this.caps = {};
    this.authMethods = [];
    /** The open session, and what the agent says of it. */
    this.session = null;
    this.told = false;
    this.modes = null;
    this.config = null;
    /** The turn under way: { lp, toolCalls, prompting, settled, cancelled } */
    this.cur = null;
    this.loading = null;
  }
  get alive() {
    return !this.dead && !!this.proc;
  }
  start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const { command, args, env, cwd } = this.o;
      const proc = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
      this.proc = proc;
      this.o.groups?.add(proc, command);
      proc.stdin.on("error", () => {});
      let buf = "", garbage = 0;
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (d) => {
        if (buf.length + d.length > MAX_UNREAD) return this.die(`${this.o.name} sent more than Weld will take at once`);
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let m;
          try {
            m = JSON.parse(line);
          } catch {
            // (some agents print a banner or a log line on stdout: ignored, unless it is all they print)
            if ((garbage += 1) > MAX_GARBAGE) this.die(`${this.o.name} is not speaking ACP (its output is not JSON-RPC)`);
            continue;
          }
          if (!m || typeof m !== "object" || Array.isArray(m) || m.jsonrpc !== "2.0") {
            if ((garbage += 1) > MAX_GARBAGE) this.die(`${this.o.name} is not speaking ACP (its messages are not JSON-RPC)`);
            continue;
          }
          garbage = 0;
          try {
            this.take(m);
          } catch (e) {
            this.die(`${this.o.name} sent a message Weld could not handle (${String(e?.message || e).slice(0, 200)})`);
          }
        }
        if (buf.length > MAX_LINE) this.die(`${this.o.name} sent a line over 1 MB`);
      });
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (d) => {
        this.err = (this.err + d).slice(-4000);
      });
      proc.on("error", (e) => this.die(e.code === "ENOENT" ? `${this.o.name} is not installed (could not run ${command})` : String(e.message || e)));
      this.exited = new Promise((r) => proc.once("exit", r));
      // (what it starts is noted as it goes, so it can all be ended when the turn is over, even what outlives its parent)
      this.scanning = setInterval(() => void this.scan(), 2000);
      this.scanning.unref?.();
      void this.scan();
      proc.on("exit", (code, sig) => this.die(`${this.o.name} stopped (${sig || `exit code ${code}`})${this.err ? `: ${clean(this.err)}` : ""}`));
      const init = await this.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "weld", title: "Weld", version: this.o.version },
        ...(this.o.flavor?.initMeta ? { _meta: this.o.flavor.initMeta } : {}),
      }, T_INIT);
      if (init?.protocolVersion !== 1) throw new Error(`${this.o.name} needs ACP version ${init?.protocolVersion}, and Weld speaks version 1`);
      this.caps = init.agentCapabilities ?? {};
      this.authMethods = Array.isArray(init.authMethods) ? init.authMethods : [];
      if (this.o.flavor?.eagerAuth) await this.authenticate();
    })();
    this.ready.catch(() => {});
    return this.ready;
  }
  /** Sign in by the method the flavor names (or the agent's first), once. Interactive methods are not done here. */
  async authenticate() {
    const want = this.o.flavor?.authMethod?.(this.authMethods, this.o.env);
    const m = this.authMethods.find((x) => x.id === want) ?? this.authMethods[0];
    if (!m) throw new Error(this.signInHint());
    await this.request("authenticate", { methodId: m.id }, T_REQ);
  }
  signInHint() {
    const how = this.o.flavor?.signIn;
    return how ? `Sign in to ${this.o.name} in your terminal: ${how}` : `${this.o.name} needs you to sign in (in its own app or terminal).`;
  }
  request(method, params, ms = T_REQ) {
    if (this.dead) return Promise.reject(new Error(this.deathWords ?? `${this.o.name} has stopped`));
    const id = (this.n += 1);
    return new Promise((ok, no) => {
      const t = setTimeout(() => (this.waiting.delete(id), no(new Error(`${this.o.name} did not answer ${method} in time`))), ms);
      this.waiting.set(id, { method, ok: (r) => (clearTimeout(t), ok(r)), no: (e) => (clearTimeout(t), no(e)) });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  send(m) {
    try {
      if (this.proc?.stdin.writable) this.proc.stdin.write(`${JSON.stringify(m)}\n`);
    } catch {
      /* gone */
    }
  }
  die(words) {
    if (this.dead) return;
    this.dead = true;
    this.deathWords = words;
    for (const w of this.waiting.values()) w.no(new Error(words));
    this.waiting.clear();
    const c = this.cur;
    if (c && !c.ending) void this.end(c, c.cancelled ? { type: "turn.completed", stopReason: "cancelled" } : { type: "turn.failed", error: { message: words } });
  }
  /** Every process now running: pid → { ppid, pgid, start }. */
  table() {
    return new Promise((ok) =>
      execFile("ps", ["-A", "-o", "pid=,ppid=,pgid=,lstart="], { maxBuffer: 8 << 20 }, (err, out) => {
        // (a look that failed is not an empty one: null, so nothing is taken for gone that was not seen gone)
        if (err) return ok(null);
        const t = new Map();
        for (const line of String(out).split("\n")) {
          const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
          if (m) t.set(Number(m[1]), { ppid: Number(m[2]), pgid: Number(m[3]), start: m[4].trim() });
        }
        ok(t.size ? t : null);
      }),
    );
  }
  /** Note what the agent has started: its group, and every descendant in whatever group (some agents start their tools
   *  in groups of their own). Kept with each one's start time, so a number reused later is never mistaken for it. */
  async scan(given) {
    const pid = this.proc?.pid;
    if (!pid) return;
    const t = given ?? (await this.table());
    if (!t) return;
    this.owned ??= new Map();
    const roots = [pid, ...this.owned.keys()];
    const kids = new Map();
    for (const [p, x] of t) (kids.get(x.ppid) ?? kids.set(x.ppid, []).get(x.ppid)).push(p);
    const stack = roots.filter((p) => t.has(p) && (p === pid || t.get(p).start === this.owned.get(p)));
    for (const [p, x] of t) if (x.pgid === pid) stack.push(p);
    while (stack.length) {
      const p = stack.pop();
      if (!t.has(p) || (this.owned.has(p) && this.owned.get(p) !== t.get(p).start)) continue;
      if (!this.owned.has(p)) this.owned.set(p, t.get(p).start);
      for (const k of kids.get(p) ?? []) if (!this.owned.has(k)) stack.push(k);
    }
  }
  /** End the agent and everything it started (its group and every noted descendant), and make sure they are gone:
   *  TERM, then KILL after 2 s, then checked, and checked again for as long as anything it started is still there:
   *  the turn does not end (so the thread is not free) until nothing is left. `onStuck` is told once if that takes long. */
  async stop(onStuck) {
    clearInterval(this.scanning);
    const proc = this.proc;
    if (!proc?.pid) return;
    await this.scan();
    // (null when the look itself failed: that is never taken for "nothing left"; each look also takes in anything
    // started meanwhile, so what a dying process starts is ended too)
    const alive = async () => {
      const t = await this.table();
      if (!t) return null;
      await this.scan(t);
      return [...(this.owned ?? new Map())].filter(([p, start]) => t.get(p)?.start === start).map(([p]) => p).concat([...t].filter(([, x]) => x.pgid === proc.pid).map(([p]) => p));
    };
    const signal = (pids, sig) => {
      try {
        process.kill(-proc.pid, sig);
      } catch {
        /* the group is gone */
      }
      for (const p of pids)
        try {
          process.kill(p, sig);
        } catch {
          /* gone */
        }
    };
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    let left = await alive();
    if (left && !left.length && (proc.exitCode !== null || proc.signalCode !== null)) return;
    signal(left ?? [], "SIGTERM");
    // (2 s by the clock for it all to go by itself; each look also takes in anything started meanwhile, which is told too)
    const grace = Date.now() + 2000;
    while (Date.now() < grace) {
      await pause(100);
      if ((left = await alive()) && !left.length) return;
      signal(left ?? [], "SIGTERM");
    }
    // what has not gone is made to go, and looked for again until it has (the thread waits; nobody else's work is touched)
    let told = false;
    for (let i = 0; ; i++) {
      signal(left ?? [], "SIGKILL");
      await pause(i < 10 ? 100 : 2000);
      if ((left = await alive()) && !left.length) return;
      if (!told && i >= 10) {
        told = true;
        onStuck?.(left ? `Weld is still ending what ${this.o.name} started (${left.join(", ")}); this thread waits until it has.` : `Weld can't yet see whether what ${this.o.name} started has ended; this thread waits until it can.`);
      }
    }
  }
  /** Let it go: resolves once it and everything it started have ended (Weld waits for this before it quits). */
  shutdown() {
    this.die(`${this.o.name} was let go`);
    return this.ended ?? Promise.resolve();
  }
  /** A message from the agent: an answer, a request of Weld, or an update. */
  take(m) {
    if (m.method === undefined && m.id !== undefined) {
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      // (the prompt's answer ends the turn's say at once: a request read right after it is not granted)
      if (w.method === "session/prompt" && this.cur) this.cur.answered = true;
      if (m.error) w.no(Object.assign(new Error(String(m.error.message ?? "error")), { code: m.error.code, data: m.error.data }));
      else w.ok(m.result);
      return;
    }
    if (m.method === "session/update") return this.onUpdate(m.params ?? {});
    if (m.method === "session/request_permission" && m.id !== undefined) return void this.onPermission(m.id, m.params ?? {});
    // nothing else is served (Weld advertises no files and no terminals)
    if (m.id !== undefined) this.send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Weld does not serve ${m.method}` } });
  }
  onUpdate(p) {
    const u = p.update ?? {};
    const k = u.sessionUpdate;
    if (k === "current_mode_update") this.modes = { ...(this.modes ?? {}), currentModeId: u.currentModeId };
    if (k === "config_option_update") this.config = u.configOptions ?? this.config;
    if (this.loading) {
      // (a load replays the conversation: Weld has its own record of it; only how long it goes on matters)
      if (!this.loading.paused) this.loading.last = Date.now();
      return;
    }
    const c = this.cur;
    if (!c || p.sessionId !== this.session) return;
    if (k === "tool_call") c.toolCalls.set(u.toolCallId, { ...(c.toolCalls.get(u.toolCallId) ?? {}), ...u });
    if (k === "tool_call_update") c.toolCalls.set(u.toolCallId, { ...(c.toolCalls.get(u.toolCallId) ?? {}), ...stripNulls(u) });
    if (c.answered) {
      // after the prompt has answered (the process is being ended): only its own steps' last words are kept
      if (k === "tool_call_update" && c.toolCalls.has(u.toolCallId) && !c.settled) c.lp.onEvent?.({ type: "acp.update", update: u });
      return;
    }
    c.lp.onEvent?.({ type: "acp.update", update: u });
  }
  async onPermission(rid, p) {
    const c = this.cur;
    const request = p;
    // (only while the turn is under way: after its prompt has answered, nothing more is allowed)
    if (!c || c.answered || c.ending || p.sessionId !== this.session) return this.send({ jsonrpc: "2.0", id: rid, result: answerFor(request, false) });
    const d = decide({ request, known: c.toolCalls, mode: c.mode, cwd: this.o.cwd });
    if (d.do === "allow") return this.send({ jsonrpc: "2.0", id: rid, result: { outcome: { outcome: "selected", optionId: d.optionId } } });
    if (d.do === "deny") {
      if (d.why) c.lp.onEvent?.({ type: "acp.note", text: `Declined: ${stepOf(request, c.toolCalls).title ?? "a step"} (${d.why})` });
      return this.send({ jsonrpc: "2.0", id: rid, result: d.optionId ? { outcome: { outcome: "selected", optionId: d.optionId } } : { outcome: { outcome: "cancelled" } } });
    }
    // asked of the person, on the card (and of T3 Code, through its host, as for any agent)
    const step = stepOf(request, c.toolCalls);
    this.o.onAsk({
      lp: c.lp,
      name: step.title || step.kind || "a step",
      kind: step.kind,
      input: step.rawInput ?? {},
      text: "",
      respond: (allow) => this.send({ jsonrpc: "2.0", id: rid, result: answerFor(request, !!allow) }),
    });
  }
  /** Open (or reopen) the thread's session; answers whether the conversation must be handed over afresh. */
  async open(session, cwd) {
    const pref = this.o.flavor?.reopen ?? (this.caps.loadSession ? "load" : this.caps.sessionCapabilities?.resume ? "resume" : null);
    if (session && pref) {
      try {
        if (pref === "load") await this.load(session, cwd);
        else {
          const r = await this.withAuth(() => this.request("session/resume", { sessionId: session, cwd, mcpServers: [] }));
          this.setup(r);
        }
        this.session = session;
        return { fresh: false };
      } catch (e) {
        if (!sessionLost(e)) throw e;
      }
    }
    const r = await this.withAuth(() => this.request("session/new", { cwd, mcpServers: [] }));
    if (!r?.sessionId) throw new Error(`${this.o.name} did not open a session`);
    this.setup(r);
    this.session = r.sessionId;
    this.told = false;
    return { fresh: !!session };
  }
  async load(session, cwd) {
    const st = { done: false };
    this.loading = { last: 0 };
    try {
      const answered = this.withAuth(
        () => this.request("session/load", { sessionId: session, cwd, mcpServers: [] }, T_LOAD),
        () => st.done,
        // (signing in is not replaying: the quiet it makes does not count, and the replay is waited for afresh)
        (on) => {
          if (this.loading) this.loading = { last: 0, paused: on };
        },
      );
      if (this.o.flavor?.replayIdle) {
        // (some agents finish replaying and never answer the load: done once a replay has begun and then gone quiet)
        const idle = new Promise((ok) => {
          const tick = setInterval(() => {
            const last = this.loading?.last ?? 0;
            if (last && !this.loading?.paused && Date.now() - last > IDLE_GAP) (clearInterval(tick), ok(null));
          }, 200);
          answered.finally(() => clearInterval(tick)).catch(() => {});
        });
        this.setup(await Promise.race([answered, idle]));
        answered.catch(() => {});
      } else this.setup(await answered);
    } finally {
      st.done = true;
      this.loading = null;
    }
  }
  setup(r) {
    if (r?.modes) this.modes = r.modes;
    if (r?.configOptions) this.config = r.configOptions;
  }
  async withAuth(fn, over = () => false, signing = () => {}) {
    try {
      return await fn();
    } catch (e) {
      // (a setup step already decided another way takes no further steps)
      if (over()) throw e;
      if (!authNeeded(e) || !this.authMethods.length) throw authNeeded(e) ? new Error(this.signInHint()) : e;
      signing(true);
      try {
        await this.authenticate();
      } catch {
        throw new Error(this.signInHint());
      } finally {
        signing(false);
      }
      if (over()) throw e;
      return await fn();
    }
  }
  /** One turn. Ends, exactly once, with turn.completed or turn.failed on lp.onEvent. */
  async turn(lp, { session, cwd, mode, prompt, promptAfresh, images, imagesAfresh, instructions, onAfresh }) {
    const c = { lp, mode, toolCalls: new Map(), settled: false, answered: false, cancelled: false, dispatched: false };
    this.cur = c;
    lp.interrupt = () => this.interrupt(c);
    try {
      await this.start();
      if (c.cancelled) return this.end(c, { type: "turn.completed", stopReason: "cancelled" });
      const { fresh } = await this.open(session, cwd);
      // (a conversation started afresh is shown the board in full: nothing of it is taken as seen)
      if (fresh) {
        images = imagesAfresh ?? images;
        onAfresh?.();
      }
      lp.onEvent?.({ type: "thread.started", thread_id: this.session });
      await this.o.flavor?.configure?.(this, mode);
      if (c.cancelled) return this.end(c, { type: "turn.completed", stopReason: "cancelled" });
      const blocks = [];
      if (!this.told && instructions) blocks.push({ type: "text", text: `<weld>\n${instructions}\n</weld>` });
      this.told = true;
      if (images?.length) {
        if (this.caps.promptCapabilities?.image) for (const data of images) blocks.push({ type: "image", mimeType: "image/jpeg", data });
        else lp.onEvent?.({ type: "acp.note", text: `Pictures of the board were not sent (${this.o.name} does not take them)` });
      }
      blocks.push({ type: "text", text: fresh && promptAfresh ? promptAfresh : prompt });
      c.dispatched = true;
      const r = await this.request("session/prompt", { sessionId: this.session, prompt: blocks }, 24 * 3600 * 1000);
      c.answered = true;
      const why = r?.stopReason;
      if (why === "max_tokens" || why === "max_turn_requests" || why === "refusal") lp.onEvent?.({ type: "acp.note", text: `${this.o.name} stopped: ${why.replace(/_/g, " ")}` });
      this.end(c, { type: "turn.completed", stopReason: why });
    } catch (e) {
      c.answered = true;
      if (c.cancelled && !this.dead) return this.end(c, { type: "turn.completed", stopReason: "cancelled" });
      this.end(c, { type: "turn.failed", error: { message: String(e?.message || e) } });
    }
  }
  /** The turn's end, told once, after the agent's process (and all it started) has exited. */
  end(c, ev) {
    if (c.ending) return this.ended;
    c.ending = true;
    this.ended = this.finishing(c, ev);
    return this.ended;
  }
  async finishing(c, ev) {
    c.answered = true;
    // an agent whose own way of stopping its background work is cancel (Antigravity, Grok) is asked that first, on every end
    if (this.o.flavor?.cancelOnEnd && c.dispatched && !this.dead) {
      this.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: this.session, ...(this.o.flavor.cancelMeta ? { _meta: this.o.flavor.cancelMeta } : {}) } });
      await new Promise((r) => setTimeout(r, 500));
    }
    await this.stop((words) => c.lp.onEvent?.({ type: "acp.note", text: words }));
    c.settled = true;
    c.lp.onEvent?.(ev);
  }
  /** Stop the turn. Before the prompt is written: it never will be. After: cancel is asked, and the process is ended
   *  if the prompt has not answered within 6 s. Answers whether the turn was under way (the caller waits for its end). */
  interrupt(c = this.cur) {
    if (!c || c.ending) return false;
    c.cancelled = true;
    if (!c.dispatched) return false;
    this.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: this.session, ...(this.o.flavor?.cancelMeta ? { _meta: this.o.flavor.cancelMeta } : {}) } });
    setTimeout(() => {
      if (!c.ending) this.die(`${this.o.name} did not stop when asked; ended`);
    }, 6000).unref?.();
    return true;
  }
}

function stripNulls(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
}
function clean(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(-6).join("\n").slice(0, 600);
}
