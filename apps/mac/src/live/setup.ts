// Getting an agent going: installing Claude Code or Codex, and signing in to it, in a terminal on the board. Weld never
// installs or signs in by itself; the person presses for it and watches it happen, and answers what the agent asks.
import type { Editor } from "@weld/canvas/editor";
import type { Id } from "@weld/canvas/types";
import { weld } from "./bridge";
import { addLive, openBeside } from "./place";

export type Native = "claude" | "codex";

export const SETUP: Record<Native, { name: string; by: string; install: string; signIn: string }> = {
  // (installed with npm, which anyone who built Weld has; then the agent is started once, which is how each signs in)
  claude: { name: "Claude Code", by: "Anthropic", install: "npm install -g @anthropic-ai/claude-code && claude", signIn: "claude" },
  codex: { name: "Codex", by: "OpenAI", install: "npm install -g @openai/codex && codex login", signIn: "codex login" },
};

/** Other agents Weld finds by themselves, with the one line that installs each and then signs in (only where that line is the maker's own). */
export const OTHERS: Record<string, { name: string; install: string }> = {
  "acp:opencode": { name: "OpenCode", install: "npm install -g opencode-ai && opencode auth login" },
  "acp:cursor": { name: "Cursor", install: "curl https://cursor.com/install -fsS | bash && cursor-agent login" },
};
/** A terminal on the board installing one of those. */
export function installOther(editor: Editor, id: string): Id | null {
  const o = OTHERS[id];
  if (!o) return null;
  return unpicked(editor, addLive(editor, "terminal", { cwd: weld.info.home, run: o.install, cmd: o.install }, `Installing ${o.name}`));
}

/** Whether an agent's failure is its asking to be signed in to. */
export const wantsSignIn = (text: string | undefined) =>
  !!text && /\/login|not logged in|log ?in to|sign ?in|invalid api key|authentication_error|not authenticated/i.test(text);
/** Whether a failure is the agent not being on this Mac at all. */
export const notInstalled = (text: string | undefined) => !!text && /is not installed on this Mac/.test(text);

/** A terminal on the board running the install or the sign-in: beside the thread that needed it, or in view. */
export function setUp(editor: Editor, agent: Native, what: "install" | "signIn", from?: Id | null): Id {
  const s = SETUP[agent];
  const live = { cwd: weld.info.home, run: s[what], cmd: s[what] };
  const title = what === "install" ? `Installing ${s.name}` : `Signing in to ${s.name}`;
  return unpicked(editor, from ? openBeside(editor, from, "terminal", live, title) : addLive(editor, "terminal", live, title));
}
/** A setup terminal is never left selected: what is selected goes with the next question, and its output holds sign-in links and codes. */
function unpicked(editor: Editor, id: Id): Id {
  if (editor.store.sel.has(id)) (editor.store.select([]), editor.store.emit());
  return id;
}
