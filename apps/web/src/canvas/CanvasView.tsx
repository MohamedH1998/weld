// The board: one canvas that fills the window, and the few controls
// around it. Controls appear only when there is something to act on.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Tooltip, TooltipProvider } from "@cloudflare/kumo/components/tooltip";
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowElbowDownRight, ArrowUpRight, ArrowsHorizontal, ArrowRight,
  AlignBottomSimple, AlignCenterHorizontalSimple, AlignCenterVerticalSimple, AlignLeftSimple, AlignRightSimple, AlignTopSimple,
  ArrowsOutLineHorizontal, ArrowsOutLineVertical,
  Circle, Cursor, Eye, EyeSlash, Path, Sparkle, ArrowUUpLeft, Plugs, DotsThree, CaretLeft, Prohibit, Cpu, Repeat, Diamond, DotsSix, DotsSixVertical, FilmStrip, Trash, Hand, LineSegment, Pause, Play, Shapes, Stop, TreeStructure, Minus, Plus, Rectangle, TextT,
  TextAlignLeft, TextAlignCenter, TextAlignRight, GitFork, GitMerge, BezierCurve, CaretDown, Check, Sun, Moon, Desktop,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Editor } from "@weld/canvas/editor";
import { save, toPNG, toSVG } from "@weld/canvas/export";
import { DOC_KEY } from "@weld/canvas/store";
import type { PointerInput } from "@weld/canvas/editor";
import { layoutText, ARROW_LABEL_SIZE, ARROW_LABEL_W, arrowLabelRect, clearTextCache, FONT, LABEL_SIZE, face, FACE_LIST, faceFonts, onFacesArrive, wrapAt, labelColor, labelWidth, LINE, labelOnLine, MONO, paintPorts, paintShape, render, setAccent, setBlack, setFace, setGround, setLook, themeFor, WEIGHT } from "@weld/canvas/render";
import { bounds, boundsOf, overlaps } from "@weld/canvas/geometry";
import { textLayout } from "@weld/canvas/render";
import { newId } from "@weld/canvas/types";
import { isBasic, KINDS, LIBRARY } from "@weld/canvas/kinds";
import { curve } from "@weld/canvas/anim";
import { ACCEPTED } from "./accepted";
import { PATTERNS } from "@weld/canvas/patterns";
import { ShareBar } from "./ShareBar";
import { setThemePref, THEME_EVENT, THEMES, themePref, wantsDark } from "./theme";
import type { ThemePref } from "./theme";
import { offerTools } from "./agent";
import type { StampDef } from "@weld/canvas/stamps";
import { labelSpot, labelTrack, setShapeLook, voiced, legendLines } from "@weld/canvas/shapes";
import { isArrow, isBox, isText } from "@weld/canvas/types";
import type { Text as TextShape } from "@weld/canvas/types";
import { DEFAULTS, DOCK_NAMES, readVariant } from "./switches";
import type { Dock, Variant } from "./switches";
import type { Face } from "@weld/canvas/render";
import type { Box, Arrow, BoxKind, Doc, Fill, Id, Line, Pt, Rect, Shape, Tone, Tool } from "@weld/canvas/types";

const TOOLS: { tool: Tool; icon: Icon; name: string; key: string }[] = [
  { tool: "select", icon: Cursor, name: "Select", key: "V" },
  { tool: "hand", icon: Hand, name: "Move around", key: "H" },
  { tool: "rect", icon: Rectangle, name: "Rectangle", key: "R" },
  { tool: "ellipse", icon: Circle, name: "Ellipse", key: "O" },
  { tool: "diamond", icon: Diamond, name: "Diamond", key: "D" },
  { tool: "arrow", icon: ArrowUpRight, name: "Arrow", key: "A" },
  // (a line with no heads: straight, snapping level and upright, and bent by pulling its middle)
  { tool: "line", icon: LineSegment, name: "Line", key: "L" },
  { tool: "text", icon: TextT, name: "Text", key: "T" },
];
const TONES: Tone[] = ["ink", "muted", "accent", "green", "amber", "red", "violet", "teal"];
const TONE_NAMES: Record<Tone, string> = { ink: "Black", muted: "Grey", accent: "Blue", green: "Green", amber: "Amber", red: "Red", violet: "Violet", teal: "Teal" };

const NONE: Set<Id> = new Set();
const PANEL = "rounded-[10px] bg-kumo-base shadow-[0_2px_8px_rgba(0,0,0,0.05)] ring ring-kumo-line dark:shadow-none";
const CELL = "ctl flex size-8 shrink-0 pointer-coarse:size-10 items-center justify-center rounded-md text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]";

function Tip({ label, keys, children, side = "top" }: { label: string; keys?: string; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip
      side={side}
      content={
        <span className="flex items-center gap-2">
          {label}
          {keys && <kbd className="font-sans text-[11px] opacity-60">{keys}</kbd>}
        </span>
      }
      render={children}
    />
  );
}

/** The board; with `board`, the shared board at that secret key, kept in step with the server and everyone else on it. */
/** A board on its way to a link (Share, or a new link): the same editor, handed to the board page that opens there, so
 *  nothing reloads and the board stays exactly where it is on screen. */
let handoff: { key: string; editor: Editor; copied: boolean } | null = null;

export function CanvasView({ board, catalogue }: { board?: string; catalogue?: boolean } = {}) {
  // (React may ask twice in development: both see the same hand-off, which is let go once the board is up)
  const [handed] = useState(() => (board && handoff?.key === board ? handoff : null));
  const editor = useMemo(() => handed?.editor ?? new Editor(), [handed]);
  const navigate = useNavigate();
  const store = editor.store;
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dark, setDark] = useState(false);
  const [moved, setMoved] = useState(false);
  const [unsaved, setUnsaved] = useState<string | null>(null);
  // (where this browser itself asked the board to move to, if it did: see ShareBar)
  const movedTo = (() => { try { return board && moved ? sessionStorage.getItem(`canvas:moving:${board}`) : null; } catch { return null; } })();
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const goLiveRef = useRef<(key: string, copied: boolean) => void>(() => {});
  const [menu, setMenu] = useState<{ x: number; y: number; onShape: boolean; locked: Id | null } | null>(null);
  const [ready, setReady] = useState(false);
  const [v, setV] = useState<Variant>(DEFAULTS);

  // ── painting ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dirty = true;
    let raf = 0;
    let dpr = window.devicePixelRatio || 1;
    let sized = false;
    editor.invalidate = () => {
      dirty = true;
    };
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // what was in the middle of the window stays in the middle
      if (sized) {
        const c = store.cam;
        store.cam = { x: c.x + (editor.view.w - w) / 2 / c.z, y: c.y + (editor.view.h - h) / 2 / c.z, z: c.z };
      }
      sized = true;
      editor.view = { w, h };
      dirty = true;
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // (see /lab) a study board can ask for its own ground: dark or light whatever the system says, and ruled, dotted or bare
    const asked = new URLSearchParams(window.location.search);
    setGround(asked.get("ground") === "lines" ? "lines" : asked.get("ground") === "none" ? "none" : "dots");
    if (asked.get("accent") === "orange") setAccent("#c2500f", "#e0661f");
    if (asked.get("accent") === "ink") setAccent("#1c1c1c", "#f0f0f0");
    if (asked.get("theme") === "black") setBlack("#0a0a0a");
    // a face something is set in may arrive after it is first drawn: draw again when it does
    onFacesArrive(() => { clearTextCache(); dirty = true; });
    // the faces it is set in: asked for by a study board, or as chosen here before (see the board's own menu)
    const faceAsked = asked.get("face") === "geist" ? "geist" : asked.get("demo") === "1" ? null : (localStorage.getItem(FACE_KEY) as Face | null);
    if (faceAsked && faceAsked !== "figtree" && (faceAsked === "geist" || FACE_LIST.some((f) => f.id === faceAsked))) chooseFace(editor, faceAsked, false);
    // light or dark: as the address asks (a study board), else as chosen on the board, else as the system is
    const dark = () => wantsDark(asked.get("theme"), themePref(), mq.matches);
    let isDark = dark();
    const onScheme = () => {
      isDark = dark();
      document.documentElement.dataset.mode = isDark ? "dark" : "light";
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
      setDark(isDark);
      dirty = true;
    };
    onScheme();
    mq.addEventListener("change", onScheme);
    window.addEventListener(THEME_EVENT, onScheme);
    resize();
    window.addEventListener("resize", resize);
    const variant = readVariant(window.location.search);
    // where the tools were last put, unless the address says otherwise
    if (!variant.demo && !new URLSearchParams(window.location.search).has("dock")) {
      try {
        const saved = localStorage.getItem(DOCK_KEY) as Dock | null;
        if (saved && DOCK_NAMES.includes(saved)) variant.dock = saved;
      } catch {
        /* storage blocked */
      }
    }
    setV(variant);
    editor.opts = { arm: variant.arm, connect: variant.connect, snap: variant.snap, attach: variant.attach };
    // (this board has no live things: c and b are the card and the boundary)
    editor.liveKeys = false;
    setLook(variant.ink, variant.label === "on");
    setShapeLook(variant.voice, variant.paper === "opaque", variant.notch === "on");
    // the switch starts off; where there is no switch the controls simply show (and a lab board is there to show them)
    editor.motion = !!variant.scene && !variant.still;
    let live: ReturnType<typeof follow> | null = null;
    if (catalogue) {
      // the catalogue (/catalogue): every kept drawing on one board, nothing saved; take what you want with ⌘C
      store.persist = false;
      editor.motion = true;
      void layCatalogue(editor);
    } else if (board) {
      store.persist = false;
      store.shared = true;
      live = follow(editor, board, () => setMoved(true), setUnsaved, { keepView: !!handed });
      flushRef.current = live.flush;
      if (handed) handoff = null;
    } else if (variant.demo) {
      store.persist = false;
      seedDemo(editor, variant);
    } else {
      store.load();
      if (!localStorage.getItem("canvas:cam:v1")) store.cam = { x: -window.innerWidth / 2, y: -window.innerHeight / 2, z: 1 };
    }
    setReady(true);
    // the label face is asked for by name: a font is only fetched once something is set in it,
    // and words measured before it arrives would be laid out to the wrong width
    void Promise.all([document.fonts?.load('400 12px "Figtree Variable"'), document.fonts?.load('500 12px "Figtree Variable"'), document.fonts?.load('700 12px "Figtree Variable"'), document.fonts?.ready]).then(() => {
      clearTextCache();
      editor.refit();
      dirty = true;
    });
    let rest = 0;
    const frame = () => {
      editor.tick();
      if (dirty) {
        dirty = false;
        // while a group plays, every frame is a new picture, and nothing is shown as selected
        const th = themeFor(isDark), playing = !!editor.playing;
        // (a picture put together from tiles while the view moves is drawn exactly once it comes to rest)
        if (render(ctx, { ...editor.view, dpr }, editor.viewDoc(th), store.cam, playing ? NONE : store.sel, store.editing, editor.overlay, th, store.grid)) rest = performance.now() + 140;
        else rest = 0;
        if (playing) dirty = true;
      } else if (rest && performance.now() >= rest) {
        rest = 0;
        dirty = true;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // a board with moments shows them, however it got here (opened again, followed, saved by another tab), until the
    // switch is turned off by hand
    const showMoments = () => {
      if (!editor.motion && !editor.motionChosen && !variant.still && store.doc.scenes && Object.keys(store.doc.scenes).length) {
        editor.motion = true;
        queueMicrotask(() => store.emit());
      }
    };
    showMoments();
    const unsub = store.subscribe(() => {
      dirty = true;
      showMoments();
    });
    // whatever is being typed is saved before the page goes away
    const flush = () => {
      editor.rest();
      store.saveNow();
    };
    // the same board open in another tab: follow what it saves
    const onStorage = (e: StorageEvent) => {
      if (e.key === DOC_KEY) {
        store.adopt(e.newValue);
        editor.invalidate();
      }
    };
    // (only a board of one's own: another tab's private board must never reach a shared one)
    if (!board) window.addEventListener("storage", onStorage);
    // an agent in this browser (WebMCP) gets the board's tools, on the board open here; labs and the catalogue are not offered
    const unoffer = variant.demo || catalogue ? () => {} : offerTools(editor, { where: () => (board ? `${location.origin}/b/${board}` : "your own board, open in this tab"), dark: () => isDark });
    // shared from here, or moved to a new link: the same board goes to its link without a reload, where it stands on screen
    goLiveRef.current = (key: string, copied: boolean) => {
      store.saveNow();
      store.persist = false;
      handoff = { key, editor, copied };
      void navigate({ to: "/b/$key", params: { key }, replace: !!board });
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    // a phone's keyboard covers the lower part of the screen without resizing the page
    const vv = window.visualViewport;
    const onKeyboard = () => {
      if (vv && vv.height < window.innerHeight - 80) editor.keepTypingVisible(vv.height);
    };
    vv?.addEventListener("resize", onKeyboard);
    document.addEventListener("visibilitychange", hidden);
    if (import.meta.env.DEV) (window as unknown as { __editor: Editor }).__editor = editor;
    return () => {
      unoffer();
      live?.stop();
      cancelAnimationFrame(raf);
      unsub();
      mq.removeEventListener("change", onScheme);
      window.removeEventListener(THEME_EVENT, onScheme);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", flush);
      vv?.removeEventListener("resize", onKeyboard);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [editor, store]);

  // ── input ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const input = (e: PointerEvent): PointerInput => ({
      x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, alt: e.altKey,
      meta: e.metaKey || e.ctrlKey, id: e.pointerId, touch: e.pointerType === "touch",
    });
    // touch has no double-click and no right-click of its own: two quick
    // taps in one place, and a finger held still, stand in for them
    let lastTap = { t: 0, x: 0, y: 0 }, tapFrom: { x: number; y: number; t: number } | null = null;
    let hold: ReturnType<typeof setTimeout> | null = null, fingers = 0, byTouch = false;
    const noHold = () => {
      if (hold) clearTimeout(hold);
      hold = null;
    };
    const down = (e: PointerEvent) => {
      setMenu(null);
      byTouch = e.pointerType === "touch";
      if (e.button === 2) return;
      if (byTouch) {
        fingers += 1;
        noHold();
        tapFrom = fingers === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
        if (fingers === 1) {
          const at = { x: e.clientX, y: e.clientY }, id = e.pointerId;
          hold = setTimeout(() => {
            hold = null;
            tapFrom = null;
            editor.cancelPointer(id);
            openMenu(at.x, at.y);
          }, 550);
        }
      }
      canvas.setPointerCapture(e.pointerId);
      // a press on the board takes the keyboard back from any control
      const a = document.activeElement;
      if (a instanceof HTMLElement && a !== document.body && !a.isContentEditable) a.blur();
      editor.down(input(e));
    };
    // the press itself must not move focus: a caret placed by this very
    // press (the Text tool) would lose it again before a key was typed
    const keepFocus = (e: MouseEvent) => e.preventDefault();
    const move = (e: PointerEvent) => {
      if (tapFrom && Math.hypot(e.clientX - tapFrom.x, e.clientY - tapFrom.y) > 8) {
        tapFrom = null;
        noHold();
      }
      editor.move(input(e));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch") fingers = Math.max(0, fingers - 1);
      noHold();
      editor.up(input(e));
      if (e.pointerType === "touch" && tapFrom && performance.now() - tapFrom.t < 350) {
        const now = performance.now();
        if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28) {
          lastTap = { t: 0, x: 0, y: 0 };
          editor.dblclick({ x: e.clientX, y: e.clientY });
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      tapFrom = null;
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerType === "touch") fingers = Math.max(0, fingers - 1);
      noHold();
      tapFrom = null;
      editor.cancelPointer(e.pointerId);
    };
    const blur = () => editor.blur();
    // from a mouse only: two taps are counted above, the same on every phone
    const dbl = (e: MouseEvent) => {
      if (!byTouch) editor.dblclick({ x: e.clientX, y: e.clientY });
    };
    const wheel = (e: WheelEvent) => {
      // over a control, the wheel belongs to that control: a list or a row that has more than it shows scrolls, and the
      // board stays where it is (a pinch still zooms the board from anywhere)
      if (e.target !== canvas && e.target instanceof Element && !(e.ctrlKey || e.metaKey)) {
        const flat = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        for (let el: Element | null = e.target; el && el !== surface; el = el.parentElement) {
          const cs = getComputedStyle(el), ys = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1, xs = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
          if (ys && !flat) return; // the browser scrolls it
          if (xs) {
            // a row scrolls sideways whichever way the fingers move
            if (!flat) { el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1); e.preventDefault(); }
            return;
          }
        }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      // a mouse wheel reports lines; a trackpad reports pixels
      const k = e.deltaMode === 1 ? 16 : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
      const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
      editor.wheel({ x: e.clientX, y: e.clientY }, dx, dy, e.ctrlKey || e.metaKey);
    };
    const ctxMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (byTouch) return; // a held finger has already asked
      openMenu(e.clientX, e.clientY);
    };
    const openMenu = (x: number, y: number) => {
      const e = { clientX: x, clientY: y };
      const p = editor.world({ x: e.clientX, y: e.clientY });
      // right-clicking a shape that is not selected selects it first
      const hit = editor.shapeAt(p);
      if (hit ? !store.sel.has(hit.id) : store.sel.size > 0) {
        store.select(hit ? editor.family(hit.id) : []);
        editor.overlay.stubsFor = null;
        store.emit();
      }
      setMenu({ x: e.clientX, y: e.clientY, onShape: !!hit, locked: hit ? null : (editor.lockedAt(p)?.id ?? null) });
    };
    // keys belong to the canvas only while nothing else has the focus:
    // a focused button or an open menu handles its own
    const elsewhere = (t: EventTarget | null) => t instanceof HTMLElement && t !== document.body && t !== canvas;
    const keydown = (e: KeyboardEvent) => {
      // an open menu owns the keyboard (one that is already closing does not)
      if (e.target instanceof HTMLElement && e.target.closest('[role="menu"]:not(.ui-out)')) return;
      if (e.key === "Escape") {
        setMenu(null);
        // otherwise Escape works from anywhere, even with a control focused
        if (e.target instanceof HTMLElement && e.target !== document.body && !e.target.isContentEditable) e.target.blur();
      } else if (elsewhere(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      // ⇧⌘C: the selection (or, with nothing selected, the board) as a picture
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        return copyImage(editor, store.sel.size ? new Set(store.sel) : null);
      }
      if (editor.key({ key: e.key, code: e.code, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey, repeat: e.repeat })) e.preventDefault();
    };
    const keyup = (e: KeyboardEvent) => editor.keyUp(e.code);
    // copy, cut and paste go through the system clipboard
    const onCopy = (e: ClipboardEvent) => {
      if (elsewhere(e.target) || !store.sel.size) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", editor.serialize());
      editor.copy();
      if (e.type === "cut") editor.remove();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (elsewhere(e.target)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) editor.pasteText(text);
      else editor.paste();
    };
    // the page itself never zooms: pinches and ctrl-wheel belong to the canvas
    const noPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const noGesture = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("mousedown", keepFocus);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    canvas.addEventListener("dblclick", dbl);
    // on the whole surface, so the board still scrolls with the pointer over text being typed
    const surface = canvas.parentElement!;
    surface.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", ctxMenu);
    // heard first, so Escape reaches the board even where a tooltip or a
    // focused control would otherwise keep it
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    document.addEventListener("wheel", noPageZoom, { passive: false });
    document.addEventListener("gesturestart", noGesture);
    document.addEventListener("gesturechange", noGesture);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("mousedown", keepFocus);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      canvas.removeEventListener("dblclick", dbl);
      surface.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", ctxMenu);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
      document.removeEventListener("wheel", noPageZoom);
      document.removeEventListener("gesturestart", noGesture);
      document.removeEventListener("gesturechange", noGesture);
    };
  }, [editor, store]);

  const selected = [...store.sel].map((id) => store.doc.shapes[id]).filter((s): s is Shape => !!s);
  const editing = store.editing ? store.doc.shapes[store.editing] : undefined;
  const quiet = editor.overlay.busy || !!editing;
  // Lost: there is a drawing, and none of it is on screen. The board then
  // offers the way back, and takes the offer away the moment anything shows.
  const lost = useMemo(() => {
    const doc = store.doc, c = store.cam;
    if (!ready || !doc.order.length) return false;
    const view = { x: c.x, y: c.y, w: editor.view.w / c.z, h: editor.view.h / c.z };
    for (const id of doc.order) {
      const sh = doc.shapes[id];
      if (sh && overlaps(bounds(doc, sh), view)) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.doc, store.cam, ready, editor.view.w, editor.view.h]);

  return (
    <TooltipProvider>
      <div className="fixed inset-0 select-none overflow-hidden bg-[#fbfbfa] dark:bg-[#111113]" data-mode={dark ? "dark" : "light"}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" style={{ cursor: editor.cursor }} />

        {editing && <TextEditor key={editing.id} editor={editor} shape={editing} dark={dark} />}
        {/* (it stays while free text is typed: its size, weight, face and setting are changed with the words in hand) */}
        <Presence show={ready && (editing && isText(editing) ? !editor.overlay.busy : (selected.length > 0 || store.tool === "arrow") && !quiet)} value={editing && isText(editing) ? [editing as Shape] : selected}>
          {(shapes, leaving) => <StyleBar editor={editor} shapes={shapes} leaving={leaving} v={v} typing={!!editing} />}
        </Presence>

        <Presence show={ready && !quiet && (editor.motion || !!editor.playing) && !!(editor.playing?.g ?? editor.sceneGroup)} value={editor.playing?.g ?? editor.sceneGroup}>
          {(g, leaving) => g && <Moments editor={editor} g={g} leaving={leaving} />}
        </Presence>
        <Presence show={editor.motion && ready && !quiet && !editing && !editor.playing && !editor.sceneGroup && selected.length > 0 && store.tool === "select"} value={selected}>
          {(shapes, leaving) => <Begin editor={editor} shapes={shapes} leaving={leaving} />}
        </Presence>

        {v.library === "rail" && (
          <div className={`absolute left-4 top-1/2 max-h-[calc(100vh-32px)] -translate-y-1/2 overflow-y-auto ${PANEL}`} onMouseDown={(e) => e.preventDefault()}>
            <Library editor={editor} dark={dark} onPick={() => {}} />
          </div>
        )}
        <Toolbar
          editor={editor}
          dark={dark}
          v={v}
          onDock={(dock) => {
            setV((old) => ({ ...old, dock }));
            try {
              if (!v.demo) localStorage.setItem(DOCK_KEY, dock);
            } catch {
              /* storage blocked */
            }
          }}
        />

        <Presence show={lost && !quiet} value={null}>
          {(_, leaving) => (
            <button
              onClick={() => editor.fit()}
              onMouseDown={(e) => e.preventDefault()}
              className={`ctl absolute left-1/2 top-4 z-50 h-8 -translate-x-1/2 px-3 text-[13px] font-medium text-kumo-default hover:bg-black/[0.03] dark:hover:bg-white/[0.06] ${PANEL} ${leaving ? "ui-out" : "ui-in"}`}
            >
              Back to the drawing
            </button>
          )}
        </Presence>
        {/* view and history */}
        <div className={`absolute bottom-4 flex items-center p-1 ${v.dock === "bl" ? "right-4" : v.dock === "left" ? "left-[64px]" : "left-4"} ${v.dock === "bottom" ? "max-[696px]:bottom-[64px] pointer-coarse:max-[696px]:bottom-[76px]" : ""} ${PANEL}`} onMouseDown={(e) => e.preventDefault()}>
          <Tip label="Zoom out" keys="⌘−">
            <button className={CELL} aria-label="Zoom out" onClick={() => editor.zoomTo(store.cam.z / 1.25)}>
              <Minus size={16} />
            </button>
          </Tip>
          <Tip label="Fit everything" keys="⇧1">
            <button onClick={() => editor.fit()} className="ctl h-8 w-12 rounded-md text-center text-[12px] tabular-nums text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              {Math.round(store.cam.z * 100)}%
            </button>
          </Tip>
          <Tip label="Zoom in" keys="⌘+">
            <button className={CELL} aria-label="Zoom in" onClick={() => editor.zoomTo(store.cam.z * 1.25)}>
              <Plus size={16} />
            </button>
          </Tip>
          <span className="mx-1 h-4 w-px bg-kumo-line" />
          <Tip label="Undo" keys="⌘Z">
            <button className={CELL} aria-label="Undo" disabled={!store.canUndo} onClick={() => editor.history("undo")}>
              <ArrowCounterClockwise size={16} />
            </button>
          </Tip>
          <Tip label="Redo" keys="⇧⌘Z">
            <button className={CELL} aria-label="Redo" disabled={!store.canRedo} onClick={() => editor.history("redo")}>
              <ArrowClockwise size={16} />
            </button>
          </Tip>
          <span className="mx-1 h-4 w-px bg-kumo-line" />
          <ThemeButton />
        </div>

        {(ready || handed) && !v.demo && <ShareBar board={board} handed={!!handed} copied={!!handed?.copied} doc={() => store.doc} flush={() => flushRef.current()} onLive={(key, copied) => goLiveRef.current(key, copied)} />}
        {unsaved && !moved && (
          <div className={`absolute left-1/2 top-4 z-50 -translate-x-1/2 px-3 py-2 text-[13px] text-red-600 dark:text-red-400 ${PANEL}`}>Not saved: {unsaved}</div>
        )}
        {moved && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className={`flex flex-col items-center gap-2 p-4 text-[14px] text-kumo-default ${PANEL}`}>
              This board has moved to a new link.
              {movedTo && <a className="ctl rounded-md px-2.5 py-1 text-[13px] font-medium text-kumo-default underline" href={`/b/${movedTo}`}>Open the new link</a>}
            </div>
          </div>
        )}

        <Presence show={!!menu} value={menu}>
          {(at, leaving) => at && <ContextMenu editor={editor} at={at} leaving={leaving} close={() => setMenu(null)} />}
        </Presence>
      </div>
    </TooltipProvider>
  );
}

// ── presence ────────────────────────────────────────────────────────
/** Keeps its child on screen for a moment after `show` turns false, so
 *  it can leave as quietly as it arrived. The child gets the last value
 *  it was shown with. */
function Presence<T>({ show, value, children }: { show: boolean; value: T; children: (value: T, leaving: boolean) => React.ReactNode }) {
  const [held, setHeld] = useState(show);
  const last = useRef(value);
  if (show) last.current = value;
  useEffect(() => {
    if (show) return setHeld(true);
    const t = setTimeout(() => setHeld(false), 90);
    return () => clearTimeout(t);
  }, [show]);
  if (!show && !held) return null;
  return <>{children(last.current, !show)}</>;
}

// ── tools ───────────────────────────────────────────────────────────
const MARKERS: Record<Variant["marker"], { tile: string; on: string }> = {
  soft: { tile: "size-8 pointer-coarse:size-10 rounded-md bg-black/[0.08] dark:bg-white/[0.14]", on: "text-kumo-default" },
  ink: { tile: "size-8 pointer-coarse:size-10 rounded-md bg-neutral-900 dark:bg-neutral-100", on: "text-white dark:text-neutral-900" },
  brand: { tile: "size-8 pointer-coarse:size-10 rounded-md bg-kumo-brand", on: "text-white" },
  dot: { tile: "size-8 pointer-coarse:size-10 after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-kumo-brand", on: "text-kumo-default" },
};
const DOCK_KEY = "canvas:dock:v1";
const EDGE = 16;
/** Where the toolbar's top-left corner rests for a dock, given its size and the window's. */
function dockAt(dock: Dock, w: number, h: number, vw: number, vh: number): { x: number; y: number } {
  const cx = (vw - w) / 2, cy = (vh - h) / 2, r = vw - w - EDGE, b = vh - h - EDGE;
  switch (dock) {
    case "top": return { x: cx, y: EDGE };
    case "left": return { x: EDGE, y: cy };
    case "right": return { x: r, y: cy };
    case "tl": return { x: EDGE, y: EDGE };
    case "tr": return { x: r, y: EDGE };
    case "bl": return { x: EDGE, y: b };
    case "br": return { x: r, y: b };
    default: return { x: cx, y: b };
  }
}
const uprightDock = (d: Dock) => d === "left" || d === "right";

/** The tools. The bar is picked up by its grip and put down against the
 *  middle of an edge or in a corner; it stays where it was last put. */
function Toolbar({ editor, v, onDock, dark }: { editor: Editor; v: Variant; onDock: (d: Dock) => void; dark: boolean }) {
  const tool = editor.store.tool;
  // the shapes beyond the three on the bar live behind one button
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<false | "library" | "patterns">(false);
  const pat = useRef<HTMLButtonElement>(null);
  const ownButton = v.patterns === "button";
  const fromLibrary = (tool === "stamp" && !ownButton) || (tool in KINDS && !isBasic(tool as BoxKind));
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !bar.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const upright = uprightDock(v.dock);
  const bar = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<Tool, HTMLButtonElement>());
  const [at, setAt] = useState<number | null>(null);
  const [moves, setMoves] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [held, setHeld] = useState(false);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = buttons.current.get(tool) ?? (fromLibrary ? more.current : tool === "stamp" ? pat.current : null);
    if (el) setAt(upright ? el.offsetTop : el.offsetLeft);
  }, [tool, upright, fromLibrary]);
  // rest at the dock; follow the window when it changes size
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current;
      if (el && !drag.current?.moved) setPos(dockAt(v.dock, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [v.dock]);
  // the marker and the bar appear in place on load, and only glide after that
  useEffect(() => {
    const r = requestAnimationFrame(() => setMoves(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || !pos) return;
    const d = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false };
    drag.current = d;
    // followed on the window, so a quick pull that leaves the bar is still a pull
    const move = (ev: PointerEvent) => {
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
        d.moved = true;
        setHeld(true);
      }
      setPos({ x: ev.clientX - d.dx, y: ev.clientY - d.dy });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      drag.current = null;
      const el = bar.current;
      if (!d.moved || !el) return;
      setHeld(false);
      // put down at whichever resting place the pointer is nearest
      const vw = window.innerWidth, vh = window.innerHeight;
      const spots: Record<Dock, [number, number]> = {
        bottom: [vw / 2, vh], top: [vw / 2, 0], left: [0, vh / 2], right: [vw, vh / 2], tl: [0, 0], tr: [vw, 0], bl: [0, vh], br: [vw, vh],
      };
      let best: Dock = v.dock, bd = Infinity;
      for (const k of DOCK_NAMES) {
        const dist = Math.hypot(ev.clientX - spots[k][0], ev.clientY - spots[k][1]);
        if (dist < bd) { bd = dist; best = k; }
      }
      if (best === v.dock) setPos(dockAt(best, el.offsetWidth, el.offsetHeight, vw, vh));
      else onDock(best);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const m = MARKERS[v.marker];
  const tipSide = v.dock === "left" ? "right" : v.dock === "right" ? "left" : v.dock === "top" || v.dock === "tl" || v.dock === "tr" ? "bottom" : "top";
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Tools"
      aria-orientation={upright ? "vertical" : "horizontal"}
      className={`absolute left-0 top-0 flex touch-none items-center p-1 ${upright ? "flex-col" : "flex-row"} ${PANEL} ${held ? "cursor-grabbing shadow-[0_6px_20px_rgba(0,0,0,0.12)]" : ""} ${moves && !held ? "dock-move" : ""}`}
      style={{ transform: pos ? `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)` : undefined, visibility: pos ? undefined : "hidden" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* the one place the bar is picked up by */}
      <span
        aria-hidden
        onPointerDown={down}
        className={`ctl flex shrink-0 touch-none items-center justify-center rounded-md text-kumo-subtle hover:bg-black/[0.04] hover:text-kumo-default dark:hover:bg-white/[0.07] ${upright ? "h-4 w-8 pointer-coarse:h-6 pointer-coarse:w-10" : "h-8 w-4 pointer-coarse:h-10 pointer-coarse:w-6"} ${held ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {upright ? <DotsSix size={14} weight="bold" /> : <DotsSixVertical size={14} weight="bold" />}
      </span>
      {at !== null && (
        <span
          aria-hidden
          className={`absolute ${upright ? "left-1 top-0" : "left-0 top-1"} ${m.tile} ${moves ? "tool-ind" : ""}`}
          style={{ transform: upright ? `translateY(${at}px)` : `translateX(${at}px)` }}
        />
      )}
      {TOOLS.map(({ tool: t, icon: I, name, key }, i) => {
        const on = tool === t;
        return (
          <span key={t} className={`flex items-center ${upright ? "flex-col" : ""}`}>
            {i === 2 && <span className={upright ? "my-1 h-px w-4 bg-kumo-line" : "mx-1 h-4 w-px bg-kumo-line"} />}
            <Tip label={name} keys={key} side={tipSide}>
              <button
                ref={(el) => {
                  if (el) buttons.current.set(t, el);
                }}
                aria-label={name}
                aria-pressed={on}
                onClick={() => editor.setTool(t)}
                className={`ctl relative z-10 flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md ${on ? m.on : "text-kumo-subtle hover:bg-black/[0.04] hover:text-kumo-default dark:hover:bg-white/[0.07]"}`}
              >
                <I size={18} />
              </button>
            </Tip>
            {t === "diamond" && v.library === "popover" && (
              <Tip label="More shapes" side={tipSide}>
                <button
                  ref={more}
                  aria-label="More shapes"
                  aria-expanded={open === "library"}
                  aria-pressed={fromLibrary}
                  onClick={() => setOpen((o) => (o === "library" ? false : "library"))}
                  className={`ctl relative z-10 flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md ${fromLibrary ? m.on : "text-kumo-subtle hover:bg-black/[0.04] hover:text-kumo-default dark:hover:bg-white/[0.07]"}`}
                >
                  <Shapes size={18} />
                </button>
              </Tip>
            )}
            {t === "diamond" && ownButton && (
              <Tip label="Patterns" side={tipSide}>
                <button
                  ref={pat}
                  aria-label="Patterns"
                  aria-expanded={open === "patterns"}
                  aria-pressed={tool === "stamp"}
                  onClick={() => setOpen((o) => (o === "patterns" ? false : "patterns"))}
                  className={`ctl relative z-10 flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md ${tool === "stamp" ? m.on : "text-kumo-subtle hover:bg-black/[0.04] hover:text-kumo-default dark:hover:bg-white/[0.07]"}`}
                >
                  <TreeStructure size={18} />
                </button>
              </Tip>
            )}
          </span>
        );
      })}
      {open && (
        <div
          className={`ui-in absolute z-20 max-h-[min(70vh,520px)] cursor-default overflow-y-auto ${PANEL} ${
            v.dock === "left" ? "left-full top-1/2 ml-2 -translate-y-1/2" : v.dock === "right" ? "right-full top-1/2 mr-2 -translate-y-1/2"
            : `${tipSide === "bottom" ? "top-full mt-2" : "bottom-full mb-2"} ${v.dock === "tl" || v.dock === "bl" ? "left-0" : v.dock === "tr" || v.dock === "br" ? "right-0" : "left-1/2 -translate-x-1/2"}`
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Library editor={editor} dark={dark} onPick={() => setOpen(false)} only={ownButton ? (open === "patterns" ? "patterns" : "shapes") : undefined} />
        </div>
      )}
    </div>
  );
}

// ── the shape library ───────────────────────────────────────────────
const NO_DOC = { shapes: {}, order: [] };
/** A small picture of a shape, drawn by the same code that draws the board. */
function Thumb({ kind, dark }: { kind: BoxKind; dark: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = 52, H = 30, dpr = window.devicePixelRatio || 1, k = KINDS[kind];
    c.width = W * dpr;
    c.height = H * dpr;
    // room above for a name or a caption, where the shape carries one
    const top = k.label === "name" || k.label === "caption" ? 12 : 0;
    const z = Math.min(1, (W - 6) / k.w, (H - 4 - top * 0.6) / k.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, ((W - k.w * z) / 2) * dpr, ((H - k.h * z + top * 0.6 * z) / 2) * dpr);
    // drawn small, with lines kept as heavy on screen as they are on the board
    paintShape(ctx, NO_DOC, { id: "thumb", kind, x: 0, y: 0, w: k.w, h: k.h, text: "", tone: "ink", fill: "none", ...(k.level ? { value: k.level.start } : {}) }, themeFor(dark), 0.6 * z);
  }, [kind, dark]);
  return <canvas ref={ref} className="h-[30px] w-[52px]" />;
}
/** A small picture of a whole pattern. */
function PatternThumb({ def, dark, big = false }: { def: StampDef; dark: boolean; big?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = big ? 116 : 72, H = big ? 70 : 44, dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const shapes = def.build();
    const doc = { shapes: Object.fromEntries(shapes.map((sh) => [sh.id, sh])), order: shapes.map((sh) => sh.id) };
    const r = boundsOf(doc, doc.order);
    if (!r) return;
    const z = Math.min((W - 6) / r.w, (H - 6) / r.h, 0.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, ((W - r.w * z) / 2 - r.x * z) * dpr, ((H - r.h * z) / 2 - r.y * z) * dpr);
    const t = themeFor(dark);
    for (const sh of shapes) paintShape(ctx, doc, sh, t, 0.75 * z);
    paintPorts(ctx, doc, shapes, t, 0.75 * z);
  }, [def, dark, big]);
  return <canvas ref={ref} className={big ? "h-[70px] w-[116px]" : "h-[44px] w-[72px]"} />;
}
let lastTab: "shapes" | "patterns" | "diagrams" = "shapes";
function Library({ editor, dark, onPick, only }: { editor: Editor; dark: boolean; onPick: () => void; only?: "shapes" | "patterns" }) {
  const tool = editor.store.tool;
  // the tab last looked at is where the library opens next time
  const [chosen, choose] = useState(lastTab);
  const setTab = (k: typeof lastTab) => { lastTab = k; choose(k); };
  // one row of tabs, or, when patterns have a button of their own, shapes alone here and the stamps there
  const tabs = (only === "shapes" ? ["shapes"] : only === "patterns" ? ["patterns", "diagrams"] : ["shapes", "patterns", "diagrams"]) as (typeof lastTab)[];
  const tab = tabs.includes(chosen) ? chosen : tabs[0]!;
  const cell = (on: boolean) => `ctl flex flex-col items-center justify-center gap-1 rounded-md ${on ? "bg-black/[0.07] dark:bg-white/[0.12]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.07]"}`;
  const pick = (t: Tool) => {
    editor.setTool(t);
    onPick();
  };
  return (
    <div className="flex w-[268px] flex-col gap-2 p-2">
      {/* single shapes, or whole arrangements of them */}
      <div role="tablist" className={`gap-0.5 rounded-md bg-black/[0.04] p-0.5 dark:bg-white/[0.07] ${tabs.length < 2 ? "hidden" : "flex"}`}>
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`ctl h-7 flex-1 rounded-[5px] text-[12px] font-medium ${tab === k ? "bg-kumo-base text-kumo-default shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-kumo-subtle hover:text-kumo-default"}`}>
            {k === "shapes" ? "Shapes" : k === "patterns" ? "Patterns" : "Diagrams"}
          </button>
        ))}
      </div>
      {/* patterns and diagrams are both stamps: one list, two sizes */}
      {tab !== "shapes" && (
        <div className={`grid gap-0.5 ${tab === "diagrams" ? "grid-cols-2" : "grid-cols-3"}`} role="group" aria-label={tab === "diagrams" ? "Diagrams" : "Patterns"}>
          {(tab === "diagrams" ? ACCEPTED : PATTERNS).map((p) => {
            const on = tool === "stamp" && editor.pattern === p.slug, big = tab === "diagrams";
            return (
              <button key={p.slug} aria-label={p.name} aria-pressed={on} onClick={() => { editor.armPattern(p.slug); onPick(); }} className={`${cell(on)} justify-start ${big ? "h-[112px] pt-2" : "h-[82px] pt-1.5"}`}>
                <PatternThumb def={p} dark={dark} big={big} />
                {/* a name is never cut short: a long one takes a second line */}
                <span className="px-0.5 text-center text-[10.5px] leading-[1.15] text-kumo-default">{p.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "shapes" && LIBRARY.map((g) => (
        <div key={g.group} role="group" aria-label={g.group}>
          <div className="px-1 pb-1 text-[11px] font-medium text-kumo-subtle">{g.group}</div>
          <div className="grid grid-cols-4 gap-0.5">
            {g.kinds.map((k) => (
              <button key={k} aria-label={KINDS[k].name} aria-pressed={tool === k} onClick={() => pick(k)} className={`${cell(tool === k)} h-[58px]`}>
                <Thumb kind={k} dark={dark} />
                <span className="text-[10.5px] leading-none text-kumo-default">{KINDS[k].name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sample content for a lab board. */
/** A length of time you drag sideways to change, or click to type. One undo step however far it is dragged. */
function Dial({ label, value, step = 100, max = 20000, onChange }: { label: string; value: number; step?: number; max?: number; onChange: (ms: number) => void }) {
  const [typing, setTyping] = useState<string | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const fit = (v: number) => Math.min(max, Math.max(0, Math.round(v / step) * step));
  const shown = live ?? value, secs = (shown / 1000).toFixed(1);
  const commit = () => { const v = typing === null ? NaN : parseFloat(typing); setTyping(null); if (Number.isFinite(v)) onChange(fit(v * 1000)); };
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <span className="whitespace-nowrap pl-1 text-[11px] text-kumo-subtle">{label}</span>
      {typing !== null ? (
        <input autoFocus aria-label={label} inputMode="decimal" value={typing} onChange={(e) => setTyping(e.target.value)} onFocus={(e) => e.target.select()} onBlur={commit} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); else if (e.key === "Escape") setTyping(null); }} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="h-6 w-11 rounded bg-black/[0.05] text-center text-[12px] tabular-nums text-kumo-default outline-none ring-1 ring-kumo-brand dark:bg-white/[0.08]" />
      ) : (
        <span
          role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={shown} aria-valuemin={0} aria-valuemax={max} aria-valuetext={`${secs} seconds`}
          className={`ctl flex h-6 w-11 cursor-ew-resize touch-none select-none items-center justify-center rounded text-[12px] tabular-nums text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${live !== null ? "bg-black/[0.05] dark:bg-white/[0.08]" : ""}`}
          onPointerDown={(e) => { e.stopPropagation(); drag.current = { x: e.clientX, v: value, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 3) d.moved = true; if (d.moved) setLive(fit(d.v + Math.round(dx / 5) * step)); }}
          onPointerUp={() => { const d = drag.current; drag.current = null; if (!d) return; if (!d.moved) setTyping(secs); else if (live !== null && live !== value) onChange(live); setLive(null); }}
          onPointerCancel={() => { drag.current = null; setLive(null); }}
          onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onChange(fit(value + step)); } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onChange(fit(value - step)); } else if (e.key === "Enter") { e.stopPropagation(); setTyping(secs); } }}
        >
          {secs}s
        </span>
      )}
    </div>
  );
}
/** A way of arriving, drawn as its own curve. */
function CurveIcon({ ease }: { ease: "smooth" | "spring" | "even" }) {
  const f = curve(ease === "smooth" ? undefined : ease);
  const d = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return `${i ? "L" : "M"}${(2 + t * 12).toFixed(2)} ${(13 - f(t) * 9.5).toFixed(2)}`; }).join(" ");
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
const ON = "bg-black/[0.07] dark:bg-white/[0.12]";
const partName = (sh: Shape) => (sh.text ? sh.text.split("\n")[0]! : isArrow(sh) ? "Line" : isText(sh) ? "Text" : KINDS[sh.kind].name);

/** With the controls for movement put away, a drawing that moves still offers the one thing a reader wants: to see it. */
/** Anything selected is already a first moment: adding a second is what makes it move. */
function Begin({ editor, shapes, leaving }: { editor: Editor; shapes: Shape[]; leaving: boolean }) {
  const store = editor.store, b = boundsOf(store.doc, shapes.map((sh) => sh.id).filter((id) => store.doc.shapes[id]));
  if (!b) return null;
  const z = store.cam.z;
  return (
    <div className={`absolute flex items-center gap-0.5 p-0.5 ${PANEL} transition-opacity duration-150 ${leaving ? "opacity-0" : "opacity-100"}`} style={{ left: Math.max(8, (b.x - store.cam.x) * z), top: Math.min(window.innerHeight - 124, Math.max(8, (b.y + b.h - store.cam.y) * z + 14)) }} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-kumo-brand px-2 text-[12px] font-medium tabular-nums text-white">1</span>
      <Tip label="Add a moment">
        <button aria-label="Add a moment" onClick={() => editor.animate()} className={CELL}><Plus size={16} /></button>
      </Tip>
    </div>
  );
}
/** A group's moments and everything about how it moves, in one place: one bar under the group. */
function Moments({ editor, g, leaving }: { editor: Editor; g: Id; leaving: boolean }) {
  const store = editor.store, moments = editor.moments(g), sc = editor.scene(g), playing = editor.playing?.g === g, held = playing && editor.playing?.held !== undefined;
  // while it plays, the marker follows along
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing || held) return;
    let raf = requestAnimationFrame(function loop() { tick((n) => n + 1); raf = requestAnimationFrame(loop); });
    return () => cancelAnimationFrame(raf);
  }, [playing, held]);
  // whether the list of parts hidden in this moment is open
  const [listed, setListed] = useState(false);
  // (see /lab) a drag that moves through the drawing's time by hand: where it began, and whether it has become one
  const slide = useRef<{ x: number; on: boolean } | null>(null);
  // a long row of moments is shown in part: the first, the last and those around the one on show, with the rest behind "…"
  const [allTabs, setAllTabs] = useState<Id | null>(null);
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= 700);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 700); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  // the bar is kept on the board however long it grows
  const barRef = useRef<HTMLDivElement>(null), [barW, setBarW] = useState(0);
  useLayoutEffect(() => { const w = barRef.current?.offsetWidth ?? 0; if (w !== barW) setBarW(w); });
  if (!sc || !moments.length) return null;
  const on = playing ? editor.playingAt : sc.at, cur = moments[sc.at]!;
  const shapes = [...store.sel].map((id) => store.doc.shapes[id]).filter((sh): sh is Shape => !!sh && sh.group === g), arrows = shapes.filter(isArrow);
  const picked = shapes.length > 0 && shapes.length < moments[sc.at]!.shapes.length || shapes.length === 1;
  const key = (label: string, tip: string, pressed: boolean | undefined, run: () => void, icon: React.ReactNode, k?: string) => (
    <Tip key={k ?? label} label={tip}>
      <button aria-label={label} {...(pressed === undefined ? {} : { "aria-pressed": pressed })} onClick={run} className={`${CELL} ${pressed ? ON : ""}`}>{icon}</button>
    </Tip>
  );
  // a preview of a change just made is not playing to be stopped: the controls stay as they are
  const running = playing && !held && editor.playing?.until === undefined;
  const live = playing && editor.playing?.until === undefined;
  const play = (
    <>
      <Tip label={running ? "Pause" : "Play"}>
        <button aria-label={running ? "Pause" : "Play"} onClick={() => (running ? editor.pause() : held ? editor.resume() : editor.play(g))} className={`${CELL} ${running ? "text-kumo-brand" : ""}`}>
          {running ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
      </Tip>
      {live && (
        <Tip label="Stop">
          <button aria-label="Stop" onClick={() => editor.stop()} className={CELL}>
            <Stop size={16} weight="fill" />
          </button>
        </Tip>
      )}
    </>
  );
  const repeat = key("Repeat", sc.once ? "Plays once" : "Goes round", !sc.once, () => editor.once(g, !sc.once), <Repeat size={16} />);
  // while it plays, the moment it is on fills for as long as it lasts: how long each one takes is there to see
  const loop = moments.reduce((n, m) => n + m.over + m.hold, 0) || 1;
  // sliding by place, not by the clock: the middle of each number is that moment at rest, and the way between two
  // numbers is the whole of the change between them, however briefly it plays. So every transition is as wide as a moment.
  const glide = (x: number, el: HTMLElement) => {
    const marks = [...el.querySelectorAll<HTMLElement>('[role="tab"]')].map((b) => { const r = b.getBoundingClientRect(); return { i: Number((b.getAttribute("aria-label") ?? "").replace("Moment ", "")) - 1, x: r.left + r.width / 2 }; }).filter((m) => m.i >= 0);
    if (!marks.length) return;
    let at = marks[0]!.i as number;
    if (x >= marks[marks.length - 1]!.x) at = marks[marks.length - 1]!.i;
    else for (let k = 0; k + 1 < marks.length; k++) { const a = marks[k]!, b = marks[k + 1]!; if (x >= a.x && x < b.x) { at = a.i + ((x - a.x) / Math.max(1, b.x - a.x)) * (b.i - a.i); break; } }
    // the instant that is: moment `whole` at rest, then this far into the change to the next
    const whole = Math.min(moments.length - 1, Math.floor(at)), part = at - whole;
    let ms = 0;
    for (let k = 0; k <= whole; k++) ms += moments[k]!.hold + (k > 0 ? moments[k]!.over : 0);
    const next = moments[whole + 1];
    editor.scrub(g, part > 0 && next ? ms + part * next.over : Math.max(0, ms - 1));
  };
  const filled = (i: number) => {
    let start = moments[0]!.hold;
    for (let k = 1; k < i; k++) start += moments[k]!.over + moments[k]!.hold;
    if (i === 0) start = -moments[0]!.over;
    const len = moments[i]!.over + moments[i]!.hold || 1;
    return Math.min(1, ((((editor.playedMs - start) % loop) + loop) % loop) / len);
  };
  const most = wide ? 9 : 5, long = moments.length > most, opened = allTabs === g;
  const near = Math.min(Math.max(on - Math.floor((most - 2) / 2), 1), Math.max(1, moments.length - 1 - (most - 2)));
  const showing = (i: number) => !long || opened || i === 0 || i === moments.length - 1 || (i >= near && i < near + most - 2);
  const more = (k: string) => (
    <button key={k} type="button" aria-label={`Show all ${moments.length} moments`} title={`Show all ${moments.length} moments`} onClick={() => setAllTabs(g)} className="ctl flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-kumo-subtle hover:bg-black/[0.05] hover:text-kumo-default dark:hover:bg-white/[0.08]">
      <DotsThree size={16} weight="bold" />
    </button>
  );
  const fewer = long && opened && (
    <button key="fewer" type="button" aria-label="Show fewer moments" title="Show fewer moments" onClick={() => setAllTabs(null)} className="ctl flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-kumo-subtle hover:bg-black/[0.05] hover:text-kumo-default dark:hover:bg-white/[0.08]">
      <CaretLeft size={14} weight="bold" />
    </button>
  );
  const tabs = [...moments.flatMap((m, i) => !showing(i) ? (showing(i - 1) ? [more(`more-${i}`)] : []) : [(
    <button key={m.id} role="tab" aria-selected={i === on} aria-label={`Moment ${i + 1}`} ref={i === on ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined} onClick={() => editor.showMoment(g, i)} className={`ctl relative h-8 min-w-8 shrink-0 overflow-hidden rounded-md px-2 text-[12px] font-medium tabular-nums ${i === on ? "bg-kumo-brand text-white" : "text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"}`}>
      {running && i === on && <span className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${filled(i) * 100}%` }} />}
      <span className="relative">{i + 1}</span>
    </button>
  )]), fewer];
  const add = key("Add a moment", "Add a moment", undefined, () => editor.addMoment(g), <Plus size={16} />);
  const drop = key("Remove this moment", "Remove this moment", undefined, () => editor.removeMoment(g, sc.at), <Trash size={16} />);
  // this moment: how long it takes to arrive, how it arrives, how long it stays
  const arrive = <Dial label="Arrive in" value={cur.over} onChange={(ms) => editor.timeMoment(g, sc.at, { over: ms })} />;
  const stay = <Dial label="Stay" value={cur.hold} step={100} onChange={(ms) => editor.timeMoment(g, sc.at, { hold: ms })} />;
  const feel = (
    <div className="flex" role="group" aria-label="Arrives">
      {([["smooth", "Eases in and out"], ["spring", "Settles past and back"], ["even", "At an even pace"]] as const).map(([e, tip]) =>
        key(tip, tip, (cur.ease ?? "smooth") === e, () => editor.timeMoment(g, sc.at, { ease: e }), <CurveIcon ease={e} />, e),
      )}
    </div>
  );
  // the picked part, in this moment: there or not, how it comes, when, and what runs along a wire
  const allAway = shapes.every((sh) => sh.away);
  const eye = key(allAway ? "Show in this moment" : "Hide in this moment", allAway ? "Show in this moment" : "Hide in this moment", undefined, () => editor.hide(!allAway), allAway ? <EyeSlash size={16} /> : <Eye size={16} />);
  const after = <Dial label="After" value={Math.max(0, ...shapes.map((sh) => sh.wait ?? 0))} max={5000} onChange={(ms) => editor.part({ wait: ms })} />;
  const along = arrows.length === shapes.length && arrows.length > 0 && (
    <div className="flex" role="group" aria-label="Along the line">
      {([
        ["pour", "Request", "A request runs along it", <Path size={16} />],
        ["back", "Answer", "An answer runs back along it", <ArrowUUpLeft size={16} />],
        ["fizzle", "Request runs out", "A request runs out at its end", <Sparkle size={16} />],
        ["squash", "Request refused", "A request is refused at its end", <Prohibit size={16} />],
      ] as const).map(([what, name, tip, icon]) => {
        const lit = arrows.every((a) => a.run === what);
        return key(name, tip, lit, () => editor.along(lit ? null : what), icon, what);
      })}
    </div>
  );
  const busyAll = shapes.length > 0 && shapes.every((sh) => sh.kind === "glyph" && "busy" in sh && !!sh.busy);
  const work = shapes.length > 0 && shapes.every((sh) => sh.kind === "glyph") && key("At work", busyAll ? "At rest" : "At work", busyAll, () => editor.busy(!busyAll), <Cpu size={16} />);
  // parts hidden in this moment that are not drawn on the board are reached by name
  const off = editor.offBoard(store.doc, g), hiddenHere = cur.shapes.filter((sh) => sh.away && !isArrow(sh) && off.has(sh.id));
  const hiddenKey = !running && hiddenHere.length > 0 && (
    <Tip label="Hidden in this moment">
      <button aria-label="Hidden in this moment" aria-expanded={listed} onClick={() => setListed(!listed)} className={`ctl flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] tabular-nums text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${listed ? ON : ""}`}>
        <EyeSlash size={16} />{hiddenHere.length}
      </button>
    </Tip>
  );
  const fade = `transition-opacity duration-150 ${leaving ? "opacity-0" : "opacity-100"}`;
  const stop = { onMouseDown: (e: React.MouseEvent) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }, onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const r = unionOf(moments), z = store.cam.z, left = (r.x - store.cam.x) * z, under = (r.y + r.h - store.cam.y) * z + 14;
  const hang = { left: Math.max(8, Math.min(left, window.innerWidth - barW - 8)), top: Math.min(window.innerHeight - 124, Math.max(8, under)), maxWidth: "calc(100vw - 16px)" };

  // one bar under the group: the moments, then this moment, then the picked part
  return (
    <>
    {listed && hiddenKey && (
      <div role="menu" aria-label="Hidden in this moment" className={`absolute flex max-h-[220px] w-[200px] flex-col overflow-y-auto p-1 ${PANEL}`} style={{ left: hang.left, ...(hang.top + 42 + Math.min(220, hiddenHere.length * 28 + 8) > window.innerHeight - 96 ? { bottom: window.innerHeight - hang.top + 6 } : { top: hang.top + 42 }) }} {...stop}>
        {hiddenHere.map((sh) => (
          <button key={sh.id} role="menuitem" onClick={() => { editor.pickPart(g, sh.id); editor.hide(false); if (hiddenHere.length === 1) setListed(false); }} className="ctl flex h-7 items-center gap-2 rounded px-2 text-left text-[12px] text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
            <Eye size={14} className="shrink-0 text-kumo-subtle" /><span className="truncate">{partName(sh)}</span>
          </button>
        ))}
      </div>
    )}
    <div ref={barRef} className={`absolute flex items-center gap-0.5 overflow-x-auto p-0.5 ${PANEL} ${fade}`} style={hang} {...stop}>
      {play}
      {/* many moments stay a short row that slides: the one on show is always in it, and a cut-off number says there are more */}
      <div className="flex shrink-0 flex-col">
        <div role="tablist" aria-label="Moments" className={`flex shrink-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] ${opened && wide ? "max-w-[min(720px,60vw)]" : "max-w-[380px]"} touch-none`}
          {...(!running ? {
            // sliding across the moments moves through time; a plain click still picks one
            onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { slide.current = { x: e.clientX, on: false }; },
            onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => { const d = slide.current; if (!d || !(e.buttons & 1)) return; if (!d.on && Math.abs(e.clientX - d.x) > 4) { d.on = true; e.currentTarget.setPointerCapture(e.pointerId); } if (d.on) glide(e.clientX, e.currentTarget); },
            onPointerUp: () => { const d = slide.current; if (d && !d.on) slide.current = null; },
            onClickCapture: (e: React.MouseEvent) => { if (slide.current?.on) { e.stopPropagation(); e.preventDefault(); } slide.current = null; },
          } : {})}>{tabs}</div>
      </div>
      {!running && <>{add}{drop}{repeat}{hiddenKey}</>}
      {!running && <div className="flex shrink-0 items-center gap-0.5 max-[696px]:hidden"><Rule />{arrive}{feel}{stay}</div>}
      {!running && picked && <div className="flex shrink-0 items-center gap-0.5"><Rule />{eye}{after}{along}{work}</div>}
    </div>
    </>
  );
}
/** The box around every moment of a group. */
function unionOf(moments: { shapes: Shape[] }[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of moments) {
    const here = m.shapes.filter((sh) => !sh.away);
    const doc = { shapes: Object.fromEntries(m.shapes.map((sh) => [sh.id, sh])), order: here.map((sh) => sh.id) };
    const b = boundsOf(doc, doc.order);
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 1, h: 1 };
}

function seedDemo(editor: Editor, v: Variant) {
  const s = editor.store;
  if (v.scene && s.doc.order.length) return;
  if (v.scene === "all" || v.scene === "patterns") { placeAll(editor, v.scene === "patterns" ? PATTERNS : ACCEPTED); return; }
  placeRest(editor, v);
}
function placeAll(editor: Editor, list: StampDef[]) {
  const put = placer(editor, {});
  for (const d of list) put.add(d);
  editor.fit();
}
/** Puts diagrams down one after another as anyone would, in rows, each named over it; `row` starts a new row whenever it changes. */
type CatalogueEntry = { slug: string; title: string; about: string; name: string; clip: { shapes: Shape[]; scenes?: unknown } };
/** Lay the catalogue out: a row to a subject, its name and what it is about at the row's head, then its drawings, each
 *  with its own name over it, and each one moving as it does on any board. */
const laidOut = new WeakSet<Editor>();
async function layCatalogue(editor: Editor) {
  const s = editor.store;
  // (once per board: React may start the board twice in development)
  if (laidOut.has(editor)) return;
  laidOut.add(editor);
  const all = (await fetch("/catalogue-board.json").then((r) => r.json()).catch(() => [])) as CatalogueEntry[];
  const rows = new Map<string, CatalogueEntry[]>();
  for (const e of all) rows.set(e.title, [...(rows.get(e.title) ?? []), e]);
  const text = (x: number, y: number, words: string, size: number, tone: Tone, weight?: number): TextShape => {
    const t0: TextShape = { id: newId(), kind: "text", x, y, w: 1, h: 1, text: words, size, tone, ...(weight ? { weight } : {}) }, l = textLayout(t0);
    return { ...t0, w: l.w, h: l.h };
  };
  // each subject is a block: its name and what it is about on top, its drawings under them (wrapping when there are many);
  // the blocks are packed across the board in shelves, so the catalogue reads across as well as down
  const GAP = 140, LINE = 3600, SHELF = 9000, PAD = 260;
  type Laid = { e: CatalogueEntry; b: Rect; x: number; y: number };
  const blocks = [...rows].sort((a, b) => a[0].localeCompare(b[0])).map(([title, es]) => {
    const name = text(0, 0, title, 30, "ink", 600), about = es[0]!.about ? text(0, name.h + 10, es[0]!.about[0]!.toUpperCase() + es[0]!.about.slice(1) + ".", 15, "muted") : null;
    const top = name.h + (about ? about.h + 10 : 0) + 40, laid: Laid[] = [];
    let x = 0, y = top, lineH = 0, w = Math.max(name.w, about?.w ?? 0);
    for (const e of es) {
      const temp = { shapes: Object.fromEntries(e.clip.shapes.map((sh) => [sh.id, sh])), order: e.clip.shapes.map((sh) => sh.id) };
      const b = boundsOf(temp, temp.order);
      if (!b) continue;
      const cap = textLayout({ text: e.name, size: 15, weight: 500 } as TextShape), cw = Math.max(b.w, cap.w), ch = cap.h + 24 + b.h;
      if (x > 0 && x + cw > LINE) { x = 0; y += lineH + GAP; lineH = 0; }
      laid.push({ e, b, x, y });
      x += cw + GAP; lineH = Math.max(lineH, ch); w = Math.max(w, x - GAP);
    }
    return { name, about, laid, w, h: y + lineH };
  });
  // (as wide as makes the whole board roughly the shape of a screen, never narrower than one shelf)
  const area = blocks.reduce((n, bl) => n + (bl.w + PAD) * (bl.h + PAD), 0), shelf = Math.max(SHELF, Math.sqrt(area * 1.6));
  let sx = 0, sy = 0, shelfH = 0;
  // (all of it as one change, so the page is drawn once at the end rather than once per drawing)
  s.run(() => { for (const bl of blocks) {
    if (sx > 0 && sx + bl.w > shelf) { sx = 0; sy += shelfH + PAD; shelfH = 0; }
    const ox = sx, oy = sy;
    s.run(() => s.put({ ...bl.name, x: ox, y: oy }, ...(bl.about ? [{ ...bl.about, x: ox, y: oy + bl.name.h + 10 }] : [])));
    for (const { e, b, x, y } of bl.laid) {
      const cap = text(ox + x, oy + y, e.name, 15, "ink", 500);
      s.run(() => s.put(cap));
      editor.pasteText(JSON.stringify({ canvas: 1, ...e.clip }), { x: ox + x + b.w / 2, y: oy + y + cap.h + 24 + b.h / 2 });
    }
    sx += bl.w + PAD; shelfH = Math.max(shelfH, bl.h);
  } });
  s.select([]);
  // (laying it out is not something to undo)
  (s as unknown as { undoStack: unknown[] }).undoStack = [];
  s.emit();
  // (the first subjects, close enough to read)
  s.cam = { x: -160, y: -180, z: 0.32 };
  s.emit();
}

function placer(editor: Editor, o: { row?: (d: StampDef) => string; placed?: (slug: string, ids: Id[]) => void }) {
  const s = editor.store;
  const tap = (x: number, y: number) => { const e = { x, y, button: 0, shift: false, alt: false, meta: false, id: 1, touch: false }; editor.down(e); editor.up(e); };
  let x = 0, y = 0, row = 0, last: string | null = null;
  const first: Id[] = [];
  const gap = 420;
  const add = (d: StampDef) => {
    // (placed at the board's own scale, wherever the reader is looking, then the view is put back)
    const z0 = s.cam, sel = [...s.sel];
    s.cam = { x: 0, y: 0, z: 1 };
    try {
      const had = new Set(s.doc.order);
      // (a drawing that will not go down is skipped, not left to stop the rest)
      try { editor.armPattern(d.slug); tap(x, y); } catch (e) { console.warn("skipped", d.slug, e); s.remove(s.doc.order.filter((id) => !had.has(id))); return; }
      // room is left for everything it will ever show, not only what its first moment shows
      const mine = s.doc.order.filter((id) => !had.has(id)), now = boundsOf(s.doc, mine), g0 = s.doc.shapes[mine[0] ?? ""]?.group;
      // (a part may also stand somewhere else in a later moment)
      const all = g0 && s.doc.scenes?.[g0] ? unionOf(editor.moments(g0)) : null;
      const b = now && all ? { x: Math.min(now.x, all.x), y: Math.min(now.y, all.y), w: Math.max(now.x + now.w, all.x + all.w) - Math.min(now.x, all.x), h: Math.max(now.y + now.h, all.y + all.h) - Math.min(now.y, all.y) } : now;
      if (!b) return;
      // (its name goes over it on one line, and takes room of its own when it is wider than the drawing)
      const said = `${d.slug}  ·  ${d.name}`, tl = layoutText(said, Infinity, 22), room = Math.max(b.w, Math.ceil(tl.w) + 40);
      const key = o.row?.(d) ?? null;
      if (x > 0 && (o.row ? key !== last : x + room > 3000)) { x = 0; y += row + gap; row = 0; }
      last = key;
      // moved so its top-left corner is where the row has got to
      s.select(mine);
      editor.nudge(x - b.x, y - b.y);
      // its slug and name over it, so it can be pointed to by name (on one line, however long: a name to read off)
      s.run(() => s.put({ id: `name-${d.slug}`, kind: "text", x, y: y - 78, w: Math.ceil(tl.w) + 2, h: tl.h, text: said, size: 22, tone: "muted", fine: {} } as TextShape));
      if (y === 0) first.push(`name-${d.slug}`, ...mine);
      o.placed?.(d.slug, mine);
      x += room + gap; row = Math.max(row, b.h);
    } finally {
      s.select(sel.filter((id) => s.doc.shapes[id]));
      s.cam = z0;
      editor.motion = true;
      s.emit();
    }
  };
  // the view on the first row, at a size it can be read at
  const look = () => { editor.fit(first.filter((id) => s.doc.shapes[id])); s.emit(); };
  return { add, look };
}
function placeRest(editor: Editor, v: Variant) {
  const s = editor.store;
  // an empty board, for tools that put their own drawing down (checks/look.mjs)
  if (v.scene === "blank") return;
  if (v.scene === "moves") {
    // a small drawing caught in the middle of being made to move: in its second moment one part has been moved and one hidden
    const bx = (id: string, x: number, text: string): Box => ({ id, kind: "rect", x, y: 0, w: 150, h: 68, text, tone: "ink", fill: "none" });
    const wire = (id: string, a: string, b: string): Arrow => ({ id, kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: a, ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: b, ax: 0.5, ay: 0.5 } } });
    s.run(() => s.put(bx("m1", 0, "Request"), bx("m2", 250, "Worker"), bx("m3", 500, "Store"), wire("mw1", "m1", "m2"), wire("mw2", "m2", "m3")));
    s.select(["m1", "m2", "m3", "mw1", "mw2"]);
    editor.motion = true;
    editor.animate();
    s.run(() => s.put({ ...(s.doc.shapes.m2 as Box), y: 110 }, { ...(s.doc.shapes.m3 as Box), away: true }, { ...(s.doc.shapes.mw2 as Arrow), away: true }));
    s.cam = { x: 325 - window.innerWidth / 2, y: 90 - (window.innerHeight - 70) / 2, z: 1 };
    s.emit();
    return;
  }
  if (v.scene) {
    // one animated diagram, put down as anyone would put it down, and left selected
    editor.armPattern(v.scene);
    editor.down({ x: 0, y: 0, button: 0, shift: false, alt: false, meta: false, id: 1, touch: false });
    editor.up({ x: 0, y: 0, button: 0, shift: false, alt: false, meta: false, id: 1, touch: false });
    // a lab board about working inside: stepped in, one part picked
    if (v.pick) { const want = s.doc.order.map((id) => s.doc.shapes[id]!).find((sh) => !sh.away && (v.pick === "wire" ? isArrow(sh) : isBox(sh) && sh.kind === "panel")); const g0 = want?.group; if (want && g0) editor.pickPart(g0, want.id); }
    if (v.select) { const g0 = Object.keys(s.doc.scenes ?? {})[0], first = s.doc.order.find((id) => { const sh = s.doc.shapes[id]!; return !sh.away && isBox(sh); }); if (g0 && first) editor.pickPart(g0, first); }
    // a lab board about selecting: it starts with nothing selected
    if (new URLSearchParams(window.location.search).get("bare") === "1") s.select([]);
    // a board that is only looked at and worked on, not played, is fitted to what is there to see
    const b = boundsOf(s.doc, v.still ? s.doc.order.filter((id) => !s.doc.shapes[id]!.away) : s.doc.order);
    // a timeline takes the foot of the board: the drawing is fitted into what is left above it
    const foot = 0;
    if (b) { const z = Math.min(1, (window.innerWidth - 80) / b.w, (window.innerHeight - 250 - foot) / b.h); s.cam = { x: b.x + b.w / 2 - window.innerWidth / 2 / z, y: b.y + b.h / 2 - (window.innerHeight - 70 - foot) / 2 / z, z }; }
    s.emit();
    return;
  }
  const box = (id: string, kind: BoxKind, x: number, y: number, text: string, extra: Partial<Box> = {}): Box => ({ id, kind, x, y, w: KINDS[kind].w, h: KINDS[kind].h, text, tone: "ink", fill: "none", ...extra });
  const arrow = (id: string, a: string, b: string): Arrow => ({
    id, kind: "arrow", text: "", route: "elbow", heads: "end", tone: "ink",
    a: { x: 0, y: 0, bind: { id: a, ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: b, ax: 0.5, ay: 0.5 } },
  });
  s.put(
    box("zone", "boundary", -110, -110, "Region", { w: 430, h: 250 }),
    box("d1", "card", -330, -28, "Client"), box("d2", "machine", -80, -78, "Worker"), box("d3", "panel", 140, -70, "Queue"),
    box("m1", "meter", -68, 70, "Load", { w: 150 }), box("q1", "queue", 136, 62, "Waiting"),
    arrow("a1", "d1", "d2"), arrow("a2", "d2", "d3"),
  );
  if (v.select) s.select(["d2"]);
  if (v.tool) s.tool = v.tool;
  const r = boundsOf(s.doc, s.doc.order)!;
  const left = v.library === "rail" ? 316 : v.dock === "left" ? 76 : 40;
  const z = Math.min(1, (window.innerWidth - left - 40) / r.w);
  s.cam = { x: r.x + r.w / 2 - (left + (window.innerWidth - left - 40) / 2) / z, y: r.y + r.h / 2 - window.innerHeight / 2 / z, z };
  editor.overlay.stubsFor = v.select && v.connect === "stubs" ? "d2" : null;
  s.emit();
}

// ── typing ──────────────────────────────────────────────────────────
function TextEditor({ editor, shape, dark }: { editor: Editor; shape: Shape; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const store = editor.store;
  const z = store.cam.z;
  const t = themeFor(dark);
  const done = useRef(false);
  // typed in the faces it is set in
  const own = shape.face && FACE_LIST.some((f) => f.id === shape.face) ? faceFonts(shape.face as Face) : { font: FONT, mono: MONO };

  // What was typed, not how it is shown: words set in capitals are still
  // kept as they were typed. (Such labels are a single line.)
  // words shown in capitals are read as they were typed, not as they are shown
  // a timeline's points and segments' parts are typed a line each, so Enter starts the next one
  const listed = isBox(shape) && (shape.kind === "timeline" || shape.kind === "segments");
  const typed = (el: HTMLElement) => listed ? el.innerText.replace(/\n+$/, "") : (isBox(shape) && labelSpot(shape).voiced ? (el.textContent ?? "").replace(/\n/g, " ") : isBox(shape) && labelTrack(shape) !== undefined ? (el.textContent ?? "") : el.innerText);
  useLayoutEffect(() => {
    const el = ref.current!;
    // a legend is typed as it reads, a row a line, so each colour's name is the line beside it
    el.innerText = isBox(shape) && shape.kind === "legend" ? legendLines(store.doc, shape).join("\n") : shape.text;
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const commit = () => {
      if (done.current) return;
      done.current = true;
      editor.commitText(typed(el));
    };
    editor.flushText = commit;
    // no commit here: React may run this cleanup and set up again while the
    // editor is still open; blur, Enter and pointer presses do the saving
    return () => {
      editor.flushText = () => {};
    };
    // the editor is keyed by shape id, so this runs once per edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    editor.commitText(ref.current ? typed(ref.current) : "");
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return; // Enter is choosing a candidate, not finishing
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey && !listed)) {
      e.preventDefault();
      finish();
      // Escape keeps what was typed and always goes back to the pointer
      if (e.key === "Escape" && store.tool !== "select") editor.setTool("select");
    } else if (e.key === "Tab" && isBox(shape)) {
      // Tab finishes this box and starts the next one, joined to it
      e.preventDefault();
      finish();
      editor.quickCreate(e.shiftKey ? 1 : 0);
    }
  };

  const base: React.CSSProperties = {
    fontFamily: own.font, fontWeight: WEIGHT, lineHeight: LINE, outline: "none", caretColor: t.accent, textRendering: "geometricPrecision",
    whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text", cursor: "text",
  };
  const sx = (x: number) => (x - store.cam.x) * z, sy = (y: number) => (y - store.cam.y) * z;
  // plain text only: nothing pasted brings its formatting or pictures with it
  const common = { ref, contentEditable: "plaintext-only" as const, suppressContentEditableWarning: true, onKeyDown: onKey, onBlur: finish, spellCheck: false } as const;

  if (listed && isBox(shape)) {
    // typed as a list under it, a point or a part a line, in the order they stand
    return (
      <div {...common} className="absolute" style={{ ...base, left: sx(shape.x), top: sy(shape.y + shape.h) + 8, minWidth: 160, whiteSpace: "pre", textAlign: "left", fontSize: 13, lineHeight: "20px", padding: "6px 10px", background: t.bg, border: `1px solid ${t.accent}`, borderRadius: 8, color: t.text }} />
    );
  }
  if (isBox(shape) && labelSpot(shape).voiced) {
    // a header, a name or a caption: typed where it sits, in the voice it is drawn in
    const spot = labelSpot(shape), say = voiced("", spot.size, spot.track);
    return (
      <div className="pointer-events-none absolute" style={{ left: sx(shape.x), top: sy(shape.y), width: shape.w * z, height: shape.h * z, transform: shape.rot ? `rotate(${shape.rot}rad)` : undefined }}>
        <div
          {...common}
          className="pointer-events-auto absolute"
          style={{
            ...base, whiteSpace: "pre", fontFamily: say.family, fontWeight: say.font.startsWith("500") ? 500 : WEIGHT, fontSize: spot.size * z, letterSpacing: say.track * z, textTransform: say.track && !spot.asIs ? "uppercase" : undefined,
            left: (spot.x - shape.x) * z, top: (spot.y - shape.y) * z, height: spot.h * z, lineHeight: `${spot.h * z}px`,
            minWidth: 14 * z, width: spot.align === "center" ? spot.w * z : undefined, textAlign: spot.align,
            color: KINDS[shape.kind].label === "caption" || shape.kind === "frame" ? t.text : labelColor(t, shape.tone, shape.fill === "solid" && KINDS[shape.kind].label === "header"),
            // a name interrupts the fence it rides on
            ...(shape.kind === "boundary" ? { background: t.bg, borderRadius: (spot.h * z) / 2 } : {}),
          }}
        />
      </div>
    );
  }
  if (isBox(shape)) {
    return (
      <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: sx(shape.x), top: sy(shape.y), width: shape.w * z, height: shape.h * z, transform: shape.rot ? `rotate(${shape.rot}rad)` : undefined }}>
        <div
          {...common}
          className="pointer-events-auto"
          style={{ ...base, minWidth: 8, maxWidth: labelWidth(shape) * z, fontSize: (shape.size ?? LABEL_SIZE) * z, textAlign: "center", color: labelColor(t, shape.tone, shape.fill === "solid"), ...(labelTrack(shape) === undefined ? {} : { fontFamily: own.mono, fontWeight: 500, letterSpacing: labelTrack(shape)! * (shape.size ?? LABEL_SIZE) * z, ...(shape.fine?.text || shape.fine?.typed || shape.cased ? {} : { textTransform: "uppercase" as const }) }) }}
        />
      </div>
    );
  }
  if (isText(shape)) {
    return (
      <div
        {...common}
        className="absolute"
        style={{
          // it wraps where it will be drawn wrapping
          ...base, left: sx(shape.x), top: sy(shape.y), minWidth: 4, ...(shape.fine ? { whiteSpace: "pre" as const } : { maxWidth: wrapAt(shape.size) * z, width: "max-content" }), fontSize: shape.size * z, color: labelColor(t, shape.tone), ...(shape.track === undefined ? {} : { fontFamily: MONO, fontWeight: 500, letterSpacing: shape.track * shape.size * z }),
          // in its own face, weight and setting where it has them
          ...(shape.face && FACE_LIST.some((f) => f.id === shape.face) ? { fontFamily: shape.track === undefined ? faceFonts(shape.face as Face).font : faceFonts(shape.face as Face).mono } : {}), ...(shape.weight ? { fontWeight: shape.weight } : {}), ...(shape.align ? { textAlign: shape.align } : {}),
          // turned about where its middle was when typing began
          ...(shape.rot ? { transform: `rotate(${shape.rot}rad)`, transformOrigin: `${(shape.w * z) / 2}px ${(shape.h * z) / 2}px` } : {}),
        }}
      />
    );
  }
  // an arrow's label is typed where it will sit
  const r = arrowLabelRect(store.doc, shape);
  const onLine = labelOnLine();
  return (
    <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: sx(r.x + r.w / 2), top: sy(r.y + r.h / 2), width: 0, height: 0 }}>
      <div
        {...common}
        className="pointer-events-auto shrink-0"
        style={{
          ...base, minWidth: 8, width: "max-content", maxWidth: ARROW_LABEL_W * z, fontSize: ARROW_LABEL_SIZE * z, textAlign: "center", color: labelColor(t, shape.tone),
          // on the line, the words interrupt it from the first letter, exactly as they will when finished
          ...(onLine ? { background: t.bg, padding: `${1 * z}px ${4 * z}px`, minWidth: 14 * z } : {}),
        }}
      />
    </div>
  );
}

// ── styling what is selected ────────────────────────────────────────
// (on a phone the bar wraps; its groups stand apart by space alone, so no divider dangles at the end of a line)
const Rule = () => <span className="mx-2 hidden h-4 w-px shrink-0 bg-kumo-line sm:block" />;
const same = <T,>(xs: T[]): T | null => (xs.length && xs.every((x) => x === xs[0]) ? xs[0]! : null);

// lining several shapes up. Each is offered only where it tidies: a row can
// share a top, a middle or a bottom, but lining it up by its left edges would
// pile it into one spot, so that is not there to press.
const ARRANGE: { label: string; icon: Icon; can: (e: Editor) => boolean; run: (e: Editor) => void }[] = [
  { label: "Align left", icon: AlignLeftSimple, can: (e) => e.canAlign("left"), run: (e) => e.align("left") },
  { label: "Align centres", icon: AlignCenterHorizontalSimple, can: (e) => e.canAlign("centre"), run: (e) => e.align("centre") },
  { label: "Align right", icon: AlignRightSimple, can: (e) => e.canAlign("right"), run: (e) => e.align("right") },
  { label: "Align top", icon: AlignTopSimple, can: (e) => e.canAlign("top"), run: (e) => e.align("top") },
  { label: "Align middles", icon: AlignCenterVerticalSimple, can: (e) => e.canAlign("middle"), run: (e) => e.align("middle") },
  { label: "Align bottom", icon: AlignBottomSimple, can: (e) => e.canAlign("bottom"), run: (e) => e.align("bottom") },
  { label: "Space evenly across", icon: ArrowsOutLineHorizontal, can: (e) => e.canDistribute("x"), run: (e) => e.distribute("x") },
  { label: "Space evenly down", icon: ArrowsOutLineVertical, can: (e) => e.canDistribute("y"), run: (e) => e.distribute("y") },
  // one to many, many to one: a trunk through a junction that branches
  { label: "Fan out from the first selected", icon: GitFork, can: (e) => e.canFan(), run: (e) => e.fan("out") },
  { label: "Gather into the last selected", icon: GitMerge, can: (e) => e.canFan(), run: (e) => e.fan("in") },
];

function StyleBar({ editor, shapes, leaving, v, typing }: { editor: Editor; shapes: Shape[]; leaving: boolean; v: Variant; typing?: boolean }) {
  const store = editor.store;
  const boxes = shapes.filter(isBox), arrows = shapes.filter(isArrow), texts = shapes.filter(isText);
  const arrange = shapes.filter((x) => !isArrow(x)).length > 1 ? ARRANGE.filter((a) => a.can(editor)) : [];
  const dark = typeof document !== "undefined" && document.documentElement.dataset.mode === "dark";
  const t = themeFor(dark);
  // while the Arrow tool is active the bar is about the next arrow, unless arrows are selected
  const routeOnly = shapes.length === 0 || (store.tool === "arrow" && arrows.length === 0);
  // are the selection's words set in the label face (a welded shape's name, a wire's words, text given a tracking)?
  const worded = shapes.filter((x) => x.text), mono = worded.length > 0 && worded.every((x) => (isBox(x) ? labelTrack(x) !== undefined : x.track !== undefined));

  // Shipped: one fixed place, top centre, so it never covers the work.
  // Alternatives (see /lab): riding above the selection, or docked by the tools.
  const toolsOnTop = v.dock === "top" || v.dock === "tl" || v.dock === "tr";
  let place = "left-1/2 -translate-x-1/2 " + (toolsOnTop ? "top-[64px]" : "top-4");
  let style: React.CSSProperties | undefined;
  if (v.bar === "dock") place = "left-1/2 -translate-x-1/2 " + (v.dock === "bottom" || v.dock === "bl" || v.dock === "br" ? "bottom-[64px]" : "bottom-4");
  if (v.bar === "follow") {
    const r = boundsOf(store.doc, shapes.map((sh) => sh.id));
    if (r) {
      const z = store.cam.z;
      const top = (r.y - store.cam.y) * z, bottom = (r.y + r.h - store.cam.y) * z;
      const y = top - 56 > 8 ? top - 56 : bottom + 36;
      place = "-translate-x-1/2";
      style = { left: Math.min(Math.max((r.x + r.w / 2 - store.cam.x) * z, 170), editor.view.w - 170), top: Math.max(8, Math.min(y, editor.view.h - 60)) };
    }
  }
  return (
    <>
    <div className={`absolute flex max-w-[calc(100vw-32px)] flex-wrap items-center justify-center gap-x-1 p-1 sm:gap-x-0 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none] ${place} ${PANEL} ${leaving ? "ui-out" : "ui-in"}`} style={style} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
      {/* the Arrow tool with nothing selected: choose how the next arrows run */}
      {routeOnly && (
        <Choose label="Route"
          value={editor.arrowRoute}
          onPick={(route) => editor.restyle({ route })}
          options={[
            { v: "straight", label: "Straight", node: <LineSegment size={16} /> },
            { v: "elbow", label: "Right-angled", node: <ArrowElbowDownRight size={16} /> },
            { v: "curve", label: "Curved", node: <BezierCurve size={16} /> },
          ]}
        />
      )}
      {!routeOnly && boxes.length === shapes.length && boxes.every((b) => KINDS[b.kind].level) && (
        <>
          <div className="flex">
            <Tip label="Lower" side="bottom">
              <button aria-label="Lower" onClick={() => editor.level(-1)} className={CELL}>
                <Minus size={16} />
              </button>
            </Tip>
            <Tip label="Raise" side="bottom">
              <button aria-label="Raise" onClick={() => editor.level(1)} className={CELL}>
                <Plus size={16} />
              </button>
            </Tip>
          </div>
          <Rule />
        </>
      )}
      {!routeOnly && boxes.length === 1 && shapes.length === 1 && boxes[0]!.kind === "timeline" && (
        <>
          <label className="flex h-8 items-center gap-1.5 whitespace-nowrap px-2 text-[12px] text-kumo-subtle">
            One step
            <input aria-label="One step" defaultValue={boxes[0]!.unit ?? ""} key={boxes[0]!.id} maxLength={24} size={7} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              onBlur={(e) => editor.unit(e.target.value.trim())} className="h-6 rounded-md bg-black/[0.04] px-1.5 text-[12px] text-kumo-default outline-none focus:ring-1 focus:ring-kumo-brand dark:bg-white/[0.06]" />
          </label>
          <Rule />
        </>
      )}
      {!routeOnly && boxes.length === shapes.length && boxes.every((b) => isBasic(b.kind)) && (
        <>
          <Choose label="Shape"
            value={same(boxes.map((b) => b.kind))}
            onPick={(kind) => editor.restyle({ kind })}
            options={[
              { v: "rect", label: "Rectangle", node: <Rectangle size={16} /> },
              { v: "ellipse", label: "Ellipse", node: <Circle size={16} /> },
              { v: "diamond", label: "Diamond", node: <Diamond size={16} /> },
            ]}
          />
          <Rule />
        </>
      )}
      {!routeOnly && boxes.length === shapes.length && boxes.every((b) => b.kind === "boundary") && (
        <>
          {/* a place drawn as a fence (dashed, its name on a plate astride the edge) or as a frame (solid, its name inside the corner) */}
          <Choose<"edge" | "corner"> label="Name"
            value={same(boxes.map((b) => b.title ?? "edge"))}
            onPick={(title) => editor.restyle({ title })}
            options={[
              { v: "edge", label: "Fence: name on the edge", node: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="1.5" y="3.5" width="13" height="11" rx="2" strokeDasharray="2.2 1.6" /><rect x="3.5" y="1.5" width="6" height="4" rx="2" fill="var(--color-kumo-base)" /></svg> },
              { v: "corner", label: "Frame: name in the corner", node: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" /><path d="M4 5h5" strokeWidth="1.6" /></svg> },
            ]}
          />
          <Rule />
          {/* a place's ground: bare, tinted, shaded, or ruled in diagonals one way or both */}
          <Choose<"none" | "tint" | "solid" | "hatch" | "cross"> label="Ground"
            value={same(boxes.map((b) => b.pattern ?? (b.fill === "tint" ? "tint" : b.fill === "solid" ? "solid" : "none")))}
            onPick={(ground) => editor.restyle({ ground })}
            options={[
              { v: "none", label: "Bare", node: <span className="size-3 rounded-[2px] border border-dashed border-current" /> },
              { v: "tint", label: "Tinted", node: <span className="size-3 rounded-[2px] border border-dashed border-current bg-current/10" /> },
              { v: "solid", label: "Shaded", node: <span className="size-3 rounded-[2px] border border-dashed border-current bg-current/25" /> },
              { v: "hatch", label: "Hatched", node: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="11" height="11" rx="2" strokeDasharray="2 1.5" /><path d="M2 8 8 2M2 12 12 2M6 12l6-6" strokeWidth="0.9" /></svg> },
              { v: "cross", label: "Cross-hatched", node: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="11" height="11" rx="2" strokeDasharray="2 1.5" /><path d="M2 8 8 2M2 12 12 2M6 12l6-6M6 2l6 6M2 2l10 10M2 6l6 6" strokeWidth="0.8" /></svg> },
            ]}
          />
          <Rule />
        </>
      )}
      {!routeOnly && boxes.length === shapes.length && boxes.every((b) => KINDS[b.kind].fills) && (
        <>
          <Choose<Fill> label="Fill"
            value={same(boxes.map((b) => b.fill))}
            onPick={(fill) => editor.restyle({ fill })}
            options={[
              { v: "none", label: "Outline", node: <span className="size-3 rounded-[2px] border border-current" /> },
              { v: "tint", label: "Tinted", node: <span className="size-3 rounded-[2px] border border-current bg-current/20" /> },
              { v: "solid", label: "Filled", node: <span className="size-3 rounded-[2px] bg-current" /> },
            ]}
          />
          <Rule />
        </>
      )}
      {!routeOnly && arrows.length === shapes.length && (
        <>
          <Choose label="Route"
            value={same(arrows.map((a) => a.route))}
            onPick={(route) => editor.restyle({ route })}
            options={[
              { v: "straight", label: "Straight", node: <LineSegment size={16} /> },
              { v: "elbow", label: "Right-angled", node: <ArrowElbowDownRight size={16} /> },
            { v: "curve", label: "Curved", node: <BezierCurve size={16} /> },
            ]}
          />
          <Rule />
          <Choose label="Arrowheads"
            value={same(arrows.map((a) => a.heads))}
            onPick={(heads) => editor.restyle({ heads })}
            options={[
              { v: "none", label: "No arrowhead", node: <Minus size={16} /> },
              { v: "end", label: "One arrowhead", node: <ArrowRight size={16} /> },
              { v: "both", label: "Two arrowheads", node: <ArrowsHorizontal size={16} /> },
            ]}
          />
          {(() => {
            // each end can carry a port: the socket a lasting connection is plugged into, lit when something is
            const at = (e: "a" | "b") => arrows.every((a) => a.ports === e || a.ports === "both"), any = arrows.some((a) => a.ports), lit = arrows.every((a) => !a.unlit);
            const tog = (label: string, on: boolean, run: () => void, node: React.ReactNode) => (
              <Tip key={label} label={label} side="bottom"><button aria-label={label} aria-pressed={on} onClick={run} className={`${CELL} ${on ? "bg-black/[0.07] dark:bg-white/[0.12]" : ""}`}>{node}</button></Tip>
            );
            // a small socket drawn at one end of a line: which end it is at is the picture
            const mark = (end: "a" | "b") => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={end === "a" ? "M7 8h8" : "M1 8h8"} /><rect x={end === "a" ? 1.75 : 9.25} y="5.25" width="5.5" height="5.5" rx="1" /></svg>;
            return (
              <>
                <Rule />
                <div className="flex" role="group" aria-label="Ports">
                  {tog("Port at the start", at("a"), () => editor.port("a", !at("a")), mark("a"))}
                  {tog("Port at the end", at("b"), () => editor.port("b", !at("b")), mark("b"))}
                  {tog("Words in a pill", arrows.every((a) => a.pill), () => editor.restyle({ pill: !arrows.every((a) => a.pill) }), <svg width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M0.5 8h3M14.5 8h3" /><path d="M7 4.5h4a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 8 3.5 3.5 0 0 1 7 4.5Z" /></svg>)}
                  {any && tog("Plugged in", lit, () => editor.lit(!lit), <Plugs size={16} weight={lit ? "fill" : "regular"} />)}
                </div>
              </>
            );
          })()}
          <Rule />
        </>
      )}
      {!routeOnly && texts.length === 0 && (
        <>
          <Choose<Line | "solid"> label="Line"
            value={same(shapes.map((x) => (isText(x) ? "solid" : (x.line ?? "solid"))))}
            onPick={(line) => editor.restyle({ line })}
            options={[
              { v: "solid", label: "Solid line", node: <span className="h-0 w-3.5 border-t-[1.5px] border-current" /> },
              { v: "dashed", label: "Dashed line", node: <span className="h-0 w-3.5 border-t-[1.5px] border-dashed border-current" /> },
              { v: "dotted", label: "Dotted line", node: <span className="h-0 w-3.5 border-t-[2px] border-dotted border-current" /> },
            ]}
          />
          <Rule />
        </>
      )}
      {!routeOnly && arrange.length > 0 && (
        <>
          <div className="flex">
            {arrange.map((a) => (
              <Tip key={a.label} label={a.label} side="bottom">
                <button aria-label={a.label} onClick={() => a.run(editor)} className={CELL}>
                  <a.icon size={16} />
                </button>
              </Tip>
            ))}
          </div>
          <Rule />
        </>
      )}
      {!routeOnly && shapes.length > 0 && !typing && (
        <>
          <div className="flex">
            {/* a switch for a way of looking: it shows or hides how things move, and changes nothing. Filled in when what is selected does move. */}
            <Tip label={editor.motion ? "Hide movement" : "Show movement"} side="bottom">
              <button aria-label="Animate" aria-pressed={editor.motion} onClick={() => editor.setMotion(!editor.motion)} className={`${CELL} ${editor.motion ? "bg-black/[0.07] dark:bg-white/[0.12]" : ""}`}>
                <FilmStrip size={16} weight={editor.sceneGroup ? "fill" : "regular"} />
              </button>
            </Tip>
          </div>
          <Rule />
        </>
      )}
      {/* its words: font, size, weight and case, in the bar */}
      {!routeOnly && (typing || shapes.some((x) => x.text)) && (
        <>
          <TypeMenu editor={editor} shapes={shapes.filter((x) => x.text && !isArrow(x)).length ? shapes.filter((x) => x.text && !isArrow(x)) : shapes.filter((x) => x.text)} mono={mono} />
          <Rule />
        </>
      )}
      {!routeOnly && <Swatches
        value={same(shapes.map((s) => s.tone))}
        onPick={(tone) => editor.restyle({ tone })}
        options={TONES.map((tone) => ({
          v: tone,
          label: TONE_NAMES[tone],
          // the chosen colour wears a ring, set off from the dot by a gap
          node: (on: boolean) => (
            <span className="size-3 rounded-full transition-shadow duration-150" style={{ background: t.tones[tone], boxShadow: on ? `0 0 0 2px var(--color-kumo-base), 0 0 0 3px ${t.tones[tone]}` : "none" }} />
          ),
        }))}
      />}
    </div>
    </>
  );
}

/** The colour of what is selected: one dot in the bar, the rest of the colours in its pane. */
function Swatches({ value, onPick, options }: { value: Tone | null; onPick: (t: Tone) => void; options: { v: Tone; label: string; node: (on: boolean) => React.ReactNode }[] }) {
  const cur = options.find((o) => o.v === value);
  return (
    <Pop label="Colour" width={176} face={() => <span className="flex size-5 items-center justify-center">{cur ? cur.node(false) : <span className="size-3 rounded-full border border-dashed border-kumo-subtle" />}</span>}>
      {(close) => (
        <div role="listbox" aria-label="Colour" className="grid grid-cols-4 gap-1 px-2 py-1">
          {options.map((o) => (
            <Tip key={o.v} label={o.label} side="bottom">
              <button role="option" aria-label={o.label} aria-selected={o.v === value} onClick={() => { onPick(o.v); close(); }}
                className="ctl flex size-9 items-center justify-center rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">{o.node(o.v === value)}</button>
            </Tip>
          ))}
        </div>
      )}
    </Pop>
  );
}

/** A control that opens a small pane under itself: the bar keeps one cell per kind of choice, and the choices wait in the pane. */
function Pop({ label, width = 220, face, children }: { label: string; width?: number; face: (open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), pane = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ x: Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8), y: r.bottom + 8 });
    const away = (e: PointerEvent) => { if (!pane.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
  }, [open, width]);
  return (
    <>
      <Tip label={label} side="bottom">
        <button ref={btn} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
          className={`ctl flex h-8 shrink-0 items-center gap-1 rounded-md pl-2 pr-1 text-[13px] text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${open ? "bg-black/[0.08] dark:bg-white/[0.14]" : ""}`}>
          {face(open)}
          <CaretDown size={11} className="text-kumo-subtle" />
        </button>
      </Tip>
      {open && createPortal(
        <div ref={pane} role="dialog" aria-label={label} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault(); }}
          className={`fixed z-50 py-1 ui-in ${PANEL}`} style={{ left: at.x, top: at.y, width }}>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}
/** One choice among a few, as a single cell showing the one chosen; the others are in its pane, each named. */
function Choose<T extends string | number>({ label, options, value, onPick }: { label: string; options: { v: T; label: string; node: React.ReactNode | ((on: boolean) => React.ReactNode) }[]; value: T | null; onPick: (v: T) => void }) {
  const cur = options.find((o) => o.v === value);
  const draw = (o: (typeof options)[number], on: boolean) => (typeof o.node === "function" ? o.node(on) : o.node);
  return (
    <Pop label={label} width={200} face={() => <span className="flex size-5 items-center justify-center">{cur ? draw(cur, false) : <span className="text-kumo-subtle">–</span>}</span>}>
      {(close) => (
        <div role="listbox" aria-label={label} className="px-1">
          {options.map((o) => (
            <button key={String(o.v)} role="option" aria-selected={o.v === value} onClick={() => { onPick(o.v); close(); }}
              className="ctl flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              <span className="flex size-5 items-center justify-center">{draw(o, false)}</span>
              <span className="flex-1 text-left">{o.label}</span>
              {o.v === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

/** The words of what is selected, in one control: it shows the face and size they are set in now, and opens onto everything about them. */
function TypeMenu({ editor, shapes, mono }: { editor: Editor; shapes: Shape[]; mono: boolean }) {
  const texts = shapes.filter(isText), boxes = shapes.filter(isBox);
  const faceNow = same(shapes.map((x) => (x.face as Face | undefined) ?? face()));
  const sizeOf = (x: Shape) => Math.round(isText(x) ? x.size : isBox(x) ? (x.size ?? labelSpot(x).size) : (x.size ?? ARROW_LABEL_SIZE));
  const sizeNow = same(shapes.map(sizeOf));
  const weightNow = same(shapes.map((x) => (isText(x) ? (x.weight ?? x.fine?.fw ?? 500) : isBox(x) ? (x.weight ?? x.fine?.fw ?? 500) : 500)));
  const trackNow = boxes.length ? same(boxes.map((b) => Math.round((labelTrack(b) ?? 0) * 100))) : null;
  const caseNow = same(shapes.map((x) => { const t = x.text ?? ""; return t && t === t.toUpperCase() && t !== t.toLowerCase() ? "upper" : t === t.toLowerCase() ? "lower" : "title"; }));
  const alignNow = texts.length === shapes.length ? same(texts.map((x) => x.align ?? "left")) : null;
  const named = (id: Face) => { const f = FACE_LIST.find((x) => x.id === id)!; return mono ? f.mono : f.name; };
  const fam = (id: Face) => (mono ? faceFonts(id).mono : faceFonts(id).font);
  const [draft, setDraft] = useState<string | null>(null);
  const setSize = (n: number) => editor.restyle({ size: Math.min(160, Math.max(6, Math.round(n))) });
  const step = (d: number) => setSize((sizeNow ?? 14) + d);
  const bold = weightNow === 700;
  const CASES = [["title", "Capital to each word", "Aa"], ["upper", "All capitals", "AA"], ["lower", "All small", "aa"]] as const;
  const ci = Math.max(0, CASES.findIndex((c) => c[0] === caseNow)), nextCase = CASES[(ci + 1) % 3]!;
  const SETS = [["left", "Set left", TextAlignLeft], ["center", "Centred", TextAlignCenter], ["right", "Set right", TextAlignRight]] as const;
  const si = Math.max(0, SETS.findIndex((x) => x[0] === alignNow)), nextSet = SETS[(si + 1) % 3]!, SetIcon = SETS[si]![2];
  return (
    <div className="flex items-center" role="group" aria-label="Type">
      {/* the face: each offered as it looks; how far apart the letters stand belongs with it */}
      <Pop label="Font" width={232} face={() => <span className="max-w-[104px] truncate" style={{ fontFamily: faceNow ? fam(faceNow) : undefined }}>{faceNow ? named(faceNow) : "Mixed"}</span>}>
        {() => (
          <>
            <div role="listbox" aria-label="Font" className="px-1">
              {FACE_LIST.map((f) => (
                <button key={f.id} role="option" aria-selected={faceNow === f.id} onClick={() => editor.restyle({ face: f.id })}
                  className="ctl flex h-8 w-full items-center justify-between rounded-md px-2 text-[14px] text-kumo-default hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
                  <span style={{ fontFamily: fam(f.id) }}>{mono ? f.mono : f.name}</span>
                  {faceNow === f.id && <Check size={14} />}
                </button>
              ))}
            </div>
            {boxes.length > 0 && (
              <>
                <div className="mx-3 my-1 h-px bg-kumo-line" />
                <label className="flex h-9 items-center gap-3 px-3 text-[12px] text-kumo-subtle">
                  Spacing
                  <input type="range" min={0} max={30} step={1} value={trackNow ?? 0} aria-label="Letter spacing"
                    onChange={(e) => editor.restyle({ track: +e.target.value / 100 })}
                    className="h-1 flex-1 cursor-pointer accent-[var(--color-kumo-brand)]" />
                </label>
              </>
            )}
          </>
        )}
      </Pop>
      {/* the size: a step either way, or typed */}
      <div className="ml-0.5 flex h-8 items-center rounded-md" role="group" aria-label="Size">
        <Tip label="Smaller" side="bottom"><button aria-label="Smaller" onClick={() => step(-1)} className={`${CELL} !w-6`}><Minus size={12} /></button></Tip>
        <input aria-label="Size" inputMode="numeric" value={draft ?? (sizeNow ?? "")} placeholder="–"
          onFocus={(e) => { setDraft(String(sizeNow ?? "")); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={() => { if (draft) setSize(+draft); setDraft(null); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "ArrowUp") { e.preventDefault(); step(1); } if (e.key === "ArrowDown") { e.preventDefault(); step(-1); } if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); } }}
          className="h-7 w-8 rounded-md bg-transparent text-center text-[13px] tabular-nums text-kumo-default outline-none hover:bg-black/[0.04] focus:bg-black/[0.05] focus:ring-1 focus:ring-kumo-brand dark:hover:bg-white/[0.06]" />
        <Tip label="Larger" side="bottom"><button aria-label="Larger" onClick={() => step(1)} className={`${CELL} !w-6`}><Plus size={12} /></button></Tip>
      </div>
      <Rule />
      <Tip label="Bold" side="bottom">
        <button aria-label="Bold" aria-pressed={bold} onClick={() => editor.restyle({ weight: bold ? 500 : 700 })} className={`${CELL} text-[14px] font-bold ${bold ? "bg-black/[0.08] dark:bg-white/[0.14]" : ""}`}>B</button>
      </Tip>
      <Tip label={`Case: ${nextCase[1].toLowerCase()}`} side="bottom">
        <button aria-label="Case" onClick={() => editor.restyle({ case: nextCase[0] })} className={`${CELL} text-[13px]`}>{CASES[ci]![2]}</button>
      </Tip>
      {alignNow !== null && (
        <Tip label={nextSet[1]} side="bottom">
          <button aria-label="Setting" onClick={() => editor.restyle({ align: nextSet[0] })} className={CELL}><SetIcon size={16} /></button>
        </Tip>
      )}
    </div>
  );
}

/** Menu rows that take a picture of `ids`, or of the whole board. */
function pictures(editor: Editor, ids: Set<Id> | null): { label: string; keys?: string; run: () => void }[] {
  const doc = editor.store.doc, t = themeFor(document.documentElement.dataset.mode === "dark" || !!document.querySelector('[data-mode="dark"]'));
  return [
    { label: "Copy as image", keys: "⇧⌘C", run: () => copyImage(editor, ids) },
    { label: "Save as PNG", run: () => void toPNG(doc, ids, t).then((b) => b && save("canvas.png", b)) },
    { label: "Save as SVG", run: () => void toSVG(doc, ids, t).then((svg) => svg && save("canvas.svg", new Blob([svg], { type: "image/svg+xml" }))) },
  ];
}
function copyImage(editor: Editor, ids: Set<Id> | null) {
  const t = themeFor(!!document.querySelector('[data-mode="dark"]'));
  // the picture is handed over as a promise, so the copy still counts as coming from the key press
  const png = toPNG(editor.store.doc, ids, t).then((b) => b ?? new Blob());
  void navigator.clipboard?.write([new ClipboardItem({ "image/png": png })]).catch(() => {
    /* not allowed here */
  });
}
function toClipboard(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {
    /* not allowed here: the board's own copy still pastes */
  });
}

// ── right-click ─────────────────────────────────────────────────────
/** Light, dark or as the system is: one button that steps through the three, its icon showing which is chosen. */
function ThemeButton() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(themePref());
    const on = () => setPref(themePref());
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  const next: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const name = THEMES.find((t) => t.id === pref)!.name;
  const Glyph = pref === "light" ? Sun : pref === "dark" ? Moon : Desktop;
  return (
    <Tip label={`Theme: ${name.toLowerCase()}`}>
      <button className={CELL} aria-label={`Theme: ${name}. Change to ${THEMES.find((t) => t.id === next[pref])!.name}`} onClick={() => setThemePref(next[pref])}>
        <Glyph size={16} />
      </button>
    </Tip>
  );
}

const FACE_KEY = "canvas:face:v1";
/** Sets the whole board in another pair of faces, and redraws once they have loaded. */
function chooseFace(editor: Editor, to: Face, keep = true) {
  setFace(to);
  if (keep) localStorage.setItem(FACE_KEY, to);
  editor.store.emit();
  const f = faceFonts(to);
  void document.fonts?.load(`14px ${f.font}`).then(() => document.fonts.load(`500 12px ${f.mono}`)).then(() => { clearTextCache(); editor.store.emit(); });
}
function ContextMenu({ editor, at, close, leaving }: { editor: Editor; at: { x: number; y: number; onShape: boolean; locked: Id | null }; close: () => void; leaving: boolean }) {
  const store = editor.store;
  const world: Pt = editor.world(at);
  type Row = { label: string; keys?: string; run: () => void; off?: boolean; checked?: boolean } | "rule";
  const rows: Row[] = at.locked
    ? [{ label: "Unlock", run: () => editor.unlock(at.locked!) }]
    : at.onShape
    ? [
        // the same clipboard as ⌘X and ⌘C: the system's
        { label: "Cut", keys: "⌘X", run: () => { toClipboard(editor.serialize()); editor.cut(); } },
        { label: "Copy", keys: "⌘C", run: () => { toClipboard(editor.serialize()); editor.copy(); } },
        { label: "Duplicate", keys: "⌘D", run: () => editor.duplicate() },
        "rule",
        ...pictures(editor, new Set(store.sel)),
        "rule",
        ...(editor.canGroup ? [{ label: "Group", keys: "⌘G", run: () => editor.group() } as Row] : []),
        ...(editor.canUngroup ? [{ label: "Ungroup", keys: "⇧⌘G", run: () => editor.ungroup() } as Row] : []),
        ...(editor.canGroup || editor.canUngroup ? ["rule" as Row] : []),
        { label: "Bring to front", keys: "]", run: () => editor.order("front") },
        { label: "Send to back", keys: "[", run: () => editor.order("back") },
        "rule",
        { label: "Lock", keys: "⇧⌘L", run: () => editor.lock() },
        "rule",
        { label: "Zoom to selection", keys: "⇧2", run: () => editor.fit(store.sel) },
        "rule",
        { label: "Delete", keys: "⌫", run: () => editor.remove() },
      ]
    : [
        { label: "Paste here", keys: "⌘V", run: () => editor.paste(world), off: !editor.canPaste },
        { label: "Select all", keys: "⌘A", run: () => editor.selectAll(), off: store.doc.order.length === 0 },
        "rule",
        ...(store.doc.order.length ? [...pictures(editor, null), "rule" as Row] : []),
        { label: "Zoom to fit", keys: "⇧1", run: () => editor.fit(), off: store.doc.order.length === 0 },
        { label: "Zoom to 100%", keys: "⌘0", run: () => editor.zoomTo(1) },
        "rule",
        { label: "Snap to shapes", checked: store.snap, run: () => { store.snap = !store.snap; store.emit(); } },
        { label: "Dot grid", checked: store.grid, run: () => { store.grid = !store.grid; store.emit(); } },
        "rule",
        // the board's own faces, for whatever has none of its own (a selection's are changed from its bar)
        ...FACE_LIST.map((f): Row => ({ label: `Set in ${f.name}`, checked: face() === f.id, run: () => chooseFace(editor, f.id) })),
        "rule",
        // light or dark, or as the system is (the same choice as the bar's button)
        ...THEMES.map((t): Row => ({ label: t.id === "system" ? "Theme: match system" : `Theme: ${t.name.toLowerCase()}`, checked: themePref() === t.id, run: () => setThemePref(t.id) })),

      ];
  // rows are taller under a finger
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const w = 216, h = rows.reduce((n, r) => n + (r === "rule" ? 9 : coarse ? 40 : 32), 8);
  const left = Math.min(at.x, editor.view.w - w - 8), top = Math.min(at.y, editor.view.h - h - 8);
  // the menu takes the keyboard while it is open: arrows move, Enter chooses
  const usable = rows.map((r, i) => (r !== "rule" && !r.off ? i : -1)).filter((i) => i >= 0);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    // the open menu owns the keyboard: nothing typed here reaches the board twice
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = usable.indexOf(active);
      const next = e.key === "ArrowDown" ? (at + 1) % usable.length : (at <= 0 ? usable.length : at) - 1;
      setActive(usable[next] ?? -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const r = rows[active];
      if (r && r !== "rule") {
        r.run();
        close();
      }
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (editor.key({ key: e.key, code: e.code, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey, repeat: e.repeat })) {
      // the shortcuts shown beside each row work while the menu is open
      e.preventDefault();
      close();
    }
  };
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKey}
      className={`absolute origin-top-left p-1 outline-none ${PANEL} ${leaving ? "ui-out" : "ui-in"}`}
      style={{ left, top, width: w, ["--from" as string]: "-2px" }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows.map((r, i) =>
        r === "rule" ? (
          <div key={i} className="my-1 h-px bg-kumo-line" />
        ) : (
          <button
            key={r.label}
            role="menuitem"
            tabIndex={-1}
            disabled={r.off}
            onPointerMove={() => setActive(r.off ? -1 : i)}
            onPointerLeave={() => setActive(-1)}
            onClick={() => { r.run(); close(); }}
            className={`ctl flex h-8 pointer-coarse:h-10 w-full items-center justify-between rounded-md px-2 text-left text-[13px] text-kumo-default active:!scale-100 disabled:pointer-events-none ${active === i ? "bg-black/[0.05] dark:bg-white/[0.08]" : ""}`}
          >
            <span className="flex items-center gap-2">
              {/* every row keeps the same column for a mark, so labels line up */}
              <span className="flex w-3 justify-center">
                {r.checked !== undefined && <span className={`size-1.5 rounded-full ${r.checked ? "bg-[#2f6bff] dark:bg-[#5b8cff]" : "ring ring-kumo-line"}`} />}
              </span>
              {r.label}
            </span>
            {/* key names mean nothing without keys */}
            {r.keys && <span className="text-[12px] text-kumo-subtle pointer-coarse:hidden">{r.keys}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * Keep a shared board in step with its server. Theirs (an agent drew, someone else moved something) is taken in when nothing of
 * ours is waiting to go; ours is sent a moment after we change it, and kept until the server says it has it, across dropped
 * connections. The last change to reach the server wins. Returns how to stop, and how to wait for ours to be kept.
 */
function follow(editor: Editor, key: string, moved: () => void, problem: (said: string | null) => void, o: { keepView?: boolean } = {}): { stop: () => void; flush: () => Promise<void> } {
  const store = editor.store;
  let ws: WebSocket | null = null, stopped = false, timer: ReturnType<typeof setTimeout> | null = null, retry = 500, first = true;
  // the board as the server last had it (taken in, or ours that it acknowledged); ours differs when it is not this
  let base: Doc | null = null, inflight: { id: number; doc: Doc } | null = null, n = 0;
  let waiters: (() => void)[] = [], backoff = 1000;
  const ours = () => !!base && store.doc !== base;
  const settled = () => { if (!ours() && !inflight) { for (const w of waiters) w(); waiters = []; } };
  // (a board merged with what was drawn here is not what the server has: it is not taken as saved)
  let merging = false;
  store.onAdopted = () => { if (merging) return; base = store.doc; settled(); };
  const send = () => {
    timer = null;
    if (!ws || ws.readyState !== WebSocket.OPEN || inflight || !ours()) return;
    inflight = { id: ++n, doc: store.doc };
    ws.send(JSON.stringify({ type: "put", id: inflight.id, doc: inflight.doc }));
  };
  const soon = () => { if (!timer) timer = setTimeout(send, 250); };
  // the board as the server first sends it, held while a change is in hand here, then taken in with what was drawn meanwhile
  let firstDoc: Doc | null = null;
  const takeFirst = () => {
    if (!firstDoc || store.busy) return;
    const theirs = firstDoc;
    firstDoc = null;
    first = false;
    if (store.doc.order.length) {
      const mine = store.doc, known = new Set(theirs.order);
      base = theirs;
      merging = true;
      try { store.adopt(JSON.stringify({ ...theirs, shapes: { ...theirs.shapes, ...mine.shapes }, order: [...theirs.order, ...mine.order.filter((id) => !known.has(id))], scenes: { ...theirs.scenes, ...mine.scenes } })); } finally { merging = false; }
      // (the server has theirs, not this: what was drawn here is sent)
      soon();
    } else store.adopt(JSON.stringify(theirs));
    editor.invalidate();
    // (a board opened at its link is shown whole; one that just went live here stays where it is being looked at)
    if (!o.keepView) editor.fit();
  };
  const unsub = store.subscribe(() => { if (firstDoc) takeFirst(); else if (ours()) soon(); });
  const open = () => {
    if (stopped) return;
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/b/${key}/live`);
    ws.onopen = () => { retry = 500; };
    ws.onmessage = (e) => {
      let m: { type?: string; doc?: Doc; id?: number };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === "moved") { stopped = true; moved(); return; }
      if (m.type === "gone") { stopped = true; problem("there is no board at this link"); return; }
      if (m.type === "ack" && inflight && m.id === inflight.id) { base = inflight.doc; inflight = null; backoff = 1000; problem(null); if (ours()) soon(); settled(); return; }
      if (m.type === "error") {
        const e = m as { error?: string; retry?: boolean };
        inflight = null;
        // too fast: the same change goes again a little later; too big (or anything else): it stays here, and is said
        if (e.retry) { setTimeout(send, backoff); backoff = Math.min(backoff * 2, 30_000); }
        else problem(e.error ?? "a change was not kept");
        return;
      }
      if (m.type !== "doc" || !m.doc) return;
      if (first) { firstDoc = m.doc; takeFirst(); return; }
      // something of ours not yet kept goes over theirs (it is the later change); otherwise theirs is the board now
      if (ours() || inflight) { soon(); return; }
      store.adopt(JSON.stringify(m.doc));
      editor.invalidate();
    };
    ws.onclose = () => {
      ws = null;
      // what was on its way may not have arrived: it is sent again on the next connection
      inflight = null;
      if (!stopped) setTimeout(open, (retry = Math.min(retry * 2, 8000)));
    };
  };
  open();
  return {
    stop: () => { stopped = true; unsub(); store.onAdopted = null; if (timer) clearTimeout(timer); ws?.close(); },
    // resolves once the server has everything changed here; fails if it has not said so within a few seconds
    flush: () => new Promise<void>((done, failed) => {
      if (base && !ours() && !inflight) return done();
      waiters.push(done);
      send();
      setTimeout(() => failed(new Error("the latest change has not been saved yet")), 5000);
    }),
  };
}

