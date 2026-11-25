// Smiths on the board: the Smith button beside what is selected summons one over it; each smith is a small card that
// stays by what it works on, saying what it is doing and, when done, what it changed, with Undo for it. Write to it
// again to go on; close it and it is gone. (Kept where its place on the board falls on screen by hand, as the view moves, like the agents' marks.)
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowCounterClockwise, Check, KeyReturn, Sparkle, Warning, X } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import type { Box, Id, Rect } from "@weld/canvas/types";
import { isLive } from "@weld/canvas/types";
import { boundsOf } from "@weld/canvas/geometry";
import { weld, installed } from "./bridge";
import { SMITH_NOTE, SMITH_PAGE_NOTE, pageProject, dismiss, smiths, smithsVersion, keysOf, reachOf, subscribeSmiths, summon } from "./smith";
import { drawingKeys, resolve } from "./refs";
import { useThread } from "./threads";
import { doingNow } from "./ThreadNode";

/** For each smith, where its Smith button stood on the board when it was pressed (left, top, right): the box opens there. */
const summonedAt = new Map<string, { l: number; t: number; r: number }>();

export function Smiths({ editor }: { editor: Editor }) {
  const store = editor.store;
  useSyncExternalStore(subscribeSmiths, smithsVersion, () => 0);
  const layer = useRef<HTMLDivElement>(null);
  const summonBtn = useRef<HTMLButtonElement>(null);
  const [sel, setSel] = useState<{ keys: string[]; ids: Id[]; at: Rect; page?: { url: string; cwd: string } } | null>(null);

  // the Smith button stands at the selection's top right corner; each bubble at its smith's; both follow the view by hand
  useLayoutEffect(() => {
    const el = layer.current!;
    let lastSel = "";
    // where each smith's work stands on the board: worked out when the board changes, not with every frame of the view moving
    const anchors = new Map<Id, Rect>();
    let anchoredAt = "";
    const place = () => {
      if (`${store.getStill()}|${smithsVersion()}` !== anchoredAt) {
        anchoredAt = `${store.getStill()}|${smithsVersion()}`;
        anchors.clear();
        for (const f of smiths.values()) {
          const ids = [...f.ids, ...f.drew].filter((i) => store.doc.shapes[i]);
          const b = ids.length ? boundsOf(store.doc, ids) : null;
          if (b) anchors.set(f.id, b);
        }
      }
      const c = store.cam;
      const W = editor.view.w, H = editor.view.h;
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      for (const m of el.querySelectorAll<HTMLElement>("[data-at]")) {
        let [x, y] = m.dataset.at!.split(",").map(Number) as [number, number];
        // a smith's bubble goes with its work: by what it was summoned over and what it made, as they are now
        const f = m.dataset.smith ? smiths.get(m.dataset.smith) : undefined;
        const at = f && anchors.get(f.id);
        let sx = Math.round((x - c.x) * c.z), sy = Math.round((y - c.y) * c.z);
        if (f) {
          const w = m.offsetWidth + 12, h = m.offsetHeight;
          const r = at ? { x: (at.x - c.x) * c.z, y: (at.y - c.y) * c.z, w: at.w * c.z, h: at.h * c.z } : { x: sx, y: sy, w: 0, h: 0 };
          // in the window (as close to its edge as the Smith button itself goes), and off the threads, terminals and pages (a bubble over a card would hide its controls)
          const cards = store.doc.order.map((i) => store.doc.shapes[i] as Box).filter((b) => b && isLive(b)).map((b) => ({ x: (b.x - c.x) * c.z, y: (b.y - c.y) * c.z, w: b.w * c.z, h: b.h * c.z }));
          const fits = (px: number, py: number) => px >= 4 && py >= 44 && px + w <= W - 4 && py + h <= H - 84 && !cards.some((q) => px < q.x + q.w && q.x < px + w && py < q.y + q.h && q.y < py + h);
          // The bubble opens where its Smith button was pressed: growing right from it, or left from it, then above or below it; only
          // when none of those fit does it go elsewhere around the work. (The Smith button's left, top and right on screen now, from
          // where it stood on the board when pressed; the bubble's own margin, 12 left and 6 up, is taken off so its
          // corner lands on the Smith button's.)
          const p0 = summonedAt.get(f.id);
          const bl = p0 ? (p0.l - c.x) * c.z : Math.min(r.x + r.w, W - 40) + 8, bt = p0 ? (p0.t - c.y) * c.z : Math.max(r.y, 56) - 13, br = p0 ? (p0.r - c.x) * c.z : bl + 26;
          const bw = w - 12;
          const spots: [number, number][] = [[bl - 12, bt + 6], [br - bw - 12, bt + 6], [br - bw - 12, bt - h - 2], [br - bw - 12, bt + 32], [r.x - w - 12, r.y], [r.x, r.y + r.h + 12], [r.x, r.y - h - 12]];
          const spot = spots.find(([px, py]) => fits(px, py)) ?? ([Math.min(W - w - 8, Math.max(8, br - bw - 12)), Math.min(H - h - 84, Math.max(56, bt + 32))] as [number, number]);
          [sx, sy] = spot.map(Math.round) as [number, number];
          // never on top of another smith's bubble: below it instead (two drawings close together, or seen from far off)
          for (let n = 0; n < 8; n++) {
            const on = taken.find((t) => sx < t.x + t.w && t.x < sx + w && sy < t.y + t.h + 8 && t.y < sy + h + 8);
            if (!on) break;
            sy = on.y + on.h + 10;
          }
          taken.push({ x: sx, y: sy, w, h });
        }
        // the Smith button itself stays on the part of the selection that can be seen (its top right corner, within the window)
        if (!f) [sx, sy] = [Math.min(sx, W - m.offsetWidth - 16), Math.max(sy, 56)];
        m.style.transform = `translate(${sx}px, ${sy}px)`;
      }
      // what is selected (shapes on the board, not a thread being typed to), when nobody is in the middle of something
      const ids = [...store.sel];
      // (or one page, when an agent opened it and so its project is known)
      const page = ids.length === 1 && !store.busy && !store.editing ? pageProject(editor, ids[0]!) : null;
      const ok = !!page || (ids.length > 0 && !store.busy && !store.editing && ids.some((i) => store.doc.shapes[i] && !isLive(store.doc.shapes[i]!)));
      // (only a change to the board or the selection, never the view moving, sets it again)
      const key = ok ? `${ids.join(",")}|${store.getStill()}` : "";
      if (key !== lastSel) {
        lastSel = key;
        const b = ok ? boundsOf(store.doc, ids) : null;
        setSel(b ? (page ? { keys: [`live:${ids[0]}`], ids, at: b, page } : { keys: keysOf(editor, ids), ids, at: b }) : null);
      }
    };
    place();
    const off = store.subscribe(place);
    (el as HTMLDivElement & { go?: () => void }).go = place;
    return () => void off();
  }, [store, editor]);
  useLayoutEffect(() => (layer.current as HTMLDivElement & { go?: () => void } | null)?.go?.());

  const open = [...smiths.values()];
  const go = async () => {
    if (!sel) return;
    // (the Smith button as it stands on screen when pressed, kept in board terms: the box opens on that very spot)
    const btn = summonBtn.current?.getBoundingClientRect(), c = editor.store.cam;
    const at = btn ? { l: btn.left / c.z + c.x, t: btn.top / c.z + c.y, r: btn.right / c.z + c.x } : null;
    const id = await summon(editor, sel.keys, sel.page ? sel.ids : reachOf(editor, sel.ids), sel.at, sel.page);
    if (at) summonedAt.set(id, at);
    void id;
  };
  return (
    // (a point, not a sheet over the board: a layer the size of the window would be composited again with every frame)
    <div ref={layer} className="smiths pointer-events-none absolute left-0 top-0 z-30 h-0 w-0">
      {sel && sel.keys.length > 0 && installed().claude && !open.some((f) => f.keys.join("|") === sel.keys.join("|")) && (
        <button
          ref={summonBtn}
          type="button"
          aria-label="Ask AI to change this"
          title="Ask a smith, an AI helper, to change what is selected (⌘I)"
          data-at={`${sel.at.x + sel.at.w},${sel.at.y}`}
          className="smith-summon ctl pointer-events-auto absolute left-0 top-0"
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void go()}
        >
          <Sparkle size={13} weight="fill" />
          <span>Ask AI</span>
        </button>
      )}
      {open.map((f) => (
        <Bubble key={f.id} id={f.id} editor={editor} />
      ))}
    </div>
  );
}

function Bubble({ id, editor }: { id: Id; editor: Editor }) {
  const f = smiths.get(id)!;
  const thread = useThread(id);
  // (the board, for whether its last step is this smith's: Undo is offered only then)
  useSyncExternalStore(editor.store.subscribe.bind(editor.store), () => editor.store.getStill(), () => 0);
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  // taken back with its Undo: said so, with Redo, until the board moves on (anything else done clears the redo)
  const [undone, setUndone] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const meta = thread?.meta, items = thread?.items ?? [];
  const running = meta?.status === "running";
  const said = [...items].reverse().find((it) => it.kind === "text" && it.text && !it.parent)?.text;
  // (asked as soon as it is sent: the message reaches its conversation a moment later, and a click elsewhere in between
  // must not let the smith go with the request)
  const sent = useRef(false);
  const asked = sent.current || items.some((it) => it.kind === "user");
  useEffect(() => area.current?.focus(), []);
  // (while it works, the seconds it has taken count up)
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  // (what it says changes its height, and so where it may stand: placed again each time)
  useLayoutEffect(() => ((area.current?.closest(".smiths") as (HTMLElement & { go?: () => void }) | null)?.go?.()));
  const labels = () =>
    f.keys
      .map((k) => resolve(editor, k)?.label)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
  // what it works on, in a few words: the page, the drawings it was summoned over, or the empty spot
  const over = labels() || (f.ids.length ? "the selection" : "here");
  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    sent.current = true;
    setText("");
    // the first word to it says what it is and what it was summoned over; after that, only what the person writes
    const body = asked ? t : `${f.page ? SMITH_PAGE_NOTE(f.page.url) : SMITH_NOTE(labels())}\n\n${t}`;
    // (what it was summoned over, as the drawings it now makes, each once)
    const keys = [...f.keys.filter((k) => resolve(editor, k)), ...drawingKeys(editor, [...f.ids, ...f.drew].filter((x) => !f.keys.some((k) => k === `drawing:${x}` || k === `frame:${x}`)))];
    void weld.thread.send(id, { text: body, keys });
  };
  const close = () => void dismiss(id);
  // what it did is one step on the board's history: offered back while it is still the last step there
  const canUndo = !running && !f.page && editor.store.lastStepBy === f;
  const canRedo = undone && !running && editor.store.canRedo;
  if (undone && (running || !editor.store.canRedo)) queueMicrotask(() => setUndone(false));
  const state = running ? "working" : meta?.error ? "error" : canRedo ? "undone" : said ? "done" : "";
  const line = running ? doingNow(items, true, meta?.cwd) || "Working" : meta?.error ? meta.error : canRedo ? "Taken back." : said ? said.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim() : "";
  const took = running && meta?.startedAt ? Math.max(0, Math.round((now - meta.startedAt) / 1000)) : null;
  return (
    <div
      data-at={`${f.at.x + f.at.w},${f.at.y}`}
      data-smith={id}
      className="smith-bubble pointer-events-auto absolute left-0 top-0"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") close();
        // with nothing typed, ⌘Z and ⌘⇧Z are the board's: what the smith did is taken back (or brought back) from here
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !text) {
          e.preventDefault();
          editor.history(e.shiftKey ? "redo" : "undo");
        }
      }}
      onBlur={(e) => {
        // a smith never asked anything is let go when the person turns to something else
        if (asked || text.trim() || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setTimeout(() => !document.activeElement?.closest(".smith-bubble") && smiths.get(id) && !sent.current && close(), 120);
      }}
    >
      <div className="smith-head">
        <Sparkle size={13} weight="fill" className="smith-mark" />
        <span className="smith-name">Smith</span>
        {/* (what it works on, by name; a page's address is not repeated here, the page is right beside it) */}
        {!f.page && <span className="smith-over">{over}</span>}
        <button type="button" aria-label="Close the smith" title="Close" className="smith-x ctl" onMouseDown={(e) => e.preventDefault()} onClick={close}>
          <X size={12} />
        </button>
      </div>
      <div className="smith-card">
        {line && (
          <div className="smith-line" data-state={state}>
            <span className="smith-state">{state === "working" ? <span className="thread-spin" /> : state === "error" ? <Warning size={13} weight="fill" /> : state === "undone" ? <ArrowCounterClockwise size={13} weight="bold" /> : <Check size={13} weight="bold" />}</span>
            <span className="smith-said">{line}</span>
            {took !== null && <span className="smith-took">{took}s</span>}
          </div>
        )}
        {(state === "done" || state === "undone") && (
          <div className="smith-actions">
            {canUndo && <button type="button" className="smith-act ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => (editor.history("undo"), setUndone(true))}>Undo</button>}
            {canRedo && <button type="button" className="smith-act ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => (editor.history("redo"), setUndone(false))}>Redo</button>}
            <button type="button" className="smith-act ctl" onMouseDown={(e) => e.preventDefault()} onClick={close}>Done</button>
          </div>
        )}
        <div className="smith-compose">
          <textarea
            ref={area}
            rows={1}
            value={text}
            placeholder={asked ? "Anything else?" : f.page ? "What should change on this page?" : f.ids.length ? "What should change?" : "What should it draw here?"}
            className="smith-input"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" aria-label="Send" className="smith-send ctl" disabled={!text.trim() || running} onMouseDown={(e) => e.preventDefault()} onClick={send}>
            <KeyReturn size={13} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Box };
