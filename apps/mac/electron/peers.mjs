// Who is on the other end of Weld's own socket (`weld acp`, as T3 Code runs it). Anyone on this Mac's account can open
// it, so the socket alone says nothing: the process at the other end is found, and so is what started it. Weld's own
// threads and terminals never come in this way (they have their own limits, and this would be a way round them); an app
// comes in once the person has let it, and is remembered.
import { execFile } from "node:child_process";
import path from "node:path";

const run = (cmd, args) => new Promise((done) => execFile(cmd, args, { timeout: 5000, maxBuffer: 64 * 1024 * 1024 }, (err, out) => done(err ? null : out)));

/** The process holding the other end of `socket` (accepted on a unix socket), or null if it cannot be told. */
export async function peerOf(socket) {
  const fd = socket?._handle?.fd;
  if (!Number.isInteger(fd) || fd < 0) return null;
  const out = await run("/usr/sbin/lsof", ["-nP", "-U", "-F", "pfdn"]);
  if (!out) return null;
  // lsof lists, for each process (p), each of its sockets (f) with its address (d) and, for a connected one, the address
  // of its other end (n->…): this end is found by our process and descriptor, the other end by pointing at it
  const ends = [];
  let p = 0, f = -1, d = "";
  for (const line of out.split("\n")) {
    const k = line[0], v = line.slice(1);
    if (k === "p") p = Number(v);
    else if (k === "f") (f = Number(v)), (d = "");
    else if (k === "d") d = v;
    else if (k === "n") ends.push({ p, f, d, to: v.startsWith("->") ? v.slice(2) : null });
  }
  const mine = ends.find((e) => e.p === process.pid && e.f === fd);
  if (!mine?.d) return null;
  const other = ends.find((e) => e.p !== process.pid && e.to === mine.d);
  return other ? other.p : null;
}

/** `pid` and the processes that started it, nearest first: each with its program's path. */
export async function lineage(pid) {
  const out = await run("/bin/ps", ["-axo", "pid=,ppid=,comm="]);
  if (!out) return [];
  const all = new Map();
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) all.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), comm: m[3] });
  }
  const chain = [];
  for (let at = all.get(pid); at && chain.length < 64; at = at.ppid > 1 ? all.get(at.ppid) : undefined) chain.push(at);
  return chain;
}

/** The app a program belongs to (the outermost .app around it), or null. */
const appOf = (comm) => {
  const m = /^(.*?\.app)(?:\/|$)/.exec(comm);
  return m ? m[1] : null;
};

/**
 * Whether the process on `socket` may use Weld's threads. Refused if Weld started it (or it cannot be told); let in if
 * the app that started it was let in before; otherwise the person is asked, and an app they let in is remembered.
 * `o`: { self: Weld's own pid, allowed(): app paths let in, allow(app), ask({ name, app }) → Promise<boolean>, test }
 */
export async function admit(socket, o) {
  const pid = await peerOf(socket);
  if (!pid) return { ok: false, why: "who is asking could not be told" };
  const chain = await lineage(pid);
  if (!chain.length) return { ok: false, why: "who is asking could not be told" };
  if (chain.some((c) => c.pid === o.self)) return { ok: false, why: "a thread or terminal inside Weld (it asks through its own limits)" };
  if (o.test) return { ok: true };
  // (the program at the other end is Weld's own, run as `weld acp`: what matters is what started it)
  const app = chain.slice(1).map((c) => appOf(c.comm)).find(Boolean) ?? null;
  if (app && o.allowed().includes(app)) return { ok: true };
  const name = app ? path.basename(app, ".app") : `A program (${path.basename(chain[1]?.comm ?? chain[0].comm)})`;
  const yes = await o.ask({ name, app });
  if (yes && app) o.allow(app);
  return yes ? { ok: true } : { ok: false, why: "the person did not allow it" };
}
