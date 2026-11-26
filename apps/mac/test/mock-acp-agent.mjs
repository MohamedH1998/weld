#!/usr/bin/env node
// A scripted ACP agent (v1) for testing Weld's ACP client. What it does is chosen by words in the prompt:
//   say:<words>      stream those words as the answer (in a few chunks)
//   think            stream some thinking first
//   tool             run a pretend tool: in_progress, then completed with output
//   ask:<kind>       ask permission for a step of that ACP kind (edit, execute, read…) with allow_once/reject_once,
//                    then say "allowed" or "declined"; with ask-always:<kind> only allow_always/reject_always are offered
//   write:<path>     ask (kind edit) and, if allowed, really write the file
//   plan             send a plan update
//   garbage          print lines that are not JSON
//   die              exit in the middle of the turn
//   hang             never answer the prompt (until cancelled; then answer cancelled)
//   deaf             ignore cancel entirely (never answer)
//   after            send more words after the prompt has been answered
//   env              say the WELD_FROM and PATH it was given
// It records every message it gets in $MOCK_ACP_LOG if set.
import { appendFileSync, writeFileSync } from "node:fs";
import { spawn as spawnChild } from "node:child_process";

const LOG = process.env.MOCK_ACP_LOG;
const log = (dir, m) => LOG && appendFileSync(LOG, `${dir} ${JSON.stringify(m)}\n`);
const out = (m) => (log("out", m), process.stdout.write(`${JSON.stringify(m)}\n`));
const update = (sessionId, u) => out({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const pending = new Map();
const ask = (method, params) => new Promise((r) => { const id = `a${(seq += 1)}`; pending.set(id, r); out({ jsonrpc: "2.0", id, method, params }); });
const sessions = new Map();
let cancelled = new Set();
let authed = false;
let n = 0;

async function prompt(id, p) {
  const sid = p.sessionId;
  // (only the message itself: the last text block; Weld puts its canvas note in an earlier one)
  const whole = (p.prompt ?? []).filter((b) => b.type === "text").map((b) => b.text).at(-1) ?? "";
  // (only the newest words: Weld puts what the agent missed, and the board, before them)
  const text = whole.trim().split(/\n\s*\n/).at(-1) ?? "";
  const s = sessions.get(sid);
  if (s) s.prompts.push(text);
  const has = (w) => text.includes(w);
  const grab = (w) => (text.match(new RegExp(`(?:^|\\s)${w}:(\\S+)`)) || [])[1];
  if (has("garbage")) for (let i = 0; i < 3; i++) process.stdout.write(`this is not json ${i}\n`);
  if (has("think")) for (const t of ["Let me ", "think about ", "this."]) (update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: t } }), await wait(20));
  if (has("plan")) update(sid, { sessionUpdate: "plan", entries: [{ content: "Look", priority: "high", status: "completed" }, { content: "Change", priority: "medium", status: "pending" }] });
  if (has("tool")) {
    const tc = `t${(n += 1)}`;
    update(sid, { sessionUpdate: "tool_call", toolCallId: tc, title: "Reading README.md", kind: "read", status: "pending", rawInput: { path: "README.md" } });
    await wait(50);
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: tc, status: "in_progress" });
    await wait(50);
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: tc, status: "completed", content: [{ type: "content", content: { type: "text", text: "README contents" } }] });
  }
  const kind = grab("ask") ?? grab("ask-always");
  if (kind) {
    const always = !!grab("ask-always");
    const tc = `p${(n += 1)}`;
    update(sid, { sessionUpdate: "tool_call", toolCallId: tc, title: `A ${kind} step`, kind, status: "pending", rawInput: { what: kind } });
    const r = await ask("session/request_permission", { sessionId: sid, toolCall: { toolCallId: tc, title: `A ${kind} step`, kind, status: "pending", rawInput: { what: kind } }, options: always ? [{ optionId: "aa", name: "Always allow", kind: "allow_always" }, { optionId: "ra", name: "Always reject", kind: "reject_always" }] : [{ optionId: "ok", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] });
    const sel = r?.outcome?.outcome === "selected" ? r.outcome.optionId : "cancelled";
    const allowed = sel === "ok" || sel === "aa";
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: tc, status: allowed ? "completed" : "failed" });
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `${allowed ? "allowed" : "declined"}(${sel}) ` } });
  }
  const path = grab("write");
  if (path) {
    const tc = `w${(n += 1)}`;
    update(sid, { sessionUpdate: "tool_call", toolCallId: tc, title: `Write ${path}`, kind: "edit", status: "pending", rawInput: { path }, locations: [{ path }] });
    const r = await ask("session/request_permission", { sessionId: sid, toolCall: { toolCallId: tc, title: `Write ${path}`, kind: "edit", status: "pending", rawInput: { path }, locations: [{ path }] }, options: [{ optionId: "ok", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] });
    const ok = r?.outcome?.outcome === "selected" && r.outcome.optionId === "ok";
    if (ok) writeFileSync(path, "written by the mock agent\n");
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: tc, status: ok ? "completed" : "failed" });
  }
  if (has("env")) update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `from=${process.env.WELD_FROM ?? "-"} weld=${(process.env.PATH ?? "").includes("/bin") ? "path-ok" : "no"} ` } });
  if (has("die")) {
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "about to die " } });
    process.stderr.write("mock agent: dying on purpose\n");
    await wait(50);
    process.exit(3);
  }
  if (has("hang") || has("deaf")) {
    for (let i = 0; i < 600; i++) {
      await wait(100);
      if (cancelled.has(sid) && !has("deaf")) {
        cancelled.delete(sid);
        return out({ jsonrpc: "2.0", id, result: { stopReason: "cancelled" } });
      }
    }
  }
  const slow = grab("slow");
  if (slow) for (let i = 0; i < Number(slow) * 10; i++) { await wait(100); if (i % 50 === 0) update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "." } }); }
  const words = grab("say") ?? "ok";
  // (underscores are spaces, and a written \n a line break: one word on the command line can say anything)
  for (const chunk of words.replace(/_/g, " ").replace(/\\n/g, "\n").match(/[\s\S]{1,4}/g) ?? []) (update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } }), await wait(10));
  out({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
  // a child that ignores TERM (same group), and one in a detached group of its own: both try to write 3 s later
  const stubborn = grab("stubborn"), loose = grab("detached");
  const writer = (file) => `process.on("SIGTERM", () => {}); setTimeout(() => require("fs").writeFileSync(${JSON.stringify(file)}, "late"), 3000);`;
  if (stubborn) spawnChild(process.execPath, ["-e", writer(stubborn)], { stdio: "ignore" });
  if (loose) spawnChild(process.execPath, ["-e", writer(loose)], { stdio: "ignore", detached: true }).unref();
  const late = grab("afterwrite");
  if (late) setTimeout(() => writeFileSync(late, "written after the turn\n"), 800);
  if (has("after")) {
    await wait(300);
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "said-after-the-turn" } });
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    log("in", m);
    if (m.method === undefined) { pending.get(m.id)?.(m.result); pending.delete(m.id); continue; }
    const p = m.params ?? {};
    switch (m.method) {
      case "initialize":
        out({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { image: true } }, authMethods: process.env.MOCK_LOAD_AUTH ? [{ id: "cached", name: "Cached" }] : [] } });
        break;
      case "session/new": {
        const sid = `mock-${Date.now().toString(36)}-${(n += 1)}`;
        sessions.set(sid, { prompts: [], mode: "default" });
        out({ jsonrpc: "2.0", id: m.id, result: { sessionId: sid, modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }, { id: "plan", name: "Plan" }] } } });
        break;
      }
      case "authenticate":
        setTimeout(() => ((authed = true), out({ jsonrpc: "2.0", id: m.id, result: {} })), 1000);
        break;
      case "session/load":
        // MOCK_LOAD_AUTH: the first load needs sign-in; MOCK_LOAD_SILENT: replay, then never answer (like Grok)
        if (process.env.MOCK_LOAD_AUTH && !authed) { out({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: "Authentication required" } }); break; }
        if (process.env.MOCK_LOAD_SILENT) { sessions.set(p.sessionId, sessions.get(p.sessionId) ?? { prompts: [], mode: "default" }); setTimeout(() => update(p.sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "REPLAY" } }), 200); break; }
        if (!sessions.has(p.sessionId)) out({ jsonrpc: "2.0", id: m.id, error: { code: -32002, message: "unknown session" } });
        else {
          update(p.sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "REPLAYED-HISTORY" } });
          out({ jsonrpc: "2.0", id: m.id, result: { modes: { currentModeId: sessions.get(p.sessionId).mode, availableModes: [{ id: "default", name: "Default" }, { id: "plan", name: "Plan" }] } } });
        }
        break;
      case "session/set_mode":
        if (sessions.has(p.sessionId)) sessions.get(p.sessionId).mode = p.modeId;
        out({ jsonrpc: "2.0", id: m.id, result: {} });
        break;
      case "session/prompt":
        void prompt(m.id, p);
        break;
      case "session/cancel":
        cancelled.add(p.sessionId);
        break;
      default:
        if (m.id !== undefined) out({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
    }
  }
});
