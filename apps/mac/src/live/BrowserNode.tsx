// A page on the board. With nowhere to go yet it offers the servers
// that are answering on this Mac, since that is nearly always the page
// someone wants beside their work.
import { createElement, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, Camera, Globe, X } from "@phosphor-icons/react";
import { weld } from "./bridge";
import type { Server } from "./bridge";
import type { NodeProps } from "./LiveLayer";
import { FarCaption, FarCard, Head, Owner } from "./LiveLayer";
import { factsOf, setFacts, useFact } from "./threads";
import { putPicture } from "./pictures";

interface Guest extends HTMLElement {
  src: string;
  loadURL: (url: string) => Promise<void>;
  getURL: () => string;
  getTitle: () => string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  getWebContentsId: () => number;
  setVisualZoomLevelLimits: (min: number, max: number) => Promise<void>;
  setZoomFactor: (factor: number) => void;
}

/** What was typed, as an address: a bare host gets a scheme, anything else is searched for. */
export function toAddress(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data|file):/i.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(s)) return `http://${s}`;
  if (/^:\d+/.test(s)) return `http://localhost${s}`;
  if (/^\d{2,5}$/.test(s)) return `http://localhost:${s}`;
  if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return `https://${s}`;
  // (one bare word is nearly always a site's name: go to its top result, as "youtube" means youtube.com)
  if (/^[\p{L}\p{N}-]+$/u.test(s) && !/^\d+$/.test(s)) return `https://duckduckgo.com/?q=${encodeURIComponent(`\\${s}`)}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}
// (a local file reads as its name in its folder, not the folder's address)
const pretty = (url: string) => (/^weld-local:\/\//.test(url) ? `local · ${decodeURIComponent(url.replace(/^weld-local:\/\/[^/]+\//, "")) || "folder"}` : url.replace(/^https?:\/\//, "").replace(/\/$/, ""));

export function BrowserNode({ box, editor, active, far }: NodeProps) {
  const guest = useRef<Guest | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const url = box.live?.url ?? "";
  // where the page was first pointed: later travel is the page's own business and must not reload it
  // (a file address on the board is shown from its folder only if that folder was already approved: a board, whoever
  // made it, never approves one; otherwise the person opens the file again)
  const [start, setStart] = useState(/^file:\/\//i.test(url) ? "" : url);
  useEffect(() => {
    if (!/^file:\/\//i.test(url)) return;
    void weld.localUrl(url).then((to) => {
      if (/^file:\/\//i.test(to)) return setFailed("open the file again to show it here");
      editor.store.quiet(() => editor.store.patch(box.id, { live: { ...box.live, url: to } }));
      setStart(to);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const [typed, setTyped] = useState<string | null>(null);
  const [nav, setNav] = useState({ back: false, forward: false, loading: false });
  const [failed, setFailed] = useState<string | null>(null);
  /** Tries at a local server that did not answer (it is likely starting): counted, and the next one waiting. */
  const tries = useRef(0), retry = useRef(0);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => () => clearTimeout(retry.current), []);
  // opened again by its agent (it has changed what is there): shown afresh
  useEffect(() => {
    const again = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== box.id) return;
      tries.current = 0;
      setFailed(null);
      if (gone) setGone(false);
      else guest.current?.reload();
    };
    window.addEventListener("weld:reload", again);
    return () => window.removeEventListener("weld:reload", again);
  });
  /** Let go: its process is given up, and only its still stands here. */
  const [gone, setGone] = useState(false);
  const facts = useFact(box.id);
  const shown = !!start;

  const visit = async (to: string) => {
    let address = toAddress(to);
    if (!address) return;
    if (/^file:\/\//i.test(address)) address = await weld.localUrl(address, true);
    setTyped(null);
    setFailed(null);
    const s = editor.store;
    s.run(() => s.patch(box.id, { live: { ...box.live, url: address } }));
    if (!start) setStart(address);
    else if (guest.current) void guest.current.loadURL(address).catch(() => {});
    field.current?.blur();
  };

  useEffect(() => {
    const g = guest.current;
    if (!g) return;
    const sync = () => {
      let back = false, forward = false;
      try {
        back = g.canGoBack();
        forward = g.canGoForward();
      } catch {
        /* not attached yet */
      }
      setNav((n) => ({ ...n, back, forward }));
    };
    const moved = (e: Event) => {
      const to = (e as Event & { url?: string; isMainFrame?: boolean }).url;
      if ((e as Event & { isMainFrame?: boolean }).isMainFrame === false) return;
      if (to && to !== box.live?.url && !to.startsWith("about:")) {
        // kept quietly: where a page has wandered to is not something to undo
        editor.store.quiet(() => editor.store.patch(box.id, { live: { ...(editor.store.doc.shapes[box.id] as typeof box | undefined)?.live, url: to } }));
      }
      setFailed(null);
      sync();
    };
    const fit = () => {
      const w = (g as unknown as HTMLElement).offsetWidth, screenW = window.screen.availWidth || 1440;
      if (!w) return;
      try {
        g.setZoomFactor(Math.min(1, w / screenW));
      } catch {
        /* not ready yet: dom-ready fits it */
      }
    };
    const on: [string, (e: Event) => void][] = [
      ["did-start-loading", () => (setNav((n) => ({ ...n, loading: true })), setFacts(box.id, { busy: true }))],
      ["did-stop-loading", () => (setNav((n) => ({ ...n, loading: false })), setFacts(box.id, { busy: false }), sync())],
      ["did-finish-load", () => ((tries.current = 0), setWaiting(false))],
      ["page-title-updated", (e) => setFacts(box.id, { label: (e as Event & { title: string }).title })],
      ["did-navigate", moved],
      ["did-navigate-in-page", moved],
      ["did-fail-load", (e) => {
        const f = e as Event & { errorCode: number; errorDescription: string; isMainFrame: boolean; validatedURL: string };
        if (!f.isMainFrame || f.errorCode === -3) return;
        // a local server not answering is most often one starting, or starting over: it is tried again, quietly, for a while
        const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(f.validatedURL || "");
        if (local && (f.errorCode === -102 || f.errorCode === -101 || f.errorCode === -324) && tries.current < 40) {
          tries.current += 1;
          setWaiting(true);
          clearTimeout(retry.current);
          retry.current = window.setTimeout(() => void g.loadURL(f.validatedURL).catch(() => {}), 1500);
          return;
        }
        setWaiting(false);
        setFailed(f.errorDescription.replace(/^ERR_/, "").replace(/_/g, " ").toLowerCase());
      }],
      ["dom-ready", () => {
        try {
          setFacts(box.id, { webContentsId: g.getWebContentsId() });
          void g.setVisualZoomLevelLimits(1, 1);
          fit();
        } catch {
          /* gone already */
        }
      }],
    ];
    for (const [name, fn] of on) g.addEventListener(name, fn);
    // the page as a real browser shows it: laid out at the width of a browser window on this screen, and zoomed (as a
    // browser zooms, so it stays sharp) to the width of its box; a box as wide as the screen shows it at 100%
    const seen = new ResizeObserver(() => fit());
    seen.observe(g as unknown as Element);
    return () => {
      seen.disconnect();
      for (const [name, fn] of on) g.removeEventListener(name, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.id, shown, gone]);
  // pointed somewhere from outside (the board was given a new address for it)
  useEffect(() => {
    if (url && !start && !/^file:\/\//i.test(url)) setStart(url);
  }, [url, start]);

  // a page that is no longer the one thing selected gives the keys back to the board
  useEffect(() => {
    if (!active) {
      guest.current?.blur();
      if (document.activeElement === field.current) field.current?.blur();
    } else if (!shown) field.current?.focus();
  }, [active, shown]);

  // a still of the page, kept by the app: it stands in for the page while the board's zoom is moving
  const [still, setStill] = useState<string | null>(null);
  useEffect(
    () =>
      weld.onStill(({ from, jpeg }) => {
        if (factsOf(box.id)?.webContentsId !== from) return;
        const next = URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
        setStill((was) => {
          if (was) setTimeout(() => URL.revokeObjectURL(was), 2000);
          return next;
        });
      }),
    [box.id],
  );

  // A page costs something for as long as it is live: it draws, and it holds a process of its own.
  // Seen from far off it sleeps behind its still, waking now and then to take a new one;
  // out of sight for a long while it is let go altogether, and loaded again when it is next looked at.
  const sheet = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const node = sheet.current?.closest(".live-node");
    if (!node) return;
    const io = new IntersectionObserver(([e]) => e && setSeen(e.isIntersecting), { rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  const [asleep, setAsleep] = useState(false);
  const canSleep = far && seen && shown && !!still && !active && !nav.loading && !gone;
  useEffect(() => {
    if (!canSleep) return setAsleep(false);
    let nap = window.setTimeout(() => setAsleep(true), 2000), wake = 0;
    const beat = window.setInterval(() => {
      setAsleep(false);
      const id = factsOf(box.id)?.webContentsId;
      clearTimeout(wake);
      wake = window.setTimeout(() => id !== undefined && weld.stillNow(id), 500);
      clearTimeout(nap);
      nap = window.setTimeout(() => setAsleep(true), 1200);
    }, 20000);
    return () => {
      clearTimeout(nap);
      clearTimeout(wake);
      clearInterval(beat);
    };
  }, [canSleep, box.id]);
  useEffect(() => {
    const id = factsOf(box.id)?.webContentsId;
    if (id !== undefined) weld.pageAsleep(id, asleep);
  }, [asleep, box.id]);
  // (on screen counts as in sight at any zoom: a page that can be seen is never let go; nor is one the person has used
  // since it loaded, which may be keeping time or holding what they typed)
  const used = useRef(false);
  if (active && shown) used.current = true;
  const inSight = seen || active;
  const urlNow = useRef(url);
  urlNow.current = url;
  // an agent using it: it is there for it, and kept as one the person used is
  useEffect(() => {
    const use = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== box.id || !shown) return;
      used.current = true;
      if (gone) {
        setStart(urlNow.current);
        setGone(false);
      }
    };
    window.addEventListener("weld:use", use);
    return () => window.removeEventListener("weld:use", use);
  }, [box.id, gone, shown]);
  useEffect(() => {
    if (inSight) {
      if (gone) {
        setStart(urlNow.current);
        setGone(false);
      }
      return;
    }
    if (gone || !shown || used.current) return;
    const t = window.setTimeout(() => !used.current && setGone(true), 20 * 60 * 1000);
    return () => clearTimeout(t);
  }, [inSight, gone, shown]);
  // the last still is given back when the page leaves the board
  const stillNow = useRef(still);
  stillNow.current = still;
  useEffect(() => () => void (stillNow.current && URL.revokeObjectURL(stillNow.current)), []);

  const title = box.text || facts.label || (url ? pretty(url) : "New page");
  const state = nav.loading ? "working" : "quiet";
  return (
    <div ref={sheet} className={`live-sheet flex h-full w-full flex-col overflow-hidden rounded-[12px] ${shown ? "far-shows" : ""}`}>
      <Head state={state}>
        <div className="live-tools flex items-center">
          <button type="button" aria-label="Back" className="live-icon ctl" disabled={!nav.back} onMouseDown={(e) => e.preventDefault()} onClick={() => guest.current?.goBack()}>
            <ArrowLeft size={14} />
          </button>
          <button type="button" aria-label="Forward" className="live-icon ctl" disabled={!nav.forward} onMouseDown={(e) => e.preventDefault()} onClick={() => guest.current?.goForward()}>
            <ArrowRight size={14} />
          </button>
          <button type="button" aria-label={nav.loading ? "Stop" : "Reload"} className="live-icon ctl" disabled={!shown} onMouseDown={(e) => e.preventDefault()} onClick={() => (nav.loading ? guest.current?.stop() : guest.current?.reload())}>
            {nav.loading ? <X size={14} /> : <ArrowClockwise size={14} />}
          </button>
        </div>
        <form
          className="live-tools min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            visit(typed ?? url);
          }}
        >
          <input
            ref={field}
            className="live-address"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Address"
            placeholder="Search or enter an address"
            value={typed ?? (url ? pretty(url) : "")}
            onFocus={(e) => {
              setTyped(url);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setTyped(null)}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
              e.stopPropagation();
            }}
          />
        </form>
        <div className="live-tools flex items-center gap-1">
          <Owner box={box} editor={editor} />
          {/* the page as it looks now, kept as a picture beside it (to mark up, or to give a thread) */}
          <button
            type="button"
            aria-label="Snapshot"
            title="Snapshot"
            className="live-icon ctl"
            disabled={!shown}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const wc = factsOf(box.id)?.webContentsId;
              if (wc === undefined) return;
              void weld.assets.snapshot(wc, title || pretty(url)).then((a) => !a.error && putPicture(editor, a, { near: box.id }));
            }}
          >
            <Camera size={14} />
          </button>
          <button type="button" aria-label="Open in your browser" className="live-icon ctl" disabled={!shown} onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.openExternal(url)}>
            <ArrowSquareOut size={14} />
          </button>
        </div>
      </Head>
      <div className={`live-body live-page relative min-h-0 flex-1 ${still && shown ? "has-still" : ""} ${asleep ? "is-asleep" : ""}`}>
        {still && shown && <img className="page-still" src={still} decoding="async" alt="" draggable={false} />}
        {shown && gone ? null : shown ? (
          createElement("webview", { ref: guest, src: start, allowpopups: "true", partition: "persist:weld", className: "absolute inset-0 h-full w-full" })
        ) : (
          <StartPage onPick={visit} />
        )}
        {waiting && !failed && shown && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-(--live-paper) text-center">
            <span className="thread-spin" />
            <div className="text-[12px] text-(--live-sub)">Waiting for {pretty(url)}</div>
          </div>
        )}
        {failed && shown && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-(--live-paper) text-center">
            <div className="text-[13px] font-medium text-(--live-ink)">This page did not load</div>
            <div className="max-w-[320px] text-[12px] text-(--live-sub)">{pretty(url)}: {failed}</div>
            <button type="button" className="live-chip ctl" onClick={() => (setFailed(null), guest.current?.reload())}>Try again</button>
          </div>
        )}
      </div>
      {(shown ? <FarCaption w={box.w} title={title} busy={nav.loading} /> : <FarCard w={box.w} h={box.h} icon={Globe} title={title} state={state} />)}
      {nav.loading && !far && <span className="live-loading" aria-hidden />}
    </div>
  );
}

function StartPage({ onPick }: { onPick: (url: string) => void }) {
  const [servers, setServers] = useState<Server[] | null>(null);
  useEffect(() => {
    let gone = false;
    const look = () => void weld.servers().then((s) => !gone && setServers(s));
    look();
    const t = setInterval(look, 6000);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="absolute inset-0 overflow-y-auto bg-(--live-paper) px-8 py-8">
      <div className="mx-auto max-w-[520px]">
        <div className="live-label mb-3">Running on this Mac</div>
        {servers === null ? (
          <div className="text-[13px] text-(--live-sub)">Looking…</div>
        ) : servers.length === 0 ? (
          <div className="text-[13px] text-(--live-sub)">Nothing is serving a page right now.</div>
        ) : (
          <div className="flex flex-col">
            {servers.map((s) => (
              <button key={s.port} type="button" className="live-row ctl" onClick={() => onPick(s.url)}>
                <span className="w-[108px] shrink-0 text-left font-mono text-[12px] text-(--live-ink)">localhost:{s.port}</span>
                <span className="min-w-0 flex-1 truncate text-left text-[13px] text-(--live-ink)">{s.title || "Untitled"}</span>
                <span className="shrink-0 text-[11.5px] text-(--live-sub)">{s.process}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
