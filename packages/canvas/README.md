# @weld/canvas

The canvas engine behind [Weld](../../README.md): an infinite board with a camera, shapes, wires that snap level and
upright, undo, and diagrams that play through their moments.

| File | What it is |
| --- | --- |
| `editor.ts` | The board's behaviour: select, move, resize, draw, wire, snap, undo |
| `store.ts` | The document and the camera, kept and restored |
| `render.ts`, `shapes.ts` | Drawing the board and every kind of mark |
| `geometry.ts` | Where wires run and where they meet shapes |
| `story.ts`, `mk.ts`, `notation.ts` | Diagrams as stories: things, links and the beats they play through |
| `GUIDE.md`, `guide.ts`, `catalogue.json` | How agents are taught to draw, and the 279 diagrams they start from |

Both [the Mac app](../../apps/mac) and [the canvas on the web](../../apps/web) import it by path, for example
`@weld/canvas/editor`.
