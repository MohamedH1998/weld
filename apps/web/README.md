# Weld on the web

The Weld canvas in a browser, live at [weld.momito.co.uk](https://weld.momito.co.uk): the same board and diagram
engine as the Mac app ([`packages/canvas`](../../packages/canvas)), with boards shared by link and an MCP endpoint that
agents draw through. It runs on Cloudflare Workers (TanStack Start, with a Durable Object per shared board).

```sh
pnpm dev          # http://localhost:3100
pnpm build
pnpm check        # the canvas checks (drawing, moments, export, parity with the reference diagrams)
```

| Path | Holds |
| --- | --- |
| `src/canvas/` | The web's own part of the board: its shell (`CanvasView.tsx`), sharing (`ShareBar.tsx`), WebMCP (`agent.ts`), the guide it hands agents (`guide.ts`), the URL switches for `/lab` and the demo boards (`switches.ts`), and the gold-standard and board diagrams (`gold.ts`, `board.ts`, joined to the engine's in `accepted.ts`) |
| `../../packages/canvas/` | The canvas engine itself, `@weld/canvas`, the same one the Mac app runs |
| `src/routes/` | The pages: the board, a shared board (`/b/<key>`), the catalogue (`/catalogue`) |
| `src/server/` | Shared boards, sign-in and the MCP endpoint |
| `checks/` | Checks that drive the board in a browser and compare its drawing with reference diagrams |
| `DIAGRAMS.md`, `CATALOGUE.md` | How a good diagram is made, and every diagram in the catalogue |

Deploying is `pnpm build && pnpm wrangler deploy` with your own Cloudflare account (`wrangler.jsonc`). Set `VITE_SITE` to
the address it is served from (in a local `.env.production`) so link previews point at it.
