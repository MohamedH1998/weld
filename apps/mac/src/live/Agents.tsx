// The agents at work, seen on the board as one sees other people on a
// shared drawing: each has a mark where it is working, saying what it is
// doing. A mark never moves the person's view. One that is off screen
// waits at the edge nearest to it; hovering over a mark (or over a
// thread's card, from far off) shows what that agent has been up to.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@weld/canvas/editor";
import type { Box, Id } from "@weld/canvas/types";
import { folderName, agentName } from "./bridge";
import { FAR } from "./LiveLayer";
import { goTo, hueOf, spotOf, subscribeVisits, visitOf, visitsVersion } from "./place";
import { doingNow, lastSteps } from "./ThreadNode";
import { useThread, useThreads } from "./threads";

const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** Where a mark stands on a thing: at its top corner, its name riding just above the edge so it covers nothing. */
const anchor = (b: Box) => ({ x: b.x + 10, y: b.y, w: b.w });

export const Agents = memo(function Agents({ editor }: { editor: Editor }) {
  const store = editor.store;
  useSyncExternalStore(store.subscribe, store.getStill, () => 0);
  useSyncExternalStore(subscribeVisits, visitsVersion, () => 0);
  const threads = useThreads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => store.doc.order.map((id) => store.doc.shapes[id]).filter((s): s is Box => s?.kind === "thread"), [store.doc]);
  // (and the threads kept off the board: on the board they are only this mark, so it also says what they reply, for a moment)
  const away = useMemo(() => Object.values(store.doc.away ?? {}), [store.doc]);
  const said = useSaid(away, threads);
  const working = [...boxes, ...away].filter((b) => threads.get(b.id)?.meta.status === "running" || said.has(b.id));
  const layer = useRef<HTMLDivElement>(null);

  // Every mark is kept where its place on the board falls on screen, by hand, as the view moves. A mark going
  // over to something glides there; all the gliding is done in one pass a frame, however many are on their way.
  useLayoutEffect(() => {
    const el = layer.current!;
    let raf = 0;
    const place = () => {
      const c = store.cam, w = editor.view.w, h = editor.view.h, now = performance.now();
      let moving = false;
      for (const m of el.querySelectorAll<HTMLElement>("[data-mark]")) {
        const k = Math.min(1, (now - Number(m.dataset.t0 ?? 0)) / 520), e = 1 - (1 - k) ** 3;
        if (k < 1) moving = true;
        const wx = Number(m.dataset.fx) + (Number(m.dataset.tx) - Number(m.dataset.fx)) * e;
        const wy = Number(m.dataset.fy) + (Number(m.dataset.ty) - Number(m.dataset.fy)) * e;
        m.dataset.wx = String(wx);
        m.dataset.wy = String(wy);
        const sx = (wx - c.x) * c.z, sy = (wy - c.y) * c.z;
        const x = Math.min(w - 20, Math.max(20, sx)), y = Math.min(h - 96, Math.max(60, sy));
        const off = x !== sx || y !== sy;
        m.style.transform = `translate(${x}px, ${y}px)`;
        if (off) {
          m.dataset.edge = "1";
          m.style.setProperty("--turn", `${Math.atan2(sy - y, sx - x)}rad`);
        } else delete m.dataset.edge;
        // its name keeps to the width of the thing it stands on, and turns inward at the edges of the window
        // (set in steps, not every frame of a zoom: a new width means laying the name out again)
        const room = Math.round(Math.max(120, Number(m.dataset.ww) * c.z - 24) / 40) * 40;
        if (m.dataset.room !== String(room)) {
          m.dataset.room = String(room);
          m.style.setProperty("--room", `${room}px`);
        }
        // (its name rides above the card, over nothing; it drops inside only when pinned to the window's edge,
        // or where the pills at the top right would cover it)
        m.dataset.side = `${x > w - 290 ? "r" : "l"}${(off && sy < y) || (y < 100 && x > w - 330) ? "t" : "b"}`;
        // and what it says when hovered opens toward the room there is
        m.dataset.peek = `${x > w - 330 ? "r" : "l"}${y > h - 300 ? "u" : "d"}`;
      }
      raf = moving ? requestAnimationFrame(place) : 0;
    };
    const go = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    (el as HTMLDivElement & { go?: () => void }).go = go;
    const off = store.subscribe(() => {
      cancelAnimationFrame(raf);
      place();
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [store, editor]);

  // from far off, a thread's card says more when the pointer rests on it
  const [peek, setPeek] = useState<{ id: Id; x: number; y: number } | null>(null);
  useEffect(() => {
    let timer = 0, over: Id | null = null;
    const clear = () => {
      clearTimeout(timer);
      over = null;
      setPeek((p) => (p ? null : p));
    };
    const move = (e: PointerEvent) => {
      const c = store.cam;
      if (c.z >= FAR || e.buttons || !(e.target instanceof HTMLCanvasElement)) return clear();
      const wx = c.x + e.clientX / c.z, wy = c.y + e.clientY / c.z;
      let hit: Box | null = null;
      for (const id of store.doc.order) {
        const s = store.doc.shapes[id];
        if (s?.kind === "thread" && wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h) hit = s as Box;
      }
      if (!hit) return clear();
      if (hit.id === over) return;
      clear();
      over = hit.id;
      const b = hit;
      timer = window.setTimeout(() => setPeek({ id: b.id, x: (b.x + b.w - store.cam.x) * store.cam.z + 10, y: (b.y - store.cam.y) * store.cam.z }), 220);
    };
    let bumps = store.camBumps;
    const off = store.subscribe(() => {
      if (store.camBumps !== bumps) {
        bumps = store.camBumps;
        clear();
      }
    });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", clear, true);
    return () => {
      off();
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", clear, true);
    };
  }, [store]);

  return (
    <div ref={layer} className="agents pointer-events-none absolute left-0 top-0 z-30 h-0 w-0">
      {working.map((b) => {
        const at = visitOf(b.id);
        const there = at ? (store.doc.shapes[at] as Box | undefined) : undefined;
        const p = anchor(there && "w" in there ? there : b);
        // (using a page: at the very spot it is pressing or typing)
        const spot = there ? spotOf(b.id) : undefined;
        return <Mark key={b.id} id={b.id} editor={editor} x={spot?.x ?? p.x} y={spot?.y ?? p.y} w={Math.max(p.w, 240)} press={spot?.press ? spot.t : 0} doing={spot?.label} say={said.get(b.id)} />;
      })}
      {peek && (
        <div className="agent-peek ui-in absolute" style={{ left: Math.min(peek.x, editor.view.w - 330), top: Math.max(60, Math.min(peek.y, editor.view.h - 320)) }}>
          <PeekBody id={peek.id} title={(store.doc.shapes[peek.id] as Box | undefined)?.text} />
        </div>
      )}
    </div>
  );
});

const Mark = memo(function Mark({ id, editor, x, y, w, press, doing: using, say }: { id: Id; editor: Editor; x: number; y: number; w: number; press: number; doing?: string; say?: string }) {
  const thread = useThread(id);
  const el = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // it goes over to where it is working rather than jumping there (the layer above does the moving)
  useLayoutEffect(() => {
    const m = el.current!, d = m.dataset;
    const first = d.tx === undefined;
    d.fx = first ? String(x) : (d.wx ?? String(x));
    d.fy = first ? String(y) : (d.wy ?? String(y));
    d.tx = String(x);
    d.ty = String(y);
    d.t0 = String(first ? 0 : performance.now());
    (m.parentElement as (HTMLElement & { go?: () => void }) | null)?.go?.();
  }, [x, y]);
  if (!thread) return <div ref={el} data-mark data-ww={w} hidden />;
  const { meta, items } = thread;
  const hue = hueOf(editor, id);
  const doing = meta.status !== "running" ? "Done" : using || doingNow(items, true, meta.cwd) || "Working";
  return (
    <div ref={el} data-mark data-ww={w} className="agent-mark absolute left-0 top-0" style={{ ["--hue" as string]: hue }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {press > 0 && <span key={press} className="agent-press" aria-hidden />}
      <svg className="agent-arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d="M1.5 12.5 L12 8 L7 6.8 L5.6 1.8 Z" fill="var(--hue)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <button
        type="button"
        className="agent-tag"
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          // anything but a plain press is the board's: moving it with the hand, the wheel button or space
          if (e.button === 0 && editor.store.tool === "select" && !editor.panning) return;
          e.preventDefault();
          const under = document.querySelector("canvas");
          under?.dispatchEvent(new PointerEvent("pointerdown", e.nativeEvent));
        }}
        onClick={(e) => {
          if (e.button === 0 && editor.store.tool === "select" && !editor.panning) goTo(editor, id);
        }}
      >
        <span className="agent-name">{agentName(meta.agent)}</span>
        <span className="agent-doing">{doing}</span>
      </button>
      {say && !open && <div className="agent-say">{say}</div>}
      {open && (
        <div className="agent-peek ui-in">
          <PeekBody id={id} title={(editor.store.doc.shapes[id] as Box | undefined)?.text} />
        </div>
      )}
    </div>
  );
});

/** What each thread kept off the board last said, for a few seconds after it said it (what it said before the board
 *  opened is not said again). */
const SAY_MS = 5000;
function useSaid(away: Box[], threads: ReturnType<typeof useThreads>): Map<Id, string> {
  const last = useRef(new Map<Id, string>());
  const [said, setSaid] = useState(new Map<Id, { text: string; until: number }>());
  useEffect(() => {
    let next: Map<Id, { text: string; until: number }> | null = null;
    for (const b of away) {
      const t = threads.get(b.id);
      if (!t) continue;
      const it = [...t.items].reverse().find((i) => i.kind === "text" && !i.parent && i.text);
      const key = it ? `${it.id}:${it.text!.length}` : "";
      // (only once the thread has finished saying it: a reply still being written is not shown half done, nor counted as seen)
      if (t.meta.status === "running") continue;
      const was = last.current.get(b.id);
      last.current.set(b.id, key);
      if (was === undefined || !it || key === was) continue;
      next ??= new Map(said);
      next.set(b.id, { text: it.text!.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200), until: Date.now() + SAY_MS });
    }
    if (next) setSaid(next);
    // (after every redraw: the threads are one map that changes in place, and this redraws when any thread's state does)
  });
  useEffect(() => {
    if (!said.size) return;
    const soonest = Math.min(...[...said.values()].map((v) => v.until));
    const t = setTimeout(() => setSaid((m) => new Map([...m].filter(([, v]) => v.until > Date.now()))), Math.max(0, soonest - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [said]);
  return new Map([...said].filter(([, v]) => v.until > Date.now()).map(([k, v]) => [k, v.text]));
}

export function PeekBody({ id, title }: { id: Id; title?: string }) {
  const thread = useThread(id);
  const [, tick] = useState(0);
  const running = thread?.meta.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!thread) return null;
  const { meta, items } = thread;
  const steps = lastSteps(items, meta.cwd);
  const said = [...items].reverse().find((i) => i.kind === "text" && i.text && !i.parent)?.text?.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim();
  const state = meta.asking ? "Waiting for you" : running ? `Working · ${span(Date.now() - (meta.startedAt ?? Date.now()))}` : meta.error ? "Stopped" : meta.unread ? "Ready for you" : "Idle";
  return (
    <>
      <div className="agent-peek-title">{title || meta.title || "New thread"}</div>
      <div className="agent-peek-sub">
        {agentName(meta.agent)} · {state} · {folderName(meta.cwd)}
      </div>
      {steps.length > 0 && (
        <div className="agent-peek-steps">
          {steps.map((s) => (
            <div key={s.id} data-status={s.status}>
              {s.line}
            </div>
          ))}
        </div>
      )}
      {said && <div className="agent-peek-said">{said.slice(0, 220)}</div>}
    </>
  );
}
