// Boards: someone may keep more than one canvas. One is on screen at a time; the others are files that only the app
// writes while they are away. The first board is the file it always was (board.json); later ones live in boards/.
// The list, which one is open, and what was asked of a board while it was away are kept in boards.json.
// A board may belong to a folder (a project): what is started on it works there, unless a thread is pointed elsewhere.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const FIRST = "main";

export function makeBoards(dir) {
  const indexFile = () => path.join(dir, "boards.json");
  const fileOf = (id) => (id === FIRST ? path.join(dir, "board.json") : path.join(dir, "boards", `${id}.json`));
  const write = (p, v) => {
    mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(v));
    renameSync(tmp, p);
  };
  const read = () => {
    let ix = null;
    try {
      ix = JSON.parse(readFileSync(indexFile(), "utf8"));
    } catch {
      /* one board, as before there were several */
    }
    const list = Array.isArray(ix?.list) ? ix.list.filter((b) => b && /^[\w-]{1,40}$/.test(b.id) && typeof b.name === "string").map((b) => (folder(b.dir) ? b : { id: b.id, name: b.name })) : [];
    if (!list.length) list.push({ id: FIRST, name: "Board" });
    const current = list.some((b) => b.id === ix?.current) ? ix.current : list[0].id;
    const pending = ix?.pending && typeof ix.pending === "object" ? ix.pending : {};
    return { list, current, pending };
  };
  const save = (ix) => write(indexFile(), ix);
  // a folder a board can belong to: an absolute path to a folder that is there (one moved or deleted since is let go)
  function folder(p) {
    try {
      return typeof p === "string" && path.isAbsolute(p) && statSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  // which threads are on each board (read from the files, again only when a file has changed)
  const seen = new Map();
  const onIt = (id) => {
    const p = fileOf(id);
    let at = 0;
    try {
      at = statSync(p).mtimeMs;
    } catch {
      return null;
    }
    const had = seen.get(id);
    if (had && had.at === at) return had;
    const ids = new Set(), live = new Set();
    try {
      const doc = JSON.parse(JSON.parse(readFileSync(p, "utf8")).doc || "{}");
      for (const [k, s] of Object.entries(doc.shapes ?? {})) {
        if (s && s.kind === "thread") ids.add(k);
        if (s && (s.kind === "thread" || s.kind === "terminal")) live.add(k);
      }
      // (threads kept off the board, read from its bar, are on it all the same)
      for (const [k, s] of Object.entries(doc.away ?? {})) if (s && s.kind === "thread") (ids.add(k), live.add(k));
    } catch {
      /* unreadable: nothing known to be on it */
    }
    const got = { at, ids, live };
    seen.set(id, got);
    return got;
  };
  const threadsOf = (id) => onIt(id)?.ids ?? new Set();

  return {
    fileOf,
    list: () => read().list,
    current: () => read().current,
    nameOf: (id) => read().list.find((b) => b.id === id)?.name ?? "Board",
    dirOf: (id) => read().list.find((b) => b.id === id)?.dir ?? null,
    /** The board that belongs to a folder, if one does. */
    ofDir: (dir) => read().list.find((b) => b.dir && path.resolve(b.dir) === path.resolve(dir))?.id ?? null,
    /** Give a board its folder (or none). */
    setDir(id, dir) {
      const ix = read(), b = ix.list.find((x) => x.id === id);
      if (!b || (dir !== null && !folder(dir))) return false;
      if (dir === null) delete b.dir;
      else b.dir = path.resolve(dir);
      save(ix);
      return true;
    },
    /** The board a thread or terminal is on, of those not on screen (the one on screen says for itself what is on it). */
    awayBoardOf(thing) {
      const ix = read();
      for (const b of ix.list) if (b.id !== ix.current && onIt(b.id)?.live.has(thing)) return b;
      return null;
    },
    /** Every thread on a board that is not on screen. */
    awayThreads() {
      const ix = read(), out = new Set();
      for (const b of ix.list) if (b.id !== ix.current) for (const t of threadsOf(b.id)) out.add(t);
      return out;
    },
    threadsOf,
    create(name, dir) {
      const ix = read();
      const id = `b${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
      const own = folder(dir) ? path.resolve(dir) : null;
      const n = String(name || "").trim().slice(0, 60) || (own && path.basename(own)) || `Board ${ix.list.length + 1}`;
      ix.list.push(own ? { id, name: n, dir: own } : { id, name: n });
      save(ix);
      return id;
    },
    open(id) {
      const ix = read();
      if (!ix.list.some((b) => b.id === id)) return false;
      ix.current = id;
      save(ix);
      return true;
    },
    rename(id, name) {
      const ix = read(), b = ix.list.find((x) => x.id === id), n = String(name || "").trim().slice(0, 60);
      if (!b || !n) return false;
      b.name = n;
      save(ix);
      return true;
    },
    /** A board put away: its file kept, under a name of its own, beside the others (nothing is deleted). */
    putAway(id) {
      const ix = read();
      if (id === ix.current || ix.list.length < 2 || !ix.list.some((b) => b.id === id)) return false;
      // In an order that loses nothing whatever step fails: what was waiting for it is copied aside first, then it leaves
      // the list, and only then is its file moved (a file left behind unlisted is still there to be found).
      const p = fileOf(id), to = path.join(dir, "boards", "put-away", `${id}-${Date.now()}.json`);
      mkdirSync(path.dirname(to), { recursive: true });
      if (ix.pending[id]?.length) write(to.replace(/\.json$/, ".waiting.json"), ix.pending[id]);
      ix.list = ix.list.filter((b) => b.id !== id);
      delete ix.pending[id];
      save(ix);
      if (existsSync(p)) renameSync(p, to);
      seen.delete(id);
      return true;
    },
    /** Something asked of a board while it was away (a page or terminal opened by its agent), done once it is open. */
    later(id, op) {
      const ix = read();
      const q = Array.isArray(ix.pending[id]) ? ix.pending[id] : [];
      // (refused, not dropped, past this many: nothing said to be done is quietly lost)
      if (q.length >= 200) return false;
      ix.pending[id] = [...q, { ...op, key: randomBytes(6).toString("hex") }];
      save(ix);
      return true;
    },
    /** What waits for a board: kept until the board has been saved with it done (so a crash before then does it again). */
    waiting(id) {
      const q = read().pending[id];
      return Array.isArray(q) ? q : [];
    },
    done(id, keys) {
      if (!keys.size) return;
      const ix = read(), q = Array.isArray(ix.pending[id]) ? ix.pending[id] : [];
      const left = q.filter((o) => !keys.has(o.key));
      if (left.length === q.length) return;
      if (left.length) ix.pending[id] = left;
      else delete ix.pending[id];
      save(ix);
    },
  };
}
