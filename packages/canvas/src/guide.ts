// What `weld guide` tells an agent: how to draw a diagram on the board (GUIDE.md), the story notation it sends with
// `weld draw '{"story": …}'`, every helper it can call, and the templates and accepted diagrams by name. Named, one of
// those is printed as a story, ready to change and send.
import GUIDE from "./GUIDE.md?raw";
import MK from "./mk.ts?raw";
import { TOLD } from "./story";
import { ACCEPTED } from "./accepted";
import type { StampDef } from "./stamps";
import CATALOGUE from "./catalogue.json";

// (each template registers itself as it is built: its story, as written, is kept by its slug)
const TEMPLATES: Record<string, { TRIAL: StampDef; head: string }> = Object.fromEntries(
  Object.entries(import.meta.glob<{ TRIAL: StampDef }>("./templates/*.ts", { eager: true })).map(([path, m]) => [path.replace(/^.*\/(.+)\.ts$/, "$1"), { TRIAL: m.TRIAL, head: "" }]),
);
const HEADS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>("./templates/*.ts", { eager: true, query: "?raw", import: "default" })).map(([path, src]) => [
    path.replace(/^.*\/(.+)\.ts$/, "$1"),
    // (its prose header, without the lines about copying files: an agent sends it instead)
    src.split("\n").filter((l) => l.startsWith("//") && !/Copy this file|template: /.test(l)).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"),
  ]),
);

const NOTATION = `# The story notation

A diagram is sent as JSON: weld draw '{"story": {"name": "…", "things": […], "links": […], "beats": […]}}'
(or weld draw - with the JSON on standard input). "name" is a short sentence saying what it shows.

Each thing or link is a call to one of the board's helpers (below), written as an array: the helper's name, then its arguments
in order. panel("c", 0, 0, "CLIENT", "trying", 220, 104) is ["panel", "c", 0, 0, "CLIENT", "trying", 220, 104]. To set fields
on what a call makes: {"call": ["gauge", "g", 0, 140, "wait"], "value": 0.2}. An argument that is itself a call is
{"call": […]}. A helper that makes several things (holding, lane, fan, moment) is written the same way.

  {"story": {"name": "A request goes out and its answer comes back",
    "things": [["card", "c", 0, 0, "Client", 170, 64], ["card", "s", 330, 0, "Server", 170, 64]],
    "links": [["wire", "w", "c.r", "s.l", {"text": "GET /"}]],
    "beats": [{"on": ["c"], "run": ["w"]}, {"on": ["s"], "back": ["w"], "say": {"w": "200 OK"}, "hold": 1800}]}}

Beats: on lights things, run sends something along a wire, back sends the answer back along it, refuse / lost turn a wire red,
say changes words, set changes a mark's level, at / size move and resize, show / hide / faint, tone colours, over / hold are
milliseconds. A wire end is "id.side" (r, l, t, b), or "id.r@0.25" for a spot along that side.

weld draw answers with the drawing's id. Send the story again with "replace": "#id" to redraw it in place, and weld look to see it.
`;

/** Every helper's signature and what it draws, one line each, from the helpers' own source. */
const helpers = () =>
  MK.split("\n")
    .filter((l) => /^(\/\*\*|export const)/.test(l))
    .map((l) => l.replace(/\): (Thing|Link|Thing\[\]|number\[\]|string|\{[^=]*\}) => .*$/, ")").replace(/^export const /, ""))
    .join("\n");

/** A story as sent: its things, links and beats as written (helpers already expanded into the board's own things). */
const asStory = (slug: string) => {
  const d = TOLD.get(slug);
  if (!d) return null;
  const { things, links, beats, name, about } = d;
  return JSON.stringify({ story: { name, about, things, links, beats } });
};

/** The catalogue: finished diagrams, each a story, by what they explain (the same ones as the canvas site's /catalogue). */
type Entry = { name: string; subject: string; about: string; shows: string; story: object };
const ENTRIES = CATALOGUE as Entry[];
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "vs", "is", "it", "its", "how", "with", "by", "as", "at", "one"]);
/** The entries closest to some words: a word in the subject counts most, then in what the diagram shows, then its about. */
function find(q: string): string {
  const ws = words(q);
  if (!ws.length) return "weld guide find: say what the diagram should explain (weld guide find cache invalidation)\n";
  // (the same word in another form counts: balancer and balancing, cache and caching)
  const near = (x: string, w: string) => {
    if (x === w) return true;
    let k = 0;
    while (k < x.length && k < w.length && x[k] === w[k]) k++;
    return k >= Math.min(5, Math.min(x.length, w.length) - 1) && k >= 4;
  };
  const hit = (text: string, w: string) => words(text).some((x) => near(x, w));
  const scored = ENTRIES.map((e) => ({ e, n: ws.reduce((n, w) => n + (hit(e.subject, w) ? 3 : 0) + (hit(e.shows, w) ? 2 : 0) + (hit(e.about, w) ? 1 : 0), 0) }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.e.name.localeCompare(b.e.name)).slice(0, 12);
  if (!scored.length) return `weld guide find: nothing in the catalogue explains "${q}"; draw it from the guide (weld guide)\n`;
  return [`The catalogue's closest diagrams (weld guide <name> prints one as a story to change and send):\n`, ...scored.map(({ e }) => `  ${e.name.padEnd(34)} ${e.subject}: ${e.shows}`), ""].join("\n");
}

/** What `weld guide [name]` says. */
export function guide(name?: string): string {
  const n = (name ?? "").trim();
  if (/^find(\s|$)/.test(n)) return find(n.slice(4).trim());
  if (!n) {
    const temps = Object.keys(TEMPLATES).sort().map((k) => `  ${k.padEnd(10)} ${(HEADS[k] ?? "").split("\n")[0] ?? ""}`);
    const accepted = ACCEPTED.map((d) => `  ${d.slug.padEnd(22)} ${d.name}`);
    return [GUIDE, NOTATION, "# The helpers\n", helpers(), "\n# Templates (weld guide <template> prints one as a story)\n", ...temps, "\n# Accepted diagrams (weld guide <name> prints one as a story)\n", ...accepted,
      `\n# The catalogue (${ENTRIES.length} finished diagrams; weld guide find <words> lists the ones for a subject)\n`, [...new Set(ENTRIES.map((e) => e.subject))].join(" · "), ""].join("\n");
  }
  const t = TEMPLATES[n];
  if (t) return `${HEADS[n] ?? ""}\n\n${asStory(t.TRIAL.slug) ?? "(no story)"}\n`;
  const d = ACCEPTED.find((x) => x.slug === n);
  if (d) return `${d.name}${d.about && d.about !== d.name ? `: ${d.about}` : ""}\n\n${asStory(d.slug) ?? "(this one is a picture, not a story: look at it in the library's Diagrams tab)"}\n`;
  const c = ENTRIES.find((x) => x.name === n);
  if (c) return `${c.subject}: ${c.about}\nThis one shows: ${c.shows}\n\n${JSON.stringify({ story: c.story })}\n`;
  return `weld guide: no template or diagram called "${n}" (weld guide lists them)\n`;
}
