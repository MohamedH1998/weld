// The live things, standing on the board. The canvas beneath owns where
// each one is and whether it is selected; this layer follows the camera
// and draws what is inside them. A thing takes the pointer and the keys
// only while it is the one thing selected: until then a press on it is a
// press on the board, so it is picked up and moved like any shape.
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Icon } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import { isArrow, isLive } from "@weld/canvas/types";
import type { Box, Id } from "@weld/canvas/types";
import { weld } from "./bridge";
import { BrowserNode } from "./BrowserNode";
import { addLive, awayBox, giveHues, goTo, hueOf, openBeside, ownerOf, showVisit, threadBox } from "./place";
import { useThreads } from "./threads";
import { TerminalNode } from "./TerminalNode";
import { ThreadNode } from "./ThreadNode";
import { dropFacts, factsOf, peek } from "./threads";
import { drawingKeys, payloadsOf, resolve } from "./refs";
import { smiths } from "./smith";
import { opened, openings } from "./opening";
import { aiming, picking } from "./pick";
import { draw } from "./draw";
import { guide } from "@weld/canvas/guide";
import type { DrawOps } from "./draw";
import { seesOf } from "./ThreadNode";
import { applied } from "./applied";

export interface NodeProps {
  box: Box;
  editor: Editor;
  /** The one thing selected: it has the pointer and the keys. */
  active: boolean;
  /** Seen from far off: only its name and state are shown. */
  far: boolean;
  dark: boolean;
}

/** Below this the inside of a thing is too small to read, and it shows as a card. */
export const FAR = 0.42;

export const LiveLayer = memo(function LiveLayer({ editor, dark }: { editor: Editor; dark: boolean }) {
  const store = editor.store;
  // drawn again when the board changes, or the view crosses the far line: never for the view merely moving
  useSyncExternalStore(store.subscribe, () => store.getStill() * 2 + (store.cam.z < FAR ? 1 : 0), () => 0);
  const cam = store.cam;
  const boxes = useMemo(() => store.doc.order.map((id) => store.doc.shapes[id]).filter(isLive), [store.doc]);
  const one = store.sel.size === 1 ? [...store.sel][0]! : null;
  const activeId = one && isLive(store.doc.shapes[one]) && store.tool === "select" && !editor.overlay.busy ? one : null;
  // what belongs together is shown together: a thread in hand outlines what it made; a thing it made outlines its thread and the rest
  const family = one ? ownerOf(editor, one) : null;
  // …and the other threads working in the same folder as a thread in hand (they change the same files)
  const threadsNow = useThreads();
  const peers = useMemo(() => {
    const out = new Set<Id>();
    if (!one || store.doc.shapes[one]?.kind !== "thread") return out;
    const dir = (id: Id) => { const m = threadsNow.get(id)?.meta; return m?.workspace || m?.cwd?.replace(/\/+$/, ""); };
    const mine = dir(one);
    if (!mine) return out;
    for (const b of boxes) if (b.kind === "thread" && b.id !== one && dir(b.id) === mine) out.add(b.id);
    return out;
  }, [one, boxes, threadsNow, store.doc.shapes]);
  // …and what it has been connected to (a thread in hand), or the threads connected to it (anything else in hand)
  const linked = useMemo(() => {
    const ids = new Set<Id>();
    let color: string | null = null;
    if (!one) return { ids, color };
    const sel = store.doc.shapes[one];
    if (sel?.kind === "thread") {
      color = hueOf(editor, one);
      for (const k of seesOf(editor, one)) for (const x of resolve(editor, k)?.ids ?? []) ids.add(x);
    } else {
      for (const t of store.doc.order) {
        const b = store.doc.shapes[t];
        if (b?.kind !== "thread") continue;
        if (seesOf(editor, t).some((k) => resolve(editor, k)?.ids.includes(one))) {
          ids.add(t);
          color ??= hueOf(editor, t);
        }
      }
    }
    return { ids, color };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [one, store.doc]);
  useEffect(() => {
    const drawn = new Set([...linked.ids].filter((x) => !isLive(store.doc.shapes[x])));
    editor.overlay.kin = drawn.size && linked.color ? { ids: drawn, color: linked.color } : null;
    editor.invalidate();
  }, [linked, editor, store]);
  // which threads are on the board, told to the app whenever that changes (T3 Code is offered only these)
  // (and those kept off the board, read from the bar: they are on it as much as any)
  const away = store.doc.away;
  const threadIds = useMemo(() => [...boxes.filter((b) => b.kind === "thread").map((b) => b.id), ...Object.keys(away ?? {})].join("\n"), [boxes, away]);
  useEffect(() => {
    if (!store.persist) return;
    weld.board.threads(threadIds ? threadIds.split("\n") : [], !store.loadFailed, weld.info.board?.id);
  }, [threadIds, store]);
  // T3 Code's first message in a new session: its thread's card, put down without moving the person's view
  useEffect(
    () =>
      weld.onAcpNew(({ id, cwd, req }) => {
        if (!editor.store.doc.shapes[id]) addLive(editor, "thread", { cwd, ready: true }, "", true, id);
        weld.acpMade(req);
      }),
    [editor],
  );
  // the agent draws: added, joined, changed, taken away, as a collaborator does
  useEffect(
    () =>
      weld.onDraw(({ thread, req, ops }) => {
        // the person is in the middle of moving or making something: the agent's change waits for them to finish
        const go = (tries: number) => {
          if ((editor.store.busy || editor.overlay.busy) && tries < 80) return void setTimeout(() => go(tries + 1), 100);
          // (still at it after all that: nothing is done over what they are doing, and the agent is told to try again)
          if (editor.store.busy || editor.overlay.busy) return void weld.drew(req, { made: {}, changed: 0, removed: 0, problems: ["not done: the person is in the middle of changing the board; try again in a moment"], held: 1 });
          let r;
          try {
            r = draw(editor, thread, ops as DrawOps);
          } catch (e) {
            r = { made: {}, changed: 0, removed: 0, problems: [String((e as Error)?.message ?? e)] };
          }
          weld.drew(req, r);
        };
        go(0);
      }),
    [editor, store],
  );
  // the agent asks how to draw: the guide, the notation and helpers, or one template or accepted diagram as a story
  useEffect(() => weld.onGuide(({ req, name }) => weld.guided(req, guide(name))), []);
  // the agent wants to use a page: the ones it opened, and the ones it was shown
  useEffect(
    () =>
      weld.onPages(({ thread, req }) => {
        const ids = new Set<Id>();
        // (a conversation no longer on the board uses nothing)
        if (!threadBox(editor, thread) && !smiths.get(thread)) return weld.pagesAre(req, []);
        for (const x of store.doc.order) if ((store.doc.shapes[x] as Box | undefined)?.live?.by === thread) ids.add(x);
        if (!smiths.get(thread)) for (const k of seesOf(editor, thread)) for (const x of resolve(editor, k)?.ids ?? []) ids.add(x);
        const list = [...ids].flatMap((x) => {
          const b = store.doc.shapes[x] as Box | undefined;
          return b?.kind === "browser" ? [{ id: x, name: (b.text || b.live?.url || "page").slice(0, 80), webContentsId: factsOf(x)?.webContentsId }] : [];
        });
        weld.pagesAre(req, list);
      }),
    [editor],
  );
  // (a page being used is laid out, in sight or not; counted, as two agents may use one page at once)
  useEffect(
    () =>
      weld.onUsing(({ at, on }) => {
        // (a page let go is loaded again, and kept from then on: it now holds what the agent did in it)
        if (on) window.dispatchEvent(new CustomEvent("weld:use", { detail: at }));
        const body = document.querySelector<HTMLElement>(`[data-live="${CSS.escape(at)}"] .live-body`);
        if (!body) return;
        const n = Math.max(0, Number(body.dataset.used ?? 0) + (on ? 1 : -1));
        if (n) body.dataset.used = String(n);
        else delete body.dataset.used;
      }),
    [],
  );
  // …and its mark goes to the spot it uses
  useEffect(
    () =>
      weld.onPoint(({ thread, at, x, y, press, label }) => {
        const b = store.doc.shapes[at] as Box | undefined;
        const view = document.querySelector<HTMLElement>(`[data-live="${CSS.escape(at)}"] webview`);
        const board = document.querySelector("canvas")?.getBoundingClientRect();
        if (!b || !view || !board) return showVisit(thread, at);
        const r = view.getBoundingClientRect(), k = view.offsetWidth ? r.width / view.offsetWidth : 0, c = store.cam;
        // (a page asleep behind its still has no size of its own: the mark goes to the page)
        if (!k) return showVisit(thread, at);
        showVisit(thread, at, { x: c.x + (r.left - board.left + x * k) / c.z, y: c.y + (r.top - board.top + y * k) / c.z, press, label });
      }),
    [editor],
  );
  // the agent asks to look again: what its thread is connected to, as it is now
  useEffect(
    () =>
      weld.onLook(({ thread, req, keys }) => {
        // (asked by the agent to look: what it opened is shown too, with where each stands)
        // (and the pictures it put on the board)
        const own = keys
          ? []
          : store.doc.order.flatMap((x) => {
              const b = store.doc.shapes[x] as Box | undefined;
              return b?.live?.by === thread ? [`live:${x}`] : b?.kind === "image" && b.img?.by === thread && !b.away ? [`image:${x}`] : [];
            });
        // (a smith sees what it was summoned over, and what it has made since)
        const smith = smiths.get(thread);
        const theirs = smith ? [...smith.keys, ...drawingKeys(editor, [...smith.ids, ...smith.drew])] : seesOf(editor, thread);
        // (each thing once, however many keys name it)
        const seen = new Set<string>();
        const asked = [...new Set([...(keys ?? theirs), ...own])].filter((k) => {
          const r = resolve(editor, k);
          const sig = r ? [...r.ids].sort().join(",") : "";
          if (!r || seen.has(sig)) return false;
          seen.add(sig);
          return true;
        });
        // …and, asked by the agent, where its own conversation stands
        const me = (smith ? { id: thread, ...smith.at } : threadBox(editor, thread)) as Box | undefined;
        // (with what the person's window shows of the board now, so what is drawn can be put where it will be seen)
        const c = store.cam, v = editor.view;
        const view = { x: Math.round(c.x), y: Math.round(c.y + 52 / c.z), w: Math.round(v.w / c.z), h: Math.round((v.h - 52 - 76) / c.z) };
        const self = !keys && me ? [{ key: "self", id: thread, kind: "self", label: smith ? "where you were summoned" : "this conversation", place: { x: Math.round(me.x), y: Math.round(me.y), w: Math.round(me.w), h: Math.round(me.h) }, view }] : [];
        // …and where everything else stands (places only: what is not shared stays unseen), nearest first
        if (self.length) {
          const shown = new Set(asked.flatMap((k) => resolve(editor, k)?.ids ?? []));
          const near = (b: Box) => Math.hypot(b.x - me!.x, b.y - me!.y);
          const name = (b: Box) => (b.kind === "browser" ? "page" : b.kind === "thread" ? "conversation" : b.kind === "terminal" ? "terminal" : "shape");
          const rest = store.doc.order.map((x) => store.doc.shapes[x] as Box).filter((b) => b && "w" in b && !isArrow(b) && b.id !== thread && !shown.has(b.id));
          const taken = rest.sort((a, b) => near(a) - near(b)).slice(0, 30).map((b) => `${name(b)} at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`);
          if (taken.length) self.push({ key: "taken", id: thread, kind: "taken", label: taken.join("; ") } as (typeof self)[number]);
        }
        void payloadsOf(editor, asked).then((all) => weld.looked(req, [...self, ...all]), () => weld.looked(req, self));
      }),
    [editor],
  );
  // Crossing the far line is shown at once, by the plane itself (see below); what the things inside do about it
  // (giving up a canvas, letting a page sleep) follows a moment later, without holding up the frame.
  const far = useDeferredValue(cam.z < FAR);

  // every thread wears a colour of its own
  useEffect(() => giveHues(editor), [boxes, editor]);
  // a thing that has left the board (and has not come back by undo) is shut down
  const alive = useRef(new Map<Id, Box["kind"]>());
  const doomed = useRef(new Map<Id, ReturnType<typeof setTimeout>>());
  /** What each thing was, remembered for when it has gone. */
  const gone = useRef(new Map<Id, NonNullable<Box["live"]>>());
  useEffect(() => {
    // (a thread kept off the board, read from the bar, has not left it)
    const now = new Map<Id, Box["kind"]>([...boxes.map((b) => [b.id, b.kind] as const), ...Object.keys(away ?? {}).map((id) => [id, "thread"] as const)]);
    for (const [id, kind] of alive.current) {
      if (now.has(id) || doomed.current.has(id)) continue;
      void kind;
      // started from the empty board and taken away again straight after: what it was asked is not done
      if (kind === "thread") {
        openings.delete(id);
        const at = opened.get(id);
        if (at && Date.now() - at < 120000) {
          // and what it started (a server, a clock) goes with it
          void weld.thread.stop(id);
          for (const s of peek(id)?.meta.services ?? []) void weld.thread.unservice(id, s.id);
        }
        opened.delete(id);
      }
      doomed.current.set(id, setTimeout(() => {
        doomed.current.delete(id);
        // (a terminal showing a thread's background command only stops showing it; a thread that goes takes what it left running)
        if (kind === "terminal" && !gone.current.get(id)?.svc) void weld.pty.close(id);
        if (kind === "thread") {
          void weld.thread.stop(id);
          for (const s of peek(id)?.meta.services ?? []) void weld.thread.unservice(id, s.id);
        }
        gone.current.delete(id);
        dropFacts(id);
        alive.current.delete(id);
      }, 300000));
    }
    for (const id of now.keys()) {
      const t = doomed.current.get(id);
      if (t) {
        clearTimeout(t);
        doomed.current.delete(id);
      }
    }
    // kept on the board for a while after leaving, so undo brings back the very same shell
    alive.current = new Map([...alive.current, ...now]);
    for (const b of boxes) gone.current.set(b.id, b.live ?? {});
  }, [boxes, away]);

  // a link that asks for a new window opens as a page beside the one it came from
  useEffect(
    () =>
      weld.onOpen(({ url, from }) => {
        let source: Id | null = null;
        if (from !== null) for (const b of boxes) if (factsOf(b.id)?.webContentsId === from) source = b.id;
        openBeside(editor, source ?? activeId, "browser", { url });
      }),
    [editor, boxes, activeId],
  );

  // what a shell or an agent asked for: a page, or a terminal running something, beside whoever asked
  useEffect(
    () =>
      weld.onDo((o) => {
        // (something asked of this board while it was away: crossed off once the board is saved with it done)
        if (o.key) applied.add(o.key);
        const from = o.from && (isLive(store.doc.shapes[o.from]) || awayBox(editor, o.from)) ? o.from : null;
        // an agent's (or a shell's) doing, not the person's: put down without moving their view, taking what they hold, or entering their undoing
        if (o.op === "open") openBeside(editor, from, "browser", { url: o.url }, "", false, true);
        else {
          // the same command again, from the same thread, in the same folder, is that terminal started over, not another one
          const owner = ownerOf(editor, from);
          const again = owner
            ? store.doc.order.map((id) => store.doc.shapes[id] as Box).find((b) => b?.kind === "terminal" && b.live?.from === owner && b.live?.cmd === o.command && (!o.cwd || b.live?.cwd === o.cwd))
            : undefined;
          if (again && !factsOf(again.id)?.dead) {
            void weld.pty.rerun(again.id, o.command);
            showVisit(owner!, again.id);
          } else openBeside(editor, from, "terminal", { cwd: o.cwd, run: o.command, cmd: o.command }, o.command.length > 40 ? `${o.command.slice(0, 40)}…` : o.command, false, true);
        }
      }),
    [editor, store],
  );

  // the view is followed by hand, outside React: moving it sets one transform and nothing else.
  // While the zoom is changing, what is drawn is scaled as a picture; it is drawn afresh, sharp, once the zoom rests.
  // The cards alone are told the zoom: told to the whole plane, every word in every thread would be restyled each frame.
  const plane = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = plane.current!;
    let z = NaN, x = NaN, y = NaN, rest = 0, cards: HTMLElement[] | null = null, hand: HTMLElement | false | null = null, wasFar = false;
    const follow = () => {
      const c = store.cam;
      const isFar = c.z < FAR;
      if (isFar !== wasFar) {
        // seen from far off, every thing shows as its card; close to, as itself. The cards are always there, so this is all it takes.
        if (isFar) el.dataset.far = "1";
        else delete el.dataset.far;
        wasFar = isFar;
        if (isFar)
          for (const card of el.querySelectorAll<HTMLElement>(".far-card, .far-caption")) {
            card.style.setProperty("--z", String(c.z));
            card.dataset.zr = String(c.z);
            card.style.setProperty("--s", "1");
          }
      }
      if (c.x !== x || c.y !== y || c.z !== z) el.style.transform = `translate(${-c.x * c.z}px, ${-c.y * c.z}px) scale(${c.z})`;
      if (c.z !== z) {
        const moving = !Number.isNaN(z);
        if (moving) {
          // (set once as the zoom starts: set again at every step, the whole board's style was worked out again each time)
          if (!el.dataset.zooming) el.dataset.zooming = "1";
          clearTimeout(rest);
          rest = window.setTimeout(() => {
            delete el.dataset.zooming;
            // at rest: each card's words are laid out afresh at the size that reads, and drawn as they are
            for (const card of cards ?? []) {
              card.style.setProperty("--z", String(store.cam.z));
              card.dataset.zr = String(store.cam.z);
              card.style.setProperty("--s", "1");
            }
            cards = null;
            hand = null;
          }, 160);
        }
        // While the zoom moves, a card's words are not laid out again at every step (that is most of the cost of
        // zooming far off): they keep the layout they had at rest and are scaled, as a picture, to the size they will have.
        if (c.z < FAR)
          for (const card of (cards ??= [...el.querySelectorAll<HTMLElement>(".far-card, .far-caption")])) {
            if (!moving || !card.dataset.zr) {
              card.style.setProperty("--z", String(c.z));
              card.dataset.zr = String(c.z);
              card.style.setProperty("--s", "1");
              continue;
            }
            const w = Number(card.dataset.w), h = Number(card.dataset.h || 1e9);
            const k = (zz: number) => Math.max(1, Math.min(1 / zz, 5.5, w / 190, h / 96));
            card.style.setProperty("--s", String(k(c.z) / k(Number(card.dataset.zr))));
          }
        // …and the one thing in hand, whose corners are cut to a size on screen
        hand ??= el.querySelector<HTMLElement>(".is-active > .live-sheet") ?? false;
        if (hand) hand.style.setProperty("--z", String(c.z));
      }
      x = c.x; y = c.y; z = c.z;
    };
    follow();
    const off = store.subscribe(follow);
    return () => { off(); clearTimeout(rest); };
  }, [store]);
  // cards arrive when this is drawn again (the far line crossed, a thing put down): told the zoom as they do
  useLayoutEffect(() => {
    if (store.cam.z < FAR)
      for (const card of plane.current!.querySelectorAll<HTMLElement>(".far-card, .far-caption")) {
        if (card.dataset.zr) continue;
        card.style.setProperty("--z", String(store.cam.z));
        card.dataset.zr = String(store.cam.z);
      }
    plane.current!.querySelector<HTMLElement>(".is-active > .live-sheet")?.style.setProperty("--z", String(store.cam.z));
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-live-layer>
      <div
        ref={plane}
        className="live-plane absolute left-0 top-0 origin-top-left"
        style={{ width: 0, height: 0 }}
      >
        {boxes.map((b) => (
          <Slot key={b.id} box={b} editor={editor} active={activeId === b.id} far={far} dark={dark} keep={alive.current.has(b.id)} kin={(!!family && b.id !== one && ownerOf(editor, b.id) === family) || linked.ids.has(b.id)} kinHue={linked.ids.has(b.id) ? (linked.color ?? undefined) : undefined} hue={ownerOf(editor, b.id) ? hueOf(editor, ownerOf(editor, b.id)!) : undefined} peer={peers.has(b.id)} />
        ))}
      </div>
    </div>
  );
});

const Slot = memo(function Slot(p: NodeProps & { keep: boolean; kin: boolean; hue?: string; kinHue?: string; peer?: boolean }) {
  const { box, active, kin, hue, kinHue, peer } = p;
  // appears in place: a thing just put down settles in, one that was already there does not
  const [fresh] = useState(() => !p.keep);
  return (
    <div
      data-live={box.id}
      data-kind={box.kind}
      data-active={active || undefined}
      className={`live-node absolute ${fresh ? "live-in" : ""} ${active ? "is-active" : ""} ${kin ? "is-kin" : ""} ${peer ? "is-peer" : ""}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ...(hue ? { ["--hue" as string]: hue } : {}), ...(kinHue ? { ["--kin" as string]: kinHue } : {}) }}
      onPointerDownCapture={(e) => {
        // talking to another thread with its @ list open, or with ⌘ held: this is pointed at, not taken in hand
        if (e.button === 0 && aiming(e.metaKey) && picking.thread !== box.id) {
          e.preventDefault();
          e.stopPropagation();
          // the press points; it presses nothing (no button inside it is clicked, Allow above all)
          const swallow = (ev: Event) => (ev.stopPropagation(), ev.preventDefault());
          for (const t of ["pointerup", "mouseup", "click", "dblclick"]) window.addEventListener(t, swallow, { capture: true, once: true });
          setTimeout(() => { for (const t of ["pointerup", "mouseup", "click", "dblclick"]) window.removeEventListener(t, swallow, { capture: true }); }, 800);
          picking.add?.(`live:${box.id}`);
          return;
        }
        // a press on one of its controls takes it in hand, as a press on the board would
        const s = p.editor.store;
        if (s.sel.size === 1 && s.sel.has(box.id)) return;
        if (s.tool !== "select") s.setTool("select");
        s.select([box.id]);
        s.emit();
        p.editor.invalidate();
      }}
    >
      {box.kind === "thread" ? <ThreadNode {...p} /> : box.kind === "terminal" ? <TerminalNode {...p} /> : <BrowserNode {...p} />}
    </div>
  );
});

/** The card a thing shows when seen from far off: what it is, what it is called, how it stands. Its letters hold a readable size on screen for as long as the card can hold them. */
export function FarCard({ w, h, icon: I, title, line, state, note }: { w: number; h: number; icon: Icon; title: string; line?: string; state: "working" | "ready" | "error" | "quiet"; note?: string }) {
  // sized by the board's own zoom (--z, set on the layer), so zooming redraws nothing here
  const k = `max(1, min(calc(1 / var(--z)), 5.5, ${w / 190}, ${h / 96}))`;
  const roomy = h / Math.max(1, Math.min(5.5, w / 190, h / 96)) > 150;
  return (
    <div className="far-card absolute inset-0 flex flex-col overflow-hidden rounded-[12px]" data-state={state} data-roomy={roomy || undefined} data-w={w} data-h={h} style={{ ["--k" as string]: k, padding: "calc(13px * var(--k))", gap: "calc(8px * var(--k))" }}>
      <div className="flex shrink-0 items-center text-(--live-sub)" style={{ gap: "calc(6px * var(--k))", fontSize: "calc(11px * var(--k))", lineHeight: 1.3 }}>
        <I size="1.27em" className="shrink-0" />
        <span className="far-state truncate font-medium">{note ?? (state === "working" ? "Working" : state === "ready" ? "Ready for you" : state === "error" ? "Stopped" : "")}</span>
      </div>
      <div className="far-words flex min-h-0 flex-1 flex-col">
        <div className="far-title shrink-0 font-medium text-(--live-ink)" style={{ fontSize: "calc(15px * var(--k))", lineHeight: 1.25, letterSpacing: "-0.01em" }}>{title}</div>
        {line && <div className="far-line line-clamp-2 shrink-0 text-(--live-sub)" style={{ fontSize: "calc(11.5px * var(--k))", lineHeight: 1.35, marginTop: "calc(5px * var(--k))" }}>{line}</div>}
      </div>
    </div>
  );
}
/** A folded thread seen from far off: its title, at a size that reads, on a bar as wide as the thread (it may stand taller than the thread does). */
export function FarBar({ w, title, state, note }: { w: number; title: string; state: "working" | "ready" | "error" | "quiet"; note?: string }) {
  const k = `max(1, min(calc(1 / var(--z)), 5.5, ${w / 190}))`;
  const word = note ?? (state === "working" ? "Working" : state === "ready" ? "Ready" : state === "error" ? "Stopped" : "");
  return (
    <div className="far-card far-bar absolute inset-x-0 top-0 flex items-center rounded-[10px]" data-state={state} style={{ ["--k" as string]: k, padding: "calc(7px * var(--k)) calc(11px * var(--k))", gap: "calc(7px * var(--k))", fontSize: "calc(13px * var(--k))", lineHeight: 1.25 }}>
      <span className="live-dot shrink-0" data-state={state} aria-hidden style={{ width: "calc(7px * var(--k))", height: "calc(7px * var(--k))" }} />
      <span className="far-title min-w-0 flex-1 truncate font-medium text-(--live-ink)">{title}</span>
      {word && <span className="far-state shrink-0 font-medium" style={{ fontSize: "0.85em" }}>{word}</span>}
    </div>
  );
}
/** A page seen from far off still shows itself: only its name is written over it, at a size that reads. */
export function FarCaption({ w, title, busy }: { w: number; title: string; busy: boolean }) {
  const k = `max(1, min(calc(1 / var(--z)), 5.5, ${w / 190}))`;
  return (
    <div className="far-caption absolute inset-x-0 bottom-0 flex items-center overflow-hidden rounded-b-[12px]" data-w={w} style={{ ["--k" as string]: k, padding: "calc(8px * var(--k)) calc(13px * var(--k))", gap: "calc(7px * var(--k))", fontSize: "calc(13px * var(--k))", lineHeight: 1.3 }}>
      {busy && <span className="live-dot shrink-0" data-state="working" style={{ width: "calc(7px * var(--k))", height: "calc(7px * var(--k))" }} />}
      <span className="truncate font-medium">{title}</span>
    </div>
  );
}

/** Whose it is: the thread a page or a terminal came from, in that thread's colour. A press goes to the thread. */
export function Owner({ box, editor }: { box: Box; editor: Editor }) {
  const threads = useThreads();
  const from = box.live?.from;
  const s = from ? (editor.store.doc.shapes[from] as Box | undefined) : undefined;
  if (!from || !s) return null;
  const name = s.text || threads.get(from)?.meta.title || "New thread";
  return (
    <button type="button" className="live-owner ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => goTo(editor, from)}>
      <span className="live-owner-dot" />
      <span className="truncate">{name}</span>
    </button>
  );
}

/** The strip along the top of a live thing. Presses on it fall through to the board (it is how the thing is carried); its controls take their own. */
export function Head({ children, state }: { children: React.ReactNode; state?: "working" | "ready" | "error" | "quiet" }) {
  return (
    <div className="live-head flex h-10 shrink-0 items-center gap-2 pl-3 pr-2" data-state={state}>
      {children}
    </div>
  );
}
export function Dot({ state }: { state: "working" | "ready" | "error" | "quiet" }) {
  return <span className="live-dot" data-state={state} aria-hidden />;
}
/** A small control in a head or a composer. */
export function Chip({ children, onClick, title, active, disabled }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; title?: string; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} onMouseDown={(e) => e.preventDefault()} className={`live-chip ctl ${active ? "is-on" : ""}`}>
      {children}
    </button>
  );
}
