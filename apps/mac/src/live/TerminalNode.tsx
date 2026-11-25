// A shell on the board. The shell itself lives in the app's own
// process; this is its screen.
import { useEffect, useRef, useState } from "react";
import { TerminalWindow } from "@phosphor-icons/react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { folderName, weld } from "./bridge";
import type { NodeProps } from "./LiveLayer";
import { Dot, FarCard, Head, Owner } from "./LiveLayer";
import { openBeside } from "./place";
import { setFacts, useFact } from "./threads";

const DARK = {
  background: "#161618", foreground: "#e4e4e7", cursor: "#e4e4e7", cursorAccent: "#161618", selectionBackground: "rgba(91,140,255,0.32)",
  black: "#27272a", red: "#ef6a61", green: "#3fbf78", yellow: "#e0a526", blue: "#5b8cff", magenta: "#c084fc", cyan: "#4cc3cf", white: "#c6c6cc",
  brightBlack: "#7c7c82", brightRed: "#f58a82", brightGreen: "#62d394", brightYellow: "#f0bd4f", brightBlue: "#84a9ff", brightMagenta: "#d4a5ff", brightCyan: "#74d7e1", brightWhite: "#fafafa",
};
const SHELLS = new Set(["zsh", "bash", "fish", "sh", "-zsh", "-bash", "login"]);
const ADDRESS = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)?[^\s"'<>)\]]*/;

export function TerminalNode({ box, editor, active, far }: NodeProps) {
  const holder = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const facts = useFact(box.id);
  const [cwd, setCwd] = useState(box.live?.cwd);
  // the address of a server this shell has started, offered as a page
  const [served, setServed] = useState<string | null>(null);

  useEffect(() => {
    const el = holder.current!;
    const t = new Terminal({
      fontFamily: '"SF Mono", "DM Mono", Menlo, Monaco, ui-monospace, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 8000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: DARK,
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.loadAddon(new WebLinksAddon((_e, url) => openBeside(editor, box.id, "browser", { url })));
    // Shift-Escape hands the keys back to the board (plain Escape belongs to whatever runs in the shell)
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.key === "Escape" && e.shiftKey) {
        window.dispatchEvent(new CustomEvent("weld:leave"));
        return false;
      }
      // the app's own shortcuts are not typed into the shell
      if (e.metaKey && ["k", "j", "n", "t", "b", "1", "0"].includes(e.key.toLowerCase())) return false;
      return true;
    });
    t.open(el);
    term.current = t;
    fit.current = f;
    let opened = false, gone = false, tail = "";
    const size = () => {
      // measured in the board's own units, so the grid of letters is the same at every zoom
      const d = f.proposeDimensions();
      if (!d || !Number.isFinite(d.cols) || d.cols < 2 || d.rows < 1) return null;
      if (d.cols !== t.cols || d.rows !== t.rows) t.resize(d.cols, d.rows);
      return d;
    };
    // what it last printed is read a few times a second, however fast it prints
    let noting = 0;
    const read = () => {
      noting = 0;
      const plain = tail.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u001b[=>]/g, "");
      const lines = plain.split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last) setFacts(box.id, { last: last.slice(0, 160) });
      const m = plain.match(ADDRESS);
      if (m) setServed(m[0].replace("0.0.0.0", "localhost").replace(/[.,;:]+$/, ""));
    };
    const note = (d: string) => {
      tail = d.length >= 2000 ? d.slice(-2000) : (tail + d).slice(-2000);
      if (!noting) noting = window.setTimeout(read, 250);
    };
    const start = async () => {
      const d = size() ?? { cols: 80, rows: 24 };
      // a terminal opened to run something: the app's own process types it when the shell is ready, and the board forgets it
      const run = (editor.store.doc.shapes[box.id] as typeof box | undefined)?.live?.run;
      const r = await weld.pty.open(box.id, { cwd: box.live?.cwd, cols: d.cols, rows: d.rows, run });
      if (run)
        editor.store.quiet(() => {
          // the command is run once; what it was, and whose terminal this is, stay
          const { run: _ran, ...rest } = (editor.store.doc.shapes[box.id] as typeof box | undefined)?.live ?? {};
          editor.store.patch(box.id, { live: rest });
        });
      if (gone) return;
      opened = true;
      if (r.replay) t.write(r.replay);

      setFacts(box.id, { label: r.proc, busy: !SHELLS.has(r.proc), dead: !r.alive });
    };
    void start();
    const off = weld.pty.onEvent((id, ev) => {
      if (id !== box.id) return;
      if (ev.t === "data") {
        t.write(ev.d);
        note(ev.d);
      } else if (ev.t === "proc") {
        setFacts(box.id, { label: ev.proc, busy: !SHELLS.has(ev.proc) });
        if (SHELLS.has(ev.proc)) void weld.pty.cwd(box.id).then((c) => c && setCwd(c));
      } else if (ev.t === "exit") {
        setFacts(box.id, { dead: true, busy: false });
        t.write("\r\n\x1b[2m[finished: press Enter for a new shell]\x1b[0m\r\n");
      }
    });
    const typed = t.onData((d) => {
      if (!opened) return;
      weld.pty.write(box.id, d);
    });
    // Enter in a finished shell starts another, in the same place
    // (the person's own typing, told apart from the terminal's answers to programs: a start-over waiting to type gives way)
    const said = () => opened && weld.pty.typed(box.id);
    el.addEventListener("paste", said, true);
    el.addEventListener("compositionend", said, true);
    // (text put in without a key: the emoji picker, dictation)
    el.addEventListener("input", said, true);
    const keys = t.onKey(({ domEvent }) => {
      said();
      if (domEvent.key === "Enter" && opened && facts_dead()) {
        t.reset();
        opened = false;
        void start();
      }
    });
    const facts_dead = () => !!(holder.current?.dataset.dead === "1");
    const resized = t.onResize(({ cols, rows }) => opened && weld.pty.resize(box.id, cols, rows));
    const ro = new ResizeObserver(() => size());
    ro.observe(el);
    return () => {
      gone = true;
      off();
      typed.dispose();
      keys.dispose();
      el.removeEventListener("paste", said, true);
      el.removeEventListener("compositionend", said, true);
      el.removeEventListener("input", said, true);
      resized.dispose();
      ro.disconnect();
      t.dispose();
      term.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.id]);

  // it takes the keys when it becomes the one thing selected, and gives them back when it is not
  useEffect(() => {
    if (active && !far) term.current?.focus();
    else term.current?.blur();
  }, [active, far]);

  // Drawn on a canvas of its own where it can be: block and prompt shapes are then drawn exactly, whatever the font.
  // A browser allows only so many such canvases at once (sixteen or so), so a terminal holds one only while it
  // can be seen: off screen, or shown as a card, it gives its canvas up and takes one again when it comes back.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = holder.current?.closest(".live-node");
    if (!node) return;
    const io = new IntersectionObserver(([e]) => e && setSeen(e.isIntersecting), { rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  const want = seen && !far;
  // Taking a canvas up, or giving one back, costs a few frames: it is done only once the view has come to rest,
  // and given back only after a while out of sight, so moving about the board never pays for it.
  const gl = useRef<WebglAddon | null>(null);
  useEffect(() => {
    const store = editor.store;
    let timer = 0, bumps = -1;
    const settle = (after: number, fn: () => void) => {
      const tick = () => {
        // still moving: look again shortly
        if (store.camBumps !== bumps) {
          bumps = store.camBumps;
          timer = window.setTimeout(tick, 250);
        } else fn();
      };
      timer = window.setTimeout(tick, after);
    };
    if (want)
      settle(120, () => {
        const t = term.current;
        if (!t || gl.current) return;
        try {
          const mine = new WebglAddon();
          mine.onContextLoss(() => {
            mine.dispose();
            if (gl.current === mine) gl.current = null;
          });
          t.loadAddon(mine);
          gl.current = mine;
        } catch {
          gl.current = null; // no room for another canvas: plain text it is
        }
      });
    else
      settle(5000, () => {
        try {
          gl.current?.dispose();
        } catch {
          /* lost already */
        }
        gl.current = null;
      });
    return () => clearTimeout(timer);
  }, [want, editor]);
  useEffect(
    () => () => {
      try {
        gl.current?.dispose();
      } catch {
        /* lost already */
      }
    },
    [],
  );

  // The screen is drawn at the board's zoom, and the terminal works out which
  // letter is under the pointer as if it were not: presses are put back into
  // its own measure before it hears of them.
  useEffect(() => {
    const el = holder.current!;
    let dragging = false;
    const fix = (e: MouseEvent) => {
      const zz = editor.store.cam.z;
      if ((e as MouseEvent & { __fixed?: boolean }).__fixed || Math.abs(zz - 1) < 0.001) return;
      const inside = e.target instanceof Node && el.contains(e.target);
      if (e.type === "mousedown" && inside) dragging = true;
      if (!inside && !dragging) return;
      if (e.type === "mouseup") dragging = false;
      const screen = el.querySelector(".xterm-screen") as HTMLElement | null;
      if (!screen) return;
      const r = screen.getBoundingClientRect();
      e.stopImmediatePropagation();
      e.preventDefault();
      const copy = new MouseEvent(e.type, {
        bubbles: true, cancelable: true, view: window, detail: e.detail, button: e.button, buttons: e.buttons,
        clientX: r.left + (e.clientX - r.left) / zz, clientY: r.top + (e.clientY - r.top) / zz,
        screenX: e.screenX, screenY: e.screenY, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey,
      });
      (copy as MouseEvent & { __fixed?: boolean }).__fixed = true;
      (inside ? (e.target as Element) : screen).dispatchEvent(copy);
      if (e.type === "mousedown") term.current?.focus();
    };
    const types = ["mousedown", "mousemove", "mouseup"] as const;
    for (const t of types) document.addEventListener(t, fix, true);
    return () => {
      for (const t of types) document.removeEventListener(t, fix, true);
    };
  }, []);

  const proc = facts.label && !SHELLS.has(facts.label) ? facts.label : "";
  const state = facts.dead ? "quiet" : facts.busy ? "working" : "quiet";
  const name = box.text || folderName(cwd);
  return (
    <div className="live-sheet live-shell flex h-full w-full flex-col overflow-hidden rounded-[12px]" data-mode="dark">
      <Head state={state}>
        <TerminalWindow size={15} className="shrink-0 text-(--live-sub)" />
        <span className="live-title truncate">{name}</span>
        {proc && <span className="live-meta truncate">{proc}</span>}
        <span className="flex-1" />
        <Owner box={box} editor={editor} />
        {served && (
          <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => openBeside(editor, box.id, "browser", { url: served })}>
            {served.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </button>
        )}
        {state === "working" && <Dot state="working" />}
      </Head>
      <div className="live-body min-h-0 flex-1 px-3 pb-2 pt-1">
        <div ref={holder} data-dead={facts.dead ? "1" : "0"} className="h-full w-full" />
      </div>
      {<FarCard w={box.w} h={box.h} icon={TerminalWindow} title={proc ? `${name} · ${proc}` : name} line={facts.last} state={state} />}
    </div>
  );
}
