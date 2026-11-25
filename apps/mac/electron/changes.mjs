// What a turn changed on disk. Before the agent starts, the folder is
// photographed into a git store of this app's own (kept with the app's
// data, never in the folder itself); when the turn ends it is photographed
// again, and the difference between the two is what the turn did, however
// it did it: an edit, a script, a generator. A folder that is a git
// repository lends its objects, so the photographs cost little.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// (git is told nothing it was not told here: whatever git settings the app itself was started with are left out,
// and a setting given as empty is a setting taken away)
const run = (args, env, cwd, timeout = 15000, max = 8 * 1024 * 1024) => {
  const all = { ...process.env };
  for (const k of Object.keys(all)) if (k.startsWith("GIT_")) delete all[k];
  for (const [k, v] of Object.entries(env)) if (v === "") delete all[k];
  else all[k] = v;
  return new Promise((resolve, reject) => execFile("git", args, { env: all, cwd, timeout, maxBuffer: max }, (err, out) => (err ? reject(err) : resolve(String(out)))));
};

export class Changes {
  /** @param {() => string} dir where the app keeps its stores */
  constructor(dir) {
    this.dir = dir;
    /** One photograph at a time per folder: two at once would fight over the store. */
    this.chains = new Map();
  }
  async store(cwd) {
    const git = path.join(this.dir(), createHash("sha1").update(cwd).digest("hex").slice(0, 16));
    if (!existsSync(path.join(git, "HEAD"))) {
      mkdirSync(git, { recursive: true });
      await run(["init", "-q", "--bare", git], {}, cwd);
      // what is never worth showing as a change
      mkdirSync(path.join(git, "info"), { recursive: true });
      writeFileSync(path.join(git, "info", "exclude"), "node_modules/\n.DS_Store\n.git/\n__pycache__/\n.venv/\n.next/\n.turbo/\nLibrary/\n.Trash/\n*.dmg\n*.zip\n*.mp4\n*.mov\n");
    }
    const env = { GIT_DIR: git, GIT_WORK_TREE: cwd, GIT_CONFIG_NOSYSTEM: "1" };
    // a repository's own objects are borrowed (read only), so nothing it already holds is stored twice
    try {
      const common = (await run(["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { GIT_DIR: "", GIT_WORK_TREE: "" }, cwd, 3000)).trim();
      if (common && existsSync(path.join(common, "objects"))) env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(common, "objects");
    } catch {
      /* not a repository: the store holds everything itself */
    }
    return env;
  }
  /** A store grown past a limit is let go (only this app's own copy; the next photograph begins it again). */
  async trim(git) {
    try {
      const n = await run(["count-objects", "-v"], { GIT_DIR: git }, path.dirname(git), 5000);
      const kb = [...n.matchAll(/^(size|size-pack): (\d+)/gm)].reduce((a, m) => a + Number(m[2]), 0);
      if (kb > 512 * 1024 && git.startsWith(this.dir())) rmSync(git, { recursive: true, force: true });
    } catch {
      /* looked at again next time */
    }
  }
  /** The folder as it is now, as a tree in the store; `key` keeps a separate index per thread (it is only a speed-up). */
  snap(cwd, key) {
    const p = (this.chains.get(cwd) ?? Promise.resolve()).then(() => this.take(cwd, key));
    this.chains.set(cwd, p.catch(() => null));
    return p;
  }
  async take(cwd, key) {
    if (!cwd || !existsSync(cwd)) return null;
    try {
      const env = await this.store(cwd);
      env.GIT_INDEX_FILE = path.join(env.GIT_DIR, `index-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`);
      await run(["add", "-A", "--ignore-errors", "."], env, cwd, 20000);
      return { tree: (await run(["write-tree"], env, cwd)).trim(), env };
    } catch {
      return null;
    }
  }
  /** What changed between two photographs: each file with its lines added and taken away, and the changes themselves (cut short if huge). */
  async diff(cwd, a, b) {
    if (!a || !b || a.tree === b.tree) return null;
    const env = b.env;
    try {
      const stat = await run(["diff", "--numstat", "-M", a.tree, b.tree], env, cwd);
      const files = stat
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [add, del, ...p] = l.split("\t");
          return { path: p.join("\t"), add: add === "-" ? null : Number(add), del: del === "-" ? null : Number(del) };
        });
      if (!files.length) return null;
      let patch = await run(["diff", "-M", "--no-color", "-U3", a.tree, b.tree], env, cwd, 15000, 32 * 1024 * 1024);
      const cut = patch.length > 400_000;
      if (cut) patch = patch.slice(0, 400_000);
      void this.trim(env.GIT_DIR);
      return { files: files.slice(0, 500), patch, cut, from: a.tree, to: b.tree };
    } catch {
      return null;
    }
  }
}
