// What Weld answers when an ACP agent asks permission.
// Pure: the request, what is known of the step, the thread's mode and folder in; a decision out.
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const SAFE = new Set(["read", "search", "fetch", "think"]);
const WRITE = new Set(["edit", "delete", "move"]);

/** A path's real place, for one that may not exist yet: its nearest existing ancestor's real path, plus the rest. */
function realish(p) {
  let cur = p;
  const rest = [];
  for (let i = 0; i < 64; i++) {
    if (existsSync(cur)) {
      try {
        return path.join(realpathSync(cur), ...rest.reverse());
      } catch {
        return null;
      }
    }
    const up = path.dirname(cur);
    if (up === cur) return null;
    rest.push(path.basename(cur));
    cur = up;
  }
  return null;
}

/** Every path the step touches, absolute; null if any is missing or unusable. */
function pathsOf(step, cwd) {
  const out = [];
  const add = (p) => {
    if (typeof p !== "string" || !p.trim()) return false;
    out.push(path.isAbsolute(p) ? p : path.join(cwd, p));
    return true;
  };
  const locs = Array.isArray(step.locations) ? step.locations : [];
  for (const l of locs) if (!add(l?.path)) return null;
  // (a move names both ends: both must be inside)
  const raw = step.rawInput && typeof step.rawInput === "object" ? step.rawInput : {};
  for (const k of ["path", "file_path", "filePath", "source", "destination", "from", "to", "oldPath", "newPath"]) if (typeof raw[k] === "string" && !add(raw[k])) return null;
  return out.length ? out : null;
}

/** Whether every path the step touches is inside the folder, by real path. */
export function inside(step, cwd) {
  const root = realish(cwd);
  const all = pathsOf(step, cwd);
  if (!root || !all) return false;
  return all.every((p) => {
    const r = realish(path.resolve(p));
    return !!r && (r === root || r.startsWith(root + path.sep));
  });
}

/** The step's kind: from the request, else from the tool call of the same id seen earlier. */
export function stepOf(request, known) {
  const tc = request?.toolCall ?? {};
  const before = (tc.toolCallId && known?.get(tc.toolCallId)) || {};
  return { ...before, ...Object.fromEntries(Object.entries(tc).filter(([, v]) => v !== undefined && v !== null)), kind: tc.kind ?? before.kind };
}

/**
 * The decision: { do: "allow" | "deny" | "ask", optionId?, outcome?, why }.
 * `options` are the agent's; a remembered rule (allow_always / reject_always) is never chosen here.
 */
export function decide({ request, known, mode, cwd }) {
  const step = stepOf(request, known);
  const kind = typeof step.kind === "string" ? step.kind : "other";
  const opts = Array.isArray(request?.options) ? request.options : [];
  const once = (k) => opts.find((o) => o?.kind === k)?.optionId;
  const allow = () => {
    const id = once("allow_once");
    return id ? { do: "allow", optionId: id } : { do: "deny", ...deny(), why: "the agent offered no way to allow this once" };
  };
  const deny = () => {
    const id = once("reject_once");
    return id ? { optionId: id } : { outcome: "cancelled" };
  };
  const cls = SAFE.has(kind) ? "safe" : WRITE.has(kind) ? "write" : "unknown";
  if (mode !== "full") {
    if (cls === "safe") return allow();
    if (cls === "write" && inside(step, cwd)) return allow();
    // asked of the person; whether Allow is possible at all is known now
    return once("allow_once") ? { do: "ask" } : { do: "deny", ...deny(), why: "the agent offered no way to allow this once" };
  }
  return allow();
}

/** The answer to send, for a decision (or the person's answer to an ask). */
export function answerFor(request, allowIt) {
  const opts = Array.isArray(request?.options) ? request.options : [];
  const id = opts.find((o) => o?.kind === (allowIt ? "allow_once" : "reject_once"))?.optionId;
  if (id) return { outcome: { outcome: "selected", optionId: id } };
  return { outcome: { outcome: "cancelled" } };
}
