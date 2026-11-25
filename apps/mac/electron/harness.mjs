// Which agents a thread can run on: Claude and Codex natively, the ACP agents T3 Code
// runs (each a "flavor": how it is launched and what differs), and any ACP agent the person adds as a command.
import { accessSync, constants, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/** ACP agents, as T3 Code runs them. Experimental until qualified: Full access only. */
export const FLAVORS = {
  grok: {
    name: "Grok",
    bins: ["grok"],
    // (Full access only for now: launched with --always-approve every time, rather than relying on a setting it saved)
    args: () => ["agent", "--always-approve", "stdio"],
    initMeta: { clientType: "extension" },
    cancelMeta: { cancelTrigger: "ctrl_c" },
    cancelOnEnd: true,
    replayIdle: true,
    authMethod: (_methods, env) => (env.XAI_API_KEY ? "xai.api_key" : "cached_token"),
    signIn: "grok login",
  },
  kiro: { name: "Kiro", bins: ["kiro-cli"], args: () => ["acp", "--agent-engine=v3", "--auth-method=cli"], signIn: "kiro-cli login" },
  fx: { name: "fx", bins: ["fx"], args: () => ["acp"], signIn: "fx login" },
  antigravity: { name: "Antigravity", bins: ["agy", "antigravity"], args: () => ["acp"], reopen: "resume", eagerAuth: true, authMethod: () => "oauth-personal", signIn: "agy acp --login", cancelOnEnd: true },
  opencode: { name: "OpenCode", bins: ["opencode"], args: () => ["acp"], signIn: "opencode auth login" },
  cursor: { name: "Cursor", bins: ["cursor-agent"], args: () => ["acp"], signIn: "cursor-agent login" },
  pi: { name: "Pi", bins: ["pi-acp"], args: () => [], signIn: "pi (then /login)" },
};
/** Flavors qualified against the real agent, with the modes Weld enforces for each. */
const QUALIFIED = {};

const isExe = (p) => {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** A command the person added: checked, never run, to be listed. */
export function checkCommand(c) {
  if (!c || typeof c !== "object") return "not a command";
  if (typeof c.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(c.id)) return "its id is not usable";
  if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 60) return "it needs a name";
  if (typeof c.command !== "string" || !c.command.trim()) return "it needs a command";
  if (c.args !== undefined && (!Array.isArray(c.args) || c.args.some((a) => typeof a !== "string"))) return "its arguments are not a list of words";
  if (c.env !== undefined && (typeof c.env !== "object" || Array.isArray(c.env) || Object.entries(c.env).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== "string"))) return "its environment is not NAME=value lines";
  return null;
}

/**
 * The catalog: every agent with whether it can run, what modes it may use, and how it is launched.
 * @param {{ which: (bin: string) => string | null, commands: () => any[], shellEnv: () => Record<string,string> }} o
 */
export function makeCatalog(o) {
  // (an executable regular file: an absolute path, or a bare name found on PATH; never a relative path)
  const resolve = (cmd) => {
    if (typeof cmd !== "string" || !cmd) return null;
    if (path.isAbsolute(cmd)) return isExe(cmd) ? cmd : null;
    if (cmd.includes("/")) return null;
    for (const dir of String(o.shellEnv().PATH ?? "").split(":")) {
      if (!dir) continue;
      const p = path.join(dir, cmd);
      if (isExe(p)) return p;
    }
    return null;
  };
  // What the agent inherits decides whose account and which session store it uses (HOME, an API key): it is part of a
  // session's identity, through a salted hash. Values that change on their own, and Weld's own per-turn ones, are left out.
  const VOLATILE = /^(WELD_?|PWD$|OLDPWD$|SHLVL$|_$|TERM_SESSION_ID$|SECURITYSESSIONID$|SSH_AUTH_SOCK$|Apple_PubSub_Socket_Render$|__CF_USER_TEXT_ENCODING$|XPC_|COLORTERM$|TERM_PROGRAM)/;
  const inherited = () => {
    const env = o.shellEnv();
    return Object.keys(env).filter((k) => !VOLATILE.test(k)).sort().map((k) => [k, env[k]]);
  };
  const list = () => {
    const out = [
      { id: "claude", name: "Claude", kind: "native", installed: !!process.env.WELD_DEMO_AGENT || !!o.which("claude"), modes: ["full", "edits"] },
      { id: "codex", name: "Codex", kind: "native", installed: !!process.env.WELD_DEMO_AGENT || !!o.which("codex"), modes: ["full", "edits"] },
    ];
    for (const [fid, f] of Object.entries(FLAVORS)) {
      const bin = f.bins.map((b) => resolve(b)).find(Boolean) ?? null;
      const q = QUALIFIED[fid];
      out.push({ id: `acp:${fid}`, name: f.name, kind: "flavor", installed: !!bin, experimental: !q, modes: q?.modes ?? ["full"], signIn: f.signIn });
    }
    for (const c of o.commands()) {
      if (checkCommand(c)) continue;
      out.push({ id: `cmd:${c.id}`, name: c.name, kind: "command", installed: !!resolve(c.command), modes: ["full"] });
    }
    return out;
  };
  /** How to run an ACP agent for a thread: null for the native ones, or when it is not known / not installed. */
  const spec = (agent, mode) => {
    if (typeof agent !== "string") return null;
    // a stand-in (WELD_DEMO_AGENT, a scripted ACP agent): Claude and Codex give the same turn every time, for recordings
    const demo = process.env.WELD_DEMO_AGENT;
    if (demo && (agent === "claude" || agent === "codex")) return { id: agent, name: agent === "codex" ? "Codex" : "Claude", command: process.execPath, args: [demo], env: { ELECTRON_RUN_AS_NODE: "1", WELD_DEMO_AS: agent }, flavor: null, modes: ["full", "edits"], key: hash(["demo", agent]) };
    if (agent.startsWith("acp:")) {
      const fid = agent.slice(4), f = FLAVORS[fid];
      if (!f) return { missing: `${agent} is not an agent Weld knows` };
      const bin = f.bins.map((b) => resolve(b)).find(Boolean);
      if (!bin) return { missing: `${f.name} is not installed on this Mac (looked for ${f.bins.join(" or ")} on your PATH)` };
      const args = f.args(mode);
      return { id: agent, name: f.name, command: bin, args, env: {}, flavor: f, modes: QUALIFIED[fid]?.modes ?? ["full"], key: hash([agent, bin, args, hash([o.salt?.() ?? "", inherited()])]) };
    }
    if (agent.startsWith("cmd:")) {
      const c = o.commands().find((x) => `cmd:${x.id}` === agent);
      if (!c) return { missing: "This thread's agent was removed from Weld's agents. Choose another." };
      const bad = checkCommand(c);
      if (bad) return { missing: `${c.name}: ${bad}` };
      const bin = resolve(c.command);
      if (!bin) return { missing: `${c.name} could not be run: ${c.command} is not an executable file` };
      // ($NAME values are read from the login shell's environment at launch, so secrets need not be stored)
      const sh = o.shellEnv();
      const env = Object.fromEntries(Object.entries(c.env ?? {}).map(([k, v]) => [k, /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? (sh[v.slice(1)] ?? "") : v]));
      // (a session belongs to the same command with the same settings: the references, and what they resolve to now,
      // compared through a salted hash so no value is kept)
      return { id: agent, name: c.name, command: bin, args: c.args ?? [], env, flavor: null, modes: ["full"], key: hash([agent, bin, c.args ?? [], c.env ?? {}, hash([o.salt?.() ?? "", env, inherited()])]) };
    }
    return null;
  };
  const name = (agent) => {
    if (agent === "codex") return "Codex";
    if (!agent || agent === "claude") return "Claude";
    if (agent.startsWith("acp:")) return FLAVORS[agent.slice(4)]?.name ?? agent;
    if (agent.startsWith("cmd:")) return o.commands().find((x) => `cmd:${x.id}` === agent)?.name ?? `${agent.slice(4)} (not available)`;
    return agent;
  };
  return { list, spec, name, resolve };
}

const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
