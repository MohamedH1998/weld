# Making a diagram

A diagram here is a small picture of **one thing changing**. It is not a map of components.
Left to themselves, people and agents draw the map: boxes in a row, joined by arrows. Follow this instead.

## 1. Say the change in one sentence

Write the title as what happens: "A full queue pushes back", "Three pass, the fourth gets 429".
If the sentence has no verb, there is no diagram yet. Wires are square: straight, or turning at right angles (`elbow`); never curved, unless the subject itself is a curve. A mark that holds things (a log, a queue, a table) keeps what it has been given: it only empties when emptying is the story. A lookup lights the row it finds, never wrong rows first. A place that keeps a table (sessions, routes, keys) shows it as a `segments` strip of its real entries, so the reader sees the one that is found. Never the window, tank or timeline marks: rows, levels and time are all drawn as segments. When two ways of arranging the same things are compared (rows or columns, one queue or many), draw each arrangement as it really is, the same items in a different order, so the difference is in the picture and not only in the words. Something that comes back round (a loop, a cycle, a retry) shows the way back: a wire from the end to the start, run when it goes round. If the subject names more than one outcome ("if all say yes… if any says no…"), the moments show each of them, one after the other.

Then **start from a template**: copy one file from `src/canvas/templates/` to `src/canvas/trial/<slug>.ts` and change its words, values and beats. Keep its first line (`// template: strip`). Pick by what your sentence is about:

| Your sentence is about | Template |
| --- | --- |
| one thing's own time: a while in one state, then another, then it ends (a cache entry's life, a lease, waits between retries) | `periods` (one strip, each period as wide as it lasts, a light that slides along) |
| how long things take, each on its own row; in a row or at once | `spans` |
| durations end to end, then stacked when they run together | `stack` |
| ranges and who owns them: hash rings, shards; one part taking another's share | `strip` |
| things inside things: names, folders, scopes, networks (a still: one moment) | `frames` |
| a backlog between a rate in and a rate out | `rates` |
| a level or count changing over time, or a spread of values | `curve` |
| shares of a whole: percentiles, where time goes, a budget | `bands` |
| one party asking places in turn until one has it: lookups, cache levels, fallbacks | `ask` |
| one thing passed along, each stop changing it; a copy kept in step | `handoff` |
| something that comes back round: a control loop, an event loop, a cycle that repeats | `loop` (steps round an oval, the last wire back to the first) |
| the same things kept in two orders, where the order decides the cost: rows or columns, in time order or grouped | `layouts` (two strips of the same parts, a light that sweeps what is read) |
| two or more parties taking turns, where the order of what passes is the story: a handshake, a protocol, a vote, two parties after one lock | `turns` (a panel per party, a line down from each, a message per row) |

The check (`checks/look.mjs`) fails a diagram that drops its template's main mark or adds more than two cards or panels to it.

Then open [CATALOGUE.md](CATALOGUE.md), find the one or two accepted diagrams whose **shows** is nearest your sentence (by relationship, not subject), and look at their sheets before you draw anything. Write their slugs under your sentence: `// nearest: bt-budget (borrow: proportional segments, a rule that walks)`.

## 2. Pick the shape of the change

Choose one, and write it as the first line of your file: `// shape: Spacing`. It decides the layout before any box is drawn: build the picture from what its row says carries it, not from boxes and wires with a mark added. If the change is about when things happen (spacing, waiting, deadlines), time is the layout: a `timeline`, lanes or activity rows, not boxes. A timeline stands alone: no cards, panels, pills or wires beside it. Its own labels and measures say who does what; if the story also needs the parties and what travels between them, it is a different shape (or two diagrams).

| The change | What it looks like | Carried by |
| --- | --- | --- |
| **Filling** | a level rises until something gives | queue, meter |
| **Counting** | the same thing happens n times, then something else | bars, a detail line that counts |
| **Refusal** | a request reaches a wall and stops | a wire that refuses, a red thing |
| **Two ways through** | the short way, and the long way that makes it possible | a dashed wire, a faded branch |
| **Shifting weight** | a share slides from one side to the other | two gauges side by side |
| **A named state** | the same door: closed, open, ajar | the states as a row of pills, every one shown from the start, with the current one lit (`on`) and the wire that moves between them running (`run`); the thing that owns the state is a panel whose detail says why it moved. Never one pill that swaps its word |
| **At once** | several things travel side by side, each at its own pace | gauges in a column, fan-out wires |
| **Time made visible** | a wait, a delay, a deadline; one thing slower than another | gauges of different lengths; or, when where and when both matter, lanes and moment lines (see Motifs) |
| **Containment** | something is inside something else, and that is the point | a boundary, a panel with things in it |
| **Hand-off** | one thing after another, each changing what it holds | a row of boxes (the only case for one) |
| **Looking up** | one of several is found, or none is | a `segments` strip whose parts are the real entries in words (`"/users/:id"`, `"/orders"`, `"/orders/:id"`), the found one picked (`set` its level, from 1); the light slides from part to part as it looks. Put it under or inside the thing that holds the table |
| **Running out** | time left shrinks to nothing, then something happens | a gauge that drains, its detail saying how long is left |
| **A thing, in detail** | nothing happens: one thing is taken apart and each part named | `segments`, with a `rule` (measure) that walks along under them |
| **A share of a whole** | one part is most of it, and that is the news | `segments` with that part picked, a measure under it |
| **Spacing** | the gaps between events are the point, not the events | a `segments` strip whose parts are the gaps, each as wide as it lasts (the `periods` template). Never the dots-on-a-line timeline. Several things spaced (three clients' retries): one timeline each, stacked 120 px apart, all given the same `span` so they share one scale. A stop that failed starts its name with "✕ " ("✕ Try 1") and is drawn red |

## 3. Rules

- **One mark that is not a box must carry the state.** A queue, meter, gauge, bars, glyph, pill, port, window or plot. If every state lives in a box's border colour, start again.
- **No plain row of boxes** unless the change is a hand-off.
- **Draw a thing as what it is**, where the board has a picture of it (a queue, a window, a plot). A card is for what has none.
- **At most five things** that are not marks. Cut the rest: they are the map.
- **Words change as it plays.** A detail line says what is true now ("2 of 3 parts"), not what the thing is.
- **Each moment changes one thing** a reader can point at. Six to eight moments.
- **Colour means something.** Blue is "this, now". Red failed, green passed, amber is waiting or set aside. Nothing else is coloured, except wires given a key (see Motifs).
- **A wire is a request.** It runs when something is sent, runs back for an answer, refuses at a wall, runs out when lost. Dashed is the way not usually taken. A port is a lasting connection.

## 4. Check it against the last three

Before writing, look at the three diagrams made before this one. If this one would use the same kinds of thing in the same arrangement, change the shape of the change, not the labels.

## 5. Pick the hand

A story is drawn in one of three hands (`look`). Choose by what the reader should feel, not by habit.

| Hand | For | How it draws |
| --- | --- | --- |
| *(none)* the board's own | a system at work: requests, refusals, things lighting up | welded outlines, a soft shadow, names in tracked capitals, blue for "this, now" |
| `line` | a map of where things are: nesting, layers, a path through them | hairline boxes, containers named at their top corner, colour only on wires and results |
| `figure` | a fact with numbers in it: a curve, a number line, a gap | plain sentence-case words, nothing coloured that is not a result |
| `draft` | an idea drawn as geometry: a span, a share, an arrangement, an anatomy | a construction drawing, by the grammar below |

### The construction grammar

Every mark has one job. If a mark is not doing its job, leave it out.

| Mark | Its one job | Written as |
| --- | --- | --- |
| A dark outline | the thing itself | `card`, `pill`, `dot`, `hatch`, `parts` |
| A dotted line | how the drawing was set out: an edge carried across, a baseline | `guide` |
| A long-and-short line | a centre | `guide(..., true)` |
| A dashed circle | where repeated things stand | `ring` |
| A measure | how big, in units. Say once what a unit is ("u = 100 ms"). Or, on an anatomy, what the part is for | `rule` |
| Hatching | the one part in question. Never two at once | `hatch`, or a level on `parts` |
| A filled point | the one that counts (answered, has the write). Hollow is the rest | `dot` lit by `on` |
| A leader | a few words reaching the exact point they name. One a drawing, shown last | `pointTo` |
| A dashed arrow | something that moves slowly or later | `wire(..., { dashed: true })` |
| Code and name | which drawing this is | `code: "TIM-01"` |

No colour. A drawing that needs red to make its point is not a construction drawing: use the board's own hand.
Boards showing one stand on bare paper with an ink accent: `&theme=light&ground=none&accent=ink`.

## 6. Motifs

These are extra options, not the default. A diagram starts from the shape of the change (section 2) and the things that are pictures of what they stand for: a queue, meter, gauge, bars, window, plot, recording. Most diagrams need nothing below.
Reach for a motif only when the shape of the change calls for it and none of those things says it better; use one or two at most.
Each one can be made on the board by clicking, and in the short form with one call from `mk.ts`. 

| Motif | What it says | Reach for it when | On the board | In the short form |
| --- | --- | --- | --- | --- |
| **Words on the wire** | what passes between two things, said where it passes | the relation matters more than the things ("Pull requests", "Miss") | select the wire, type, then "Words in a pill" | `wire(id, "a.r", "b.l", { text: "Miss", pill: true })` |
| **State on the wire** | how this one went: missed, refused, served | one outcome among others; keep the boxes plain | colour the wire (Red, Green, Amber) and give it a word | `{ text: "Miss", tone: "red", pill: true }` |
| **A trunk that branches** | one becomes many, or many become one | fan-out, broadcast, merge, many names for one thing | select the one first (or last), then "Fan out from the first selected" / "Gather into the last selected" | `fan(id, one, [many], x, y)`, or `{ into: true }` |
| **Solid and dotted** | solid is the way a request is sent; dotted is a way it may go, or goes out of sight | several possible paths beside the one taken | "Dotted line" | `{ dotted: true }` |
| **Curves for many-to-many** | every one of these can reach every one of those | crossings would turn square wires into a grid | "Curved"; drag the middle handle to bow one clear of another | `{ curve: true, bow: [dx, dy] }` |
| **A step lighter inside** | this is inside that | nesting is the point; keep each level's name on its edge | a boundary inside a boundary, the inner one "Tinted" | `inner(id, x, y, w, h, "RUST CORE")` |
| **A dashed box** | a step that did no work of its own, or stands in for another | the interesting part is that it was skipped or borrowed | "Dashed line" on the box | `{ ...card(...), dashed: true }` |
| **Wires side by side** | several things pass between the same two | two or more wires join the same pair; drawn from one spot they lie on top of each other | start each wire at a different spot on the edge (drop it on the rim, not the middle) | `wire(id, "api.r@0.3", "worker.l@0.3")`, `@0.5`, `@0.7` |
| **Colours with a key** | each colour is a kind of traffic | three or more kinds share the same wires; fewer need no key | colour the wires, then "Legend" from "More shapes"; name its rows | `legend(id, x, y, ["Server response", ...])`: one name per colour the wires use, in the order blue, green, amber, red, violet, teal, skipping those not used (tones `accent`, `green`, `amber`, `red`, `violet`, `teal`) |
| **Lanes** | where the work happens, and when | the reader should see work move between places over time, and why one waits | a hatched lane per worker with an activity row of ticks where it is busy; the request and the answer cross between the rows at the instant the work hands over (the Lanes pattern; notched frames for three or more workers: catalogue `lanes-handover`) | `...lane(id, x, y, w, h, "Main thread")`, `activity(id, x, y, w, [from, to, ...])` (set its value to fill it with time), `handover(id, x, y0, y1, "GET /data")` run in the moment it happens |
| **Moments as upright lines** | the instant a reader would notice something | a few named instants on a timeline ("Page visible") | a dashed line drawn down, its name over its top | `moment(id, x, y0, y1, "Page visible")`; keep them well apart |
| **Instants as ticks** | busy or idle, instant by instant | what matters is how much of the time something is at work | "Activity" from "More shapes"; a "Measure" under the gap | `activity(id, x, y, w, [from, to, ...])`, `rule(...)` |
| **A row of moment names** | what each stretch of the timeline is | a figure plays through a sequence; name each part under it | text under the figure, short lines between | `label(...)` with `anchor: "mid"`, and free lines |
| **A name in the middle** | what the loop around it is | a cycle; the boxes are its stations | a large title in the middle of the ring | `{ ...label(...), prose: true }` |

A few habits that go with them:

- **Edges quiet, flow strong.** Boxes are outlines; what a reader should follow is the wire.
- **Two or three motifs at most.** A figure that uses all of them is a map again.
- **An answer runs back.** A response goes from the far end to the near one: draw its wire that way, or play the request's wire with `back`.
- **Space moments apart** so their names do not touch, and keep their lines clear of other names.
- **Words fit their box.** A detail line is a few words ("held, rolled back"); widen the box or say less.
- **Colour still means something.** Blue is "this, now", red failed, green passed, amber waiting. A key is the one way to give colours other meanings, and only for wires: then pick any colours, and let the key say what they mean.
- **A refusal and a loss differ.** `refuse` is turned away at the far end; `lost` runs out before it arrives (a timeout).

## 7. Write it

Diagrams are written in the short form in `src/canvas/story.ts`: things, links, beats.
In a beat, `on`, `run`, `back`, `refuse`, `lost`, `busy`, `tone`, `hide` and `faint` are for that moment only: repeat them in the next beat to keep them.
`say`, `set`, `at`, `size`, `show` and `drop` last until a later beat changes them.
`src/canvas/mk.ts` has a one-line call for every kind of thing and every motif.
The standard to meet is the board of accepted diagrams, `/?demo=1&scene=all`. Those written in the short form are worked examples to copy from: `src/canvas/forge.ts` (things at work, panels with detail lines) and `src/canvas/built.ts` (a timeline, and segments with a walking measure).

Keep it to 4 to 11 moments (most need fewer than 9). If the story needs more, it is two diagrams.

## 8. Look at it before you finish

Run `node checks/look.mjs <your file>` (the dev server must be on :3100). It draws every moment at one camera, colours the wires that play in each (blue runs, violet runs back and is drawn pointing the way the answer goes, red is refused or lost), and names a sheet, `checks/shots/look-<slug>.png`: open it and look. Any line it prints starting `fix:` is a fault: fix it before anything else. Then go through this list, fix, and look again until every line holds. To see what passes, run it on `src/canvas/built.ts` or `src/canvas/forge.ts`.

1. **No words touch.** Names, wire words and captions stand clear of each other and of lines. Things joined by a wire that carries words need 160 px or more between them.
2. **One wire per pair.** A request and its answer are one wire: `run` it, then `back` it. Two wires between the same two things only when they are two different requests.
3. **A name never changes.** Anything whose state changes is a `panel` (or `machine`): its name stays, `say` changes its detail line. `say` on a card or pill replaces its name: do that only when the word is the state ("Refused").
4. **Every change has a cause you can see** in the same moment: a request runs, an answer runs back, a refusal turns its wire red. A count that goes up with nothing arriving is a fault.
5. **State lives in one place.** Show it once: a detail line, or a mark, not both and not a third time in a window.
6. **Words and marks agree.** "2 of 3" on a gauge at 2/3 (`value: 0.67`), not on bars or a queue that count in fifths. A queue is for things waiting, up to five.
7. **Blue is only what acts in this moment** (`on`). A mark is not lit for decoration; a thing that has finished is not lit.
8. **A mark stands inside what it measures.** `...holding(panel("pool", x, y, "POOL", "3 of 5 in use", 280), queue("q", 0, 0, "", 3, 0, 44))` puts the queue in the panel's body under its detail line (the panel grows to fit; the mark's own x, y and width are set for you). A mark on its own, away from any panel, is a fault.
9. **Tight and balanced.** 80 to 160 px between things, the whole about twice as wide as tall, no empty runs and nothing stranded far away.
10. **Each moment differs from the one before** in one thing a reader can point at.
11. **Every word belongs to a thing:** a name, a detail line, a wire's words, a mark's caption. No loose labels floating between things.
12. **Colour the thing that failed, not the one that asked.** A refused request is a red wire; the client that sent it stays plain. Red or green on a box means that box itself failed or passed.
13. **An answer comes back.** When something replies, show it: `back` on the wire it came by, in its own moment. A wire's label names what travels on it now: when the answer is something else (a code, a token, a 404), `say` the wire's new label in that beat (`say: { login: "code" }`).
14. **The shape still holds.** Look at the sheet and name the shape you wrote at the top. If a stranger would not see it at a glance, start the layout again.
15. **Things in a row share a centre line**, so the wires between them run straight. A wire that jogs to reach the next thing means its y is off: set `y` so the middles match (a card 56 high next to a panel 104 high stands 24 lower).
16. **No step is skipped.** If a count goes 1, 2, then the thing it counts to happens, the third is its own moment. The moment that causes a change comes before the change.
17. **The asker makes the next move.** When a lookup answers the one who asked, the next request leaves from the asker, not from the table it looked in. A table is something you ask, never a router.
18. **A colour holds while its state holds.** A box that went red when it locked stays red until it unlocks. Use at most two colours besides blue on one diagram; a failure coming back is a `refuse` (red), not a plain `back`.
19. **A connection both sides talk over is one wire with a head at each end** (`{ both: true }`): an open TCP connection, a websocket, a tunnel. A request and its answer are still one wire with one head, run then `back`.
20. **No narrator.** A panel or caption that tells the reader what the picture is doing ("3 of 6 marked", "sweep frees 3 objects") means the picture is not clear enough. Make the change visible in the marks themselves and cut the narration.
21. **Plain names, not codes.** Call things what a reader calls them ("your commit", "their commit", "merge"), never invented labels like C1 or F1.
22. **Room around things.** Things in a row or column stand 24 px or more apart; a thing inside a frame or lane stands 20 px or more from its edge.
23. **Every moment earns its place.** A moment that only un-lights, or re-lights what was already shown, adds nothing: cut it.
24. **Short names on a strip.** Two or three words per part; narrow parts need shorter names, or the strip wider.
