# Notes for coding agents working on Weld

This is a pnpm workspace: the Mac app is `apps/mac`, the web canvas is `apps/web`, and the canvas engine both are built
on is `packages/canvas` (`@weld/canvas`). Read CONTRIBUTING.md for the layout.

## The Mac app (`apps/mac`)

- The main process is `electron/` (plain ES modules, no build step); the window is `src/` (React 19 + TypeScript, built
  by Vite).
- Before saying a change is done: `pnpm typecheck`, `pnpm build`, and `pnpm smoke`. For anything you can see, drive
  the app with `scripts/shot.mjs` and look at the screenshots it saves; it always runs against a throwaway data folder.
- Never point checks at the real data folder (`~/Library/Application Support/Weld`) or quit someone's running Weld.
- Anything the window may ask of the main process goes through `electron/preload.cjs` and an `ipcMain` handler in
  `wire()` in `electron/main.mjs`; those answer only Weld's own window.
- Diagrams on the board follow `packages/canvas/src/GUIDE.md` (what agents read with `weld guide`); `test/diagrams.mjs` and
  `test/story.mjs` check the board's diagrams and an agent drawing one.

## The web canvas (`apps/web`)

- TanStack Start on Cloudflare Workers: the board in the browser, shared boards (`src/server/`), and the MCP endpoint
  agents draw through.
- Before saying a change is done: `pnpm typecheck` and `pnpm build`; `pnpm check` runs the canvas checks.

## Both

- There is one canvas engine, `packages/canvas`, and both apps import it (`@weld/canvas/editor`, `@weld/canvas/render`,
  and so on). A fix to the engine goes there once; check it in both apps (the Mac app's typecheck, build and
  `test/diagrams.mjs`, and the web's `pnpm check`). What stays in an app is only what is that app's own: the Mac app's
  shell and live things, the web's shell, sharing, WebMCP and its gold and board diagrams.
- Where the two apps need the engine to behave differently, give the engine a switch with the Mac app's behaviour as the
  default (as `Editor.liveKeys` and the `pass` argument of `render` do) rather than copying a file into an app.
- Comments say why, in plain words. Keep changes small and in the style of the code around them.
