// Connecting T3 Code to Weld: Weld adds itself to T3 Code's own settings as an agent, so Weld's threads can be opened,
// followed and answered from T3 Code (and so from its phone app). T3 Code reads that file again whenever it changes, so
// no restart is needed. Only Weld's own entry is ever written or removed; everything else in the file is kept as it is.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ID = "weld";

/** @param {{ dir: string, bin: () => string }} o  T3 Code's settings folder, and the `weld` command it should run. */
export function makeT3(o) {
  const file = () => path.join(o.dir, "settings.json");
  // (T3 Code is here if it has ever run, or is in Applications)
  const installed = () => existsSync(o.dir) || ["T3 Code.app", "T3 Code (Beta).app"].some((a) => existsSync(path.join("/Applications", a)) || existsSync(path.join(os.homedir(), "Applications", a)));
  /** The settings as they are; an unreadable file is never written over. */
  const read = () => {
    if (!existsSync(file())) return {};
    const s = JSON.parse(readFileSync(file(), "utf8"));
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("T3 Code's settings are not in a form Weld knows");
    return s;
  };
  const write = (s) => {
    const f = file(), tmp = `${f}.weld-${process.pid}.tmp`;
    let mode = 0o600;
    try {
      mode = statSync(f).mode & 0o777;
    } catch {
      /* a new file */
    }
    writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`, { mode });
    renameSync(tmp, f);
  };
  const entry = () => ({
    driver: "acpRegistry",
    displayName: "Weld",
    enabled: true,
    config: { source: "local", commandPath: path.join(o.bin(), "weld"), commandArgs: ["acp"] },
  });
  return {
    state() {
      if (!installed()) return { installed: false, connected: false };
      try {
        const w = read().providerInstances?.[ID];
        return { installed: true, connected: !!w && w.enabled !== false && w.config?.commandPath === entry().config.commandPath };
      } catch {
        return { installed: true, connected: false };
      }
    },
    connect() {
      try {
        const s = read();
        s.providerInstances = { ...(s.providerInstances ?? {}), [ID]: entry() };
        write(s);
        return { ok: true };
      } catch (e) {
        return { error: `Couldn't connect T3 Code: ${e?.message || e}` };
      }
    },
    disconnect() {
      try {
        const s = read();
        if (!s.providerInstances?.[ID]) return { ok: true };
        delete s.providerInstances[ID];
        write(s);
        return { ok: true };
      } catch (e) {
        return { error: `Couldn't disconnect T3 Code: ${e?.message || e}` };
      }
    },
  };
}
