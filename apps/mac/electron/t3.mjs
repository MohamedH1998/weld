// Connecting T3 Code to Weld: Weld adds itself to T3 Code's own settings as an agent, so Weld's threads can be opened,
// followed and answered from T3 Code (and so from its phone app). T3 Code reads that file again whenever it changes, so
// no restart is needed. Only Weld's own entry is ever written or removed, and only while it is still the one Weld made:
// an agent the person set up under the same name is left alone, and everything else in the file is kept as it is.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ID = "weld";

/** @param {{ dir: string, bin: () => string }} o  T3 Code's settings folder, and the `weld` command it should run. */
export function makeT3(o) {
  // (through a link to the real file, so a settings file kept elsewhere, in dotfiles say, stays linked)
  // (a link whose target is gone is left as it is, never replaced by a file of Weld's)
  const file = () => {
    const f = path.join(o.dir, "settings.json");
    let link = false;
    try {
      link = lstatSync(f).isSymbolicLink();
    } catch {
      return f;
    }
    try {
      return realpathSync(f);
    } catch {
      if (link) throw new Error("T3 Code's settings file is a link to a file that isn't there");
      return f;
    }
  };
  // (T3 Code is here if it has ever run, or is in Applications)
  const installed = () => existsSync(o.dir) || ["T3 Code.app", "T3 Code (Beta).app"].some((a) => existsSync(path.join("/Applications", a)) || existsSync(path.join(os.homedir(), "Applications", a)));
  const raw = () => (existsSync(file()) ? readFileSync(file(), "utf8") : "");
  /** The settings as they are; a file Weld can't read (comments, say) is never written over. */
  const parse = (text) => {
    if (!text.trim()) return {};
    let s;
    try {
      s = JSON.parse(text);
    } catch {
      throw new Error("T3 Code's settings file has something Weld can't read (comments, perhaps)");
    }
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("T3 Code's settings are not in a form Weld knows");
    return s;
  };
  /** Written whole and swapped in, and only if the file is still what was read: a change T3 made meanwhile is never undone. */
  const write = (was, s) => {
    const f = file();
    mkdirSync(path.dirname(f), { recursive: true });
    let mode = 0o600;
    try {
      mode = statSync(f).mode & 0o777;
    } catch {
      /* a new file */
    }
    const tmp = `${f}.weld-${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`, { mode });
    if (raw() !== was) {
      rmSync(tmp, { force: true });
      throw new Error("T3 Code changed its settings just then. Try again");
    }
    renameSync(tmp, f);
  };
  const entry = () => ({
    driver: "acpRegistry",
    displayName: "Weld",
    enabled: true,
    config: { source: "local", commandPath: path.join(o.bin(), "weld"), commandArgs: ["acp"] },
  });
  /** Whether an entry is the one this Weld makes: its own `weld` command, exactly, with `acp`. */
  const ours = (w) => !!w && w.driver === "acpRegistry" && w.config?.source === "local" && w.config?.commandPath === entry().config.commandPath && JSON.stringify(w.config?.commandArgs) === '["acp"]';
  /** Added by hand instead, when Weld can't write the file: T3 Code's own words for it. */
  const byHand = () => ` Add Weld in T3 Code yourself: Settings → Providers → Local ACP command, with the executable ${entry().config.commandPath} and the argument acp.`;
  const change = (fn) => {
    try {
      const was = raw(), s = parse(was);
      const r = fn(s);
      if (r) return r;
      write(was, s);
      return { ok: true };
    } catch (e) {
      const m = String(e?.message || e).replace(/\.?$/, ".");
      return { error: /Try again/.test(m) ? m : `${m}${byHand()}` };
    }
  };
  return {
    state() {
      if (!installed()) return { installed: false, connected: false };
      try {
        const w = parse(raw()).providerInstances?.[ID];
        return { installed: true, connected: ours(w) && w.enabled !== false };
      } catch {
        return { installed: true, connected: false };
      }
    },
    connect: () =>
      change((s) => {
        const w = s.providerInstances?.[ID];
        if (w && !ours(w)) return { error: "T3 Code already has an agent called “weld” that this Weld didn't add. Rename or remove it in T3 Code, then connect." };
        s.providerInstances = { ...(s.providerInstances ?? {}), [ID]: entry() };
      }),
    disconnect: () =>
      change((s) => {
        const w = s.providerInstances?.[ID];
        if (!w || !ours(w)) return { ok: true };
        delete s.providerInstances[ID];
      }),
  };
}
