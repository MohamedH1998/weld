// Codex, kept running: one `codex app-server` serves every thread, so a
// message does not wait for a new process to start, and Codex can ask
// before it does something its sandbox does not allow. What it sends is
// turned into the same events `codex exec --json` gives, so the reader
// that already understands those (see agents.mjs) is used unchanged.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A thread's mode, as Codex's sandbox and approval policy. */
export function codexPolicy(mode, cwd) {
  if (mode === "full") return { sandbox: "danger-full-access", approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } };
  // (anything else is Edits only: full access only when the thread says so)
  return { sandbox: "workspace-write", approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", writableRoots: cwd ? [cwd] : [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } };
}
const shellOf = (cmd) => String(cmd || "").replace(/^\/bin\/(?:zsh|bash|sh) -lc (['"])([\s\S]*)\1$/, "$2");

/** An app-server's item, as `codex exec --json` would have described it. */
function asExecItem(it, text) {
  if (it.type === "agentMessage") return { id: it.id, type: "agent_message", text: text ?? it.text ?? "" };
  if (it.type === "reasoning") return { id: it.id, type: "reasoning", text: text ?? [...(it.summary ?? []), ...(it.content ?? [])].join("\n\n") };
  if (it.type === "commandExecution")
    return { id: it.id, type: "command_execution", command: shellOf(it.command), aggregated_output: it.aggregatedOutput ?? "", exit_code: it.status === "inProgress" ? null : it.status === "completed" ? (it.exitCode ?? 0) : (it.exitCode ?? 1) };
  if (it.type === "fileChange") return { id: it.id, type: "file_change", changes: (it.changes ?? []).map((c) => ({ path: c.path, kind: c.kind?.type ?? c.kind })), status: it.status === "failed" || it.status === "declined" ? "failed" : "completed" };
  if (it.type === "mcpToolCall") return { id: it.id, type: "mcp_tool_call", server: it.server, tool: it.tool, arguments: it.arguments, result: it.result, error: it.error, status: it.status === "failed" ? "failed" : "completed" };
  if (it.type === "webSearch") return { id: it.id, type: "web_search", query: it.query ?? it.action?.query ?? "" };
  return null;
}

export class CodexServer {
  /** @param {{ bin: () => string | null, env: () => Record<string, string>, onAsk: (thread: string, ask: object) => void }} o */
  constructor(o) {
    this.o = o;
    this.proc = null;
    this.ready = null;
    this.n = 0;
    this.waiting = new Map();
    /** Weld thread → { codex thread id, the adapter its turns are read through, the turn under way, text so far by item } */
    this.threads = new Map();
    /** codex thread id → Weld thread */
    this.byCodex = new Map();
  }
  start() {
    if (this.ready) return this.ready;
    const bin = this.o.bin();
    if (!bin) return Promise.reject(new Error("Codex is not installed on this Mac."));
    // in a group of its own, so letting it go takes what it started with it
    const proc = spawn(bin, ["app-server"], { env: this.o.env(), stdio: ["pipe", "pipe", "pipe"], detached: true });
    this.o.groups?.add(proc, bin);
    this.proc = proc;
    let buf = "", err = "";
    proc.stdin.on("error", () => {});
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => {
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
          continue;
        }
        try {
          this.heard(m);
        } catch {
          /* a message of a shape not seen before */
        }
      }
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.on("close", () => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.ready = null;
      for (const [, w] of this.waiting) w.reject(new Error(err.trim().split("\n").pop() || "Codex stopped"));
      this.waiting.clear();
      // every turn under way ends; every thread will be resumed afresh next time
      for (const [, t] of this.threads) {
        this.tidy(t);
        t.lp.onClose?.(1);
      }
      this.threads.clear();
      this.byCodex.clear();
    });
    proc.on("error", () => {});
    this.ready = this.request("initialize", { clientInfo: { name: "weld", title: "Weld", version: "0.1" }, capabilities: { experimentalApi: false, requestAttestation: false } }).then(() => {
      this.notify("initialized");
    });
    this.ready.catch(() => (this.ready = null));
    return this.ready;
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error("Codex is not running"));
      const id = ++this.n;
      this.waiting.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }
  notify(method, params) {
    this.proc?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) })}\n`);
  }
  respond(id, result) {
    this.proc?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }
  heard(m) {
    if (m.id !== undefined && !m.method) {
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message || "Codex refused"));
      else w.resolve(m.result);
      return;
    }
    const p = m.params ?? {};
    const ours = p.threadId ? this.byCodex.get(p.threadId) : null;
    const t = ours ? this.threads.get(ours) : null;
    // asked of the person: allowed or declined in the thread
    // (what belongs to a turn that is over, or to another turn than the one under way, is no one's: questions in it are declined)
    const stale = t && p.turnId && t.turn && p.turnId !== t.turn;
    if (m.id !== undefined && m.method) {
      if (!t || stale || (!/requestApproval$/.test(m.method) && m.method !== "execCommandApproval" && m.method !== "applyPatchApproval")) return this.respond(m.id, { decision: "decline" });
      const file = /fileChange|applyPatch/.test(m.method);
      return this.o.onAsk(ours, {
        lp: t.lp,
        name: file ? "Edit" : "Bash",
        input: file ? { reason: p.reason, root: p.grantRoot } : { command: shellOf(p.command) },
        text: p.reason || "",
        respond: (allow) => this.respond(m.id, { decision: allow ? "accept" : "decline" }),
      });
    }
    if (!t || stale) return;
    const send = (ev) => t.lp.onEvent?.(ev);
    if (m.method === "item/started" || m.method === "item/completed") {
      const it = p.item;
      if (it?.type === "agentMessage" || it?.type === "reasoning") t.text.delete(it.id);
      const x = it && asExecItem(it);
      if (x) send({ type: m.method === "item/started" ? "item.started" : "item.completed", item: x });
    } else if (m.method === "item/agentMessage/delta" || m.method === "item/reasoning/summaryTextDelta" || m.method === "item/reasoning/textDelta") {
      // words as they come (the whole so far: the reader keeps an item as last described)
      const so = (t.text.get(p.itemId) ?? "") + (p.delta ?? "");
      t.text.set(p.itemId, so);
      send({ type: "item.updated", item: asExecItem({ type: m.method.includes("reasoning") ? "reasoning" : "agentMessage", id: p.itemId }, so) });
    } else if (m.method === "turn/started") {
      t.turn = p.turn?.id ?? t.turn;
    } else if (m.method === "turn/completed") {
      if (p.turn?.id && t.turn && p.turn.id !== t.turn) return;
      t.turn = null;
      this.tidy(t);
      const st = p.turn?.status;
      if (st === "failed") send({ type: "turn.failed", error: { message: p.turn?.error?.message || "The turn failed" } });
      else send({ type: "turn.completed" });
    } else if (m.method === "error" && p.willRetry !== true) {
      send({ type: "error", message: p.error?.message || p.message || "Codex reported an error" });
    }
  }
  /** One turn of a Weld thread: its Codex thread started or resumed as needed, then the message sent. `lp` is how the turn is read. */
  async turn(ours, { session, cwd, mode, prompt, promptAfresh, images, imagesAfresh, lp, instructions, onAfresh }) {
    await this.start();
    if (lp.cancelled) return;
    const pol = codexPolicy(mode, cwd);
    let t = this.threads.get(ours);
    if (!t) {
      let r;
      if (session) {
        try {
          r = await this.request("thread/resume", { threadId: session, cwd, sandbox: pol.sandbox, approvalPolicy: pol.approvalPolicy, excludeTurns: true, developerInstructions: instructions });
        } catch {
          // gone from Codex's own records: begun afresh, and handed the whole conversation so far
          r = null;
          prompt = promptAfresh ?? prompt;
          // (and what it is shown of the board, in full: it has seen none of it)
          images = imagesAfresh ?? images;
          onAfresh?.();
        }
      }
      r ??= await this.request("thread/start", { cwd, sandbox: pol.sandbox, approvalPolicy: pol.approvalPolicy, developerInstructions: instructions });
      if (lp.cancelled) return;
      const id = r.thread.id;
      t = { id, lp, turn: null, text: new Map() };
      this.threads.set(ours, t);
      this.byCodex.set(id, ours);
    }
    t.lp = lp;
    t.turn = null;
    t.text.clear();
    lp.onEvent?.({ type: "thread.started", thread_id: t.id });
    const input = [{ type: "text", text: prompt, text_elements: [] }];
    if (images?.length) {
      const dir = mkdtempSync(path.join(os.tmpdir(), "ours-look-"));
      t.tmp = dir;
      images.forEach((b64, i) => {
        const f = path.join(dir, `page-${i + 1}.jpg`);
        writeFileSync(f, Buffer.from(b64, "base64"));
        input.unshift({ type: "localImage", path: f });
      });
    }
    if (lp.cancelled) return this.tidy(t);
    const r = await this.request("turn/start", { threadId: t.id, input, cwd, approvalPolicy: pol.approvalPolicy, sandboxPolicy: pol.sandboxPolicy });
    t.turn = r?.turn?.id ?? t.turn;
    if (lp.cancelled) this.interrupt(ours, lp);
  }
  /** What a turn left behind (pictures of pages) is cleared away. */
  tidy(t) {
    if (!t.tmp) return;
    rmSync(t.tmp, { recursive: true, force: true });
    t.tmp = null;
  }
  /** Stop the turn under way. Not begun yet: it will not be (and false is answered, so the caller ends it here). */
  interrupt(ours, lp) {
    const t = this.threads.get(ours);
    if (lp) lp.cancelled = true;
    if (!t?.turn || (lp && t.lp !== lp)) return false;
    this.request("turn/interrupt", { threadId: t.id, turnId: t.turn }).catch(() => {});
    return true;
  }
  /** Forget a thread (it was copied, or its agent changed hands): it is resumed afresh next time. */
  forget(ours) {
    const t = this.threads.get(ours);
    if (!t) return;
    this.threads.delete(ours);
    this.byCodex.delete(t.id);
    this.request("thread/unsubscribe", { threadId: t.id }).catch(() => {});
  }
  shutdown() {
    const p = this.proc;
    this.proc = null;
    try {
      p?.stdin.end();
      process.kill(-p.pid, "SIGTERM");
    } catch {
      try {
        p?.kill("SIGTERM");
      } catch {
        /* gone */
      }
    }
    for (const [, t] of this.threads) this.tidy(t);
  }
}
