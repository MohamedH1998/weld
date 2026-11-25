// What became of each run of Weld, so a close nobody asked for can be told apart from a quit: how it ended (the
// window closed, ⌘Q, the Mac shutting down), what broke on the way (the page or a helper process gone, an error),
// and, for a run that never got to say, that it was killed or crashed, when it was last alive, and the crash report.
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const KEEP = 400;

export function lifeRecord(dir, about = {}) {
  const lifeFile = path.join(dir, "life.json"), log = path.join(dir, "exits.log");
  const write = (o) => {
    try {
      writeFileSync(lifeFile, JSON.stringify(o));
    } catch {
      /* the folder is gone: nothing to keep it in */
    }
  };
  const note = (t, detail = {}) => {
    try {
      appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), t, ...detail })}\n`);
      const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
      if (lines.length > KEEP * 1.5) writeFileSync(log, `${lines.slice(-KEEP).join("\n")}\n`);
    } catch {
      /* not written: the run goes on */
    }
  };
  // the last run: if it never said how it ended, it did not end by quitting
  let last = null;
  try {
    last = JSON.parse(readFileSync(lifeFile, "utf8"));
  } catch {
    /* the first run */
  }
  if (last && !last.ended) {
    const report = crashReport(last.started);
    note("ended without quitting", { pid: last.pid, started: iso(last.started), lastAlive: iso(last.seen), version: last.version, ...(report ? { crashReport: report } : {}) });
  }
  const life = { pid: process.pid, started: Date.now(), seen: Date.now(), version: about.version };
  write(life);
  note("started", { pid: process.pid, version: about.version });
  // (alive, said once a minute: a run killed outright is known to have lasted until about then)
  const beat = setInterval(() => write({ ...life, seen: (life.seen = Date.now()) }), 60000);
  beat.unref?.();
  let done = false;
  return {
    note,
    ended(why) {
      if (done) return;
      done = true;
      clearInterval(beat);
      note("quit", { why });
      write({ ...life, seen: Date.now(), ended: why });
    },
  };
}

const iso = (t) => (t ? new Date(t).toISOString() : undefined);

/** The crash report macOS wrote for Weld since that run began, if it wrote one. */
function crashReport(since) {
  const at = path.join(os.homedir(), "Library", "Logs", "DiagnosticReports");
  try {
    if (!existsSync(at)) return null;
    const found = readdirSync(at)
      .filter((f) => /^(Weld|Electron)/i.test(f))
      .map((f) => ({ f: path.join(at, f), t: statSync(path.join(at, f)).mtimeMs }))
      .filter((x) => !since || x.t >= since)
      .sort((a, b) => b.t - a.t);
    return found[0]?.f ?? null;
  } catch {
    return null;
  }
}
