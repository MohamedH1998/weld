// Shells. Each one outlives the window: what it printed is kept, so a
// reloaded page gets its screen back.
import pty from "@lydell/node-pty";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";

const KEEP = 400_000;

/** What output leaves on the screen, roughly: a full-screen program (top, vim) still open is all that shows; one that
 *  has closed is gone again; and a clear (`clear`, or a loop that redraws) leaves only what came after it. */
/** One line as it stands once printed: a carriage return goes back to its start and what follows writes over what was
 *  there, and a backspace steps back one. */
export function overprint(line) {
  let row = "";
  for (const seg of line.split("\r")) {
    let s = "";
    for (const ch of seg) s = ch === "\b" ? s.slice(0, -1) : s + ch;
    row = s + row.slice(s.length);
  }
  return row;
}
export function onScreen(out) {
  const ALT = /\u001b\[\?(?:1049|1047|47)([hl])/g;
  let main = "", from = 0, inAlt = false, m;
  while ((m = ALT.exec(out))) {
    if (m[1] === "h" && !inAlt) (main += out.slice(from, m.index), (inAlt = true));
    else if (m[1] === "l" && inAlt) inAlt = false;
    else continue;
    from = m.index + m[0].length;
  }
  out = inAlt ? out.slice(from) : main + out.slice(from);
  const CLEAR = /\u001b\[[23]J|\u001bc|\u001b\[H\u001b\[0?J/g;
  let cut = -1;
  while ((m = CLEAR.exec(out))) cut = m.index + m[0].length;
  return cut >= 0 ? out.slice(cut) : out;
}
/** A shell at its prompt (nothing else in the foreground). */
const SHELL = /^-?(zsh|bash|fish|sh|tcsh|ksh|dash|login)$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Terminals {
  /** @param {(id: string, ev: object) => void} emit */
  constructor(emit, extraEnv = () => ({})) {
    this.emit = emit;
    this.extraEnv = extraEnv;
    /** @type {Map<string, { p: import("@lydell/node-pty").IPty, out: string, alive: boolean, code: number | null, proc: string }>} */
    this.all = new Map();
  }
  /** `exec`: the command is the process itself (it ends when the command does), not typed into a shell that outlives it. */
  open(id, { cwd, cols = 80, rows = 24, run, exec = false } = {}) {
    const had = this.all.get(id);
    if (had && had.alive) {
      try {
        had.p.resize(Math.max(2, cols), Math.max(2, rows));
      } catch {
        /* already gone */
      }
      return { replay: had.out, alive: true, proc: had.proc };
    }
    const shell = process.env.SHELL || "/bin/zsh";
    const dir = cwd && existsSync(cwd) ? cwd : os.homedir();
    const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "Weld", WELD: "1" };
    // a shell opened here is not inside an agent, whatever started this app
    for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|ELECTRON_|WELD_DEV_URL|WELD_DATA)/.test(k)) delete env[k];
    Object.assign(env, this.extraEnv(id));
    if (exec && cwd && dir !== cwd) return { replay: "", alive: false, proc: "", fresh: false };
    const p = pty.spawn(shell, exec && run ? ["-lc", String(run)] : ["-l"], { name: "xterm-256color", cols: Math.max(2, cols), rows: Math.max(2, rows), cwd: dir, env });
    const t = { p, out: had?.out ? `${had.out}\r\n` : "", alive: true, code: null, proc: p.process };
    if (cwd && dir !== cwd) t.out += `\x1b[2m${cwd} is no longer there: this shell opened in your home folder\x1b[0m\r\n`;
    this.all.set(id, t);
    // a command it was opened to run is typed once the shell has drawn its first prompt, and only if it opened where it was meant to
    if (exec && run) t.out += `\x1b[2m$ ${String(run)}\x1b[0m\r\n`;
    let pending = !exec && run && (!cwd || dir === cwd) ? String(run) : null, settle = null;
    p.onData((d) => {
      t.out += d;
      if (t.out.length > KEEP) t.out = t.out.slice(-KEEP * 0.75);
      // The first of anything is sent on at once (a letter typed is echoed without waiting); what follows hard on it
      // is sent in gulps, because a program printing flat out makes thousands of small writes a second.
      if (!t.sending) {
        this.emit(id, { t: "data", d });
        const more = () => {
          if (!t.gulp) return void (t.sending = null);
          const all = t.gulp;
          t.gulp = "";
          this.emit(id, { t: "data", d: all });
          t.sending = setTimeout(more, 6);
        };
        t.sending = setTimeout(more, 6);
      } else t.gulp = (t.gulp ?? "") + d;
      if (pending) {
        clearTimeout(settle);
        settle = setTimeout(() => {
          if (pending && t.alive) p.write(`${pending}\r`);
          pending = null;
        }, 350);
      }
      const proc = p.process;
      if (proc !== t.proc) {
        t.proc = proc;
        this.emit(id, { t: "proc", proc });
      }
    });
    p.onExit(({ exitCode }) => {
      t.alive = false;
      t.code = exitCode;
      t.gone?.();
      // (one started over in its place has the name now: this one's end is no news)
      if (this.all.get(id) !== t) return;
      // what it printed last is sent on before the news that it has finished
      clearTimeout(t.sending);
      t.sending = null;
      if (t.gulp) this.emit(id, { t: "data", d: t.gulp });
      t.gulp = "";
      t.alive = false;
      t.code = exitCode;
      this.emit(id, { t: "exit", code: exitCode });
    });
    return { replay: t.out, alive: true, proc: t.proc, fresh: true };
  }
  /** Start a command over: the one running is stopped (and waited for, so what it held, a port say, is free), then begun again, its earlier output kept. */
  async again(id, opts) {
    const t = this.all.get(id);
    if (t?.alive) {
      const ended = new Promise((r) => (t.gone = r));
      try {
        t.p.kill("SIGINT");
      } catch {
        /* gone */
      }
      const late = setTimeout(() => {
        try {
          t.p.kill("SIGKILL");
        } catch {
          /* gone */
        }
      }, 3000);
      await Promise.race([ended, new Promise((r) => setTimeout(r, 4000))]);
      clearTimeout(late);
    }
    const had = this.all.get(id);
    if (had) had.alive = false;
    return this.open(id, opts);
  }
  /** A command typed into a shell started over: what runs in it is interrupted, and the command typed again only once the
   *  shell itself is back in charge of the terminal (its process group in the foreground, not merely something named like
   *  a shell). If what runs won't stop, the terminal says so and nothing is typed. Only the latest start-over of a
   *  terminal types, and none does once the person has typed into it meanwhile. */
  async rerun(id, command) {
    const t = this.all.get(id);
    if (!t?.alive) return { ok: false };
    const mine = {};
    t.rerunning = mine;
    const typedBefore = t.typed ?? 0;
    const current = () => this.all.get(id) === t && t.alive && t.rerunning === mine && (t.typed ?? 0) === typedBefore;
    const idle = () => {
      try {
        // (the terminal's foreground process group is the shell's own)
        const fg = Number(execFileSync("ps", ["-o", "tpgid=", "-p", String(t.p.pid)], { encoding: "utf8", timeout: 1000 }).trim());
        return fg > 0 && fg === t.p.pid;
      } catch {
        return false;
      }
    };
    const name = () => {
      try {
        return t.p.process || "what was running";
      } catch {
        return "what was running";
      }
    };
    t.p.write("\u0003");
    for (let waited = 0; current() && !idle() && waited < 10000; waited += 200) {
      if (waited === 5000) t.p.write("\u0003");
      await sleep(200);
    }
    if (!current()) return { ok: false };
    if (!idle()) {
      this.say(id, `\r\n[Weld] ${name()} didn't stop, so \`${command}\` wasn't started again.\r\n`);
      return { ok: false };
    }
    // (the prompt drawn again before anything is typed at it; everything checked again right before typing)
    await sleep(150);
    if (!current() || !idle()) return { ok: false };
    t.p.write(`${command}\r`);
    if (t.rerunning === mine) t.rerunning = null;
    return { ok: true };
  }
  /** Words of Weld's own on a terminal's screen (shown, and kept with what it printed, in order; never typed into it). */
  say(id, text) {
    const t = this.all.get(id);
    if (!t) return;
    t.out = (t.out + text).slice(-KEEP);
    if (t.sending) t.gulp = (t.gulp ?? "") + text;
    else this.emit(id, { t: "data", d: text });
  }
  /** What a terminal last printed, as plain lines (for an agent to be shown): what is on its screen now, or (`all`) everything lately. */
  recent(id, lines = 120, all = false) {
    const t = this.all.get(id);
    if (!t) return null;
    const plain = (all ? t.out : onScreen(t.out))
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\u001b[=>()][0-9A-Za-z]?/g, "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => overprint(l).trimEnd());
    return { text: plain.slice(-lines).join("\n").trim(), proc: t.p.process, alive: t.alive };
  }
  write(id, d) {
    const t = this.all.get(id);
    if (t?.alive) t.p.write(d);
  }
  /** The person typed or pasted into it (told by the card: a start-over waiting to type gives way). */
  typed(id) {
    const t = this.all.get(id);
    if (t) t.typed = (t.typed ?? 0) + 1;
  }
  resize(id, cols, rows) {
    const t = this.all.get(id);
    if (!t?.alive) return;
    try {
      t.p.resize(Math.max(2, cols), Math.max(2, rows));
    } catch {
      /* already gone */
    }
  }
  pid(id) {
    const t = this.all.get(id);
    return t?.alive ? t.p.pid : null;
  }
  close(id) {
    const t = this.all.get(id);
    if (!t) return;
    this.all.delete(id);
    if (t.alive) {
      try {
        t.p.kill();
      } catch {
        /* already gone */
      }
    }
  }
  shutdown() {
    for (const id of [...this.all.keys()]) this.close(id);
  }
}
