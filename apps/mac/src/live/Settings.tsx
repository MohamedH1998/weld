// Settings: the agents Weld can ask, which of them are on this Mac (Claude Code and Codex installed from here), adding
// one of your own by the line that starts it, and connecting T3 Code so Weld's threads can be followed from there.
import { useEffect, useRef, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import { agentList, weld } from "./bridge";
import type { AgentInfo } from "./bridge";
import { AgentLogo } from "./AgentLogo";
import { installOther, OTHERS, SETUP, setUp } from "./setup";
import type { Native } from "./setup";

/** A command line as a shell reads it: words, quoted words, and NAME=$VARIABLE settings before the command. */
export function parseLine(line: string): { env: Record<string, string>; command: string; args: string[] } | string {
  const words: string[] = [];
  let cur = "", quote: string | null = null, any = false;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") (quote = ch), (any = true);
    else if (/\s/.test(ch)) {
      if (cur || any) words.push(cur);
      cur = "";
      any = false;
    } else cur += ch;
  }
  if (quote) return "a quote is not closed";
  if (cur || any) words.push(cur);
  const env: Record<string, string> = {};
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) {
    const w = words.shift()!, at = w.indexOf("=");
    env[w.slice(0, at)] = w.slice(at + 1);
  }
  const command = words.shift();
  if (!command) return "give the command that starts the agent";
  return { env, command, args: words };
}

// (named after what it runs: the script, when the command is only what runs scripts)
const RUNNERS = new Set(["node", "bun", "deno", "python", "python3", "uv", "uvx", "npx", "bunx", "pnpx", "sh", "bash", "zsh"]);
const nameOf = (command: string, args: string[]) => {
  const tail = (s: string) => s.split("/").pop()!;
  const what = RUNNERS.has(tail(command)) ? (args.find((a) => !a.startsWith("-") && a !== "run") ?? command) : command;
  const base = tail(what).replace(/\.(m?[jt]s|py|sh)$/, "").replace(/^@[^/]*\//, "");
  return base ? base[0]!.toUpperCase() + base.slice(1) : "My agent";
};

/** T3 Code, if it is on this Mac: Weld added to it as one of its agents, or taken off it again. */
function T3() {
  const [state, setState] = useState<{ installed: boolean; connected: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => void weld.t3.state().then(setState), []);
  if (!state?.installed) return null;
  const flip = async () => {
    const r = await (state.connected ? weld.t3.disconnect() : weld.t3.connect());
    setError(r.error ?? "");
    setState(await weld.t3.state());
  };
  return (
    <>
      <div className="settings-label">T3 Code</div>
      <div className="settings-row settings-t3">
        <span className="settings-name settings-two">
          <span>{state.connected ? "Weld is one of T3 Code's agents" : "Use Weld from T3 Code"}</span>
          <span className="settings-sub">{state.connected ? "Pick Weld in T3 Code to open, follow and answer its threads, on your phone too" : "Open, follow and answer Weld's threads in T3 Code, on your phone too"}</span>
        </span>
        {state.connected ? (
          <>
            <span className="settings-state settings-on"><Check size={12} weight="bold" />Connected</span>
            <button type="button" className="settings-remove ctl" onClick={() => void flip()}>Disconnect</button>
          </>
        ) : (
          <button type="button" className="settings-go settings-small ctl" onClick={() => void flip()}>Connect</button>
        )}
      </div>
      {error && <div className="settings-error">{error}</div>}
    </>
  );
}

export function Settings({ close, leaving, editor }: { close: () => void; leaving: boolean; editor: Editor }) {
  const [agents, setAgents] = useState<AgentInfo[]>(() => agentList(true));
  const [line, setLine] = useState("");
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const fresh = () => setAgents(agentList(true));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), close());
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [close]);

  const add = async () => {
    const p = parseLine(line);
    if (typeof p === "string") return setError(`Couldn't read that: ${p}.`);
    const r = await weld.saveAgent({ name: nameOf(p.command, p.args), command: p.command, args: p.args, env: p.env });
    if (r.error) return setError(r.error);
    setLine("");
    setError("");
    fresh();
  };
  const remove = async (id: string) => {
    await weld.removeAgent(id.replace(/^cmd:/, ""));
    fresh();
  };
  // Claude and Codex first, then the agents found on this Mac, then yours, then the rest
  const rank = (a: AgentInfo) => (a.kind === "native" ? 0 : a.kind === "command" ? 2 : a.installed ? 1 : 3);
  const list = [...agents].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="absolute inset-0 z-[60]" onPointerDown={close}>
      <div className={`settings ${leaving ? "ui-out" : "ui-in"}`} role="dialog" aria-label="Settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <b>Settings</b>
          <button type="button" className="settings-x ctl" aria-label="Close" onClick={close}><X size={13} weight="bold" /></button>
        </div>
        <T3 />
        <div className="settings-label">Agents</div>
        <div className="settings-list">
          {list.map((a) => (
            <div key={a.id} className="settings-row" data-off={!a.installed || undefined}>
              <AgentLogo id={a.id} size={16} />
              <span className="settings-name">{a.name}</span>
              {a.kind === "command" ? (
                <button type="button" className="settings-remove ctl" onClick={() => void remove(a.id)}>Remove</button>
              ) : !a.installed && (a.id === "claude" || a.id === "codex") ? (
                <button type="button" className="settings-go settings-small ctl" onClick={() => (setUp(editor, a.id as Native, "install"), close())}>Install {SETUP[a.id as Native].name}</button>
              ) : !a.installed && OTHERS[a.id] ? (
                <button type="button" className="settings-go settings-small ctl" onClick={() => (installOther(editor, a.id), close())}>Install</button>
              ) : (
                <span className="settings-state">{a.installed ? "On this Mac" : "Not installed"}</span>
              )}
            </div>
          ))}
        </div>
        <form className="settings-add" onSubmit={(e) => (e.preventDefault(), void add())}>
          <input
            ref={field}
            value={line}
            onChange={(e) => (setLine(e.target.value), setError(""))}
            placeholder="Add another agent by the command that starts it"
            aria-label="Add an agent by its command"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <button type="submit" className="settings-go ctl" disabled={!line.trim()}>Add</button>
        </form>
        {error && <div className="settings-error">{error}</div>}
      </div>
    </div>
  );
}
