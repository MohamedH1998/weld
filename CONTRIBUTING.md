# Contributing to Weld

Thanks for helping. This repository is a pnpm workspace with two apps: `apps/mac`, the Weld Mac app (Electron: plain
JavaScript in the main process, React and TypeScript in the window), and `apps/web`, the web canvas (TanStack Start on
Cloudflare Workers). Both are built on one canvas engine, the package `packages/canvas` (`@weld/canvas`), which each
imports by module (`@weld/canvas/editor`, `@weld/canvas/render`, ...).

## Set up

```sh
pnpm install
pnpm dev       # the Mac app on a dev server, with reload
pnpm dev:web   # the web canvas
```

You need macOS on Apple silicon, Node 22.13 or later and pnpm (the version in `package.json`). Agent threads need Claude
Code and/or Codex installed and signed in; everything else works without them.

## Check a change

```sh
pnpm typecheck   # both apps
pnpm build       # both apps
pnpm smoke       # opens the Mac app in test mode and checks the basics, with a mock agent
```

The paths below are inside `apps/mac`. For the web canvas, `pnpm --filter @weld/web check` runs its canvas checks.

`scripts/shot.mjs` drives the app for checks: `node scripts/shot.mjs <outDir> <steps.mjs>` opens Weld against a
throwaway data folder in test mode (never your own board), runs the steps file, and fails if a step throws or prints a
line starting `FAIL`. `test/smoke.mjs` is an example; `test/mock-acp-agent.mjs` is a scripted ACP agent that needs no
credentials. Pull requests run the same checks in CI.

To see a new person's first board on a Mac that has Claude Code or Codex, open Weld with
`open --env WELD_PRETEND_NO_AGENTS=1 -a Weld`: it acts as if neither were installed.

A change to how the app looks or behaves is easiest to review with a screenshot or a short recording. If you work with
a coding agent, point it at [AGENTS.md](AGENTS.md).

## Layout of the Mac app (`apps/mac`)

| Path | Holds |
| --- | --- |
| `electron/main.mjs` | The window, menu, files, and the door the `weld` command knocks on |
| `electron/agents.mjs` | Threads: runs the agents' tools per turn and turns their events into one record |
| `electron/acp.mjs` | Weld's threads for T3 Code (ACP over a private socket) and the `weld acp` shim |
| `electron/t3.mjs` | Connecting T3 Code: Weld's entry in T3 Code's own settings, added or taken off from Settings |
| `electron/acpclient.mjs`, `acppolicy.mjs`, `harness.mjs` | ACP agents as a thread's agent: the client, what it may do in each mode, and which agents there are |
| `electron/boards.mjs` | The boards someone keeps, and what is asked of a board while it is away |
| `electron/pty.mjs` | Shells |
| `electron/assets.mjs` | Pictures: kept by their content, with a preview for drawing them small |
| `electron/groups.mjs` | Agents' process groups, written down so a Weld that was killed has them ended at its next start |
| `electron/life.mjs` | How each run ended (`exits.log`) |
| `src/live/` | The live things (threads, terminals, pages), the layer they stand on, agents' marks, smiths, the top bar and jump list |
| `src/canvas/CanvasView.tsx` | The board's shell in the window: the canvas, the toolbar and bars, and the live layer between its two sheets |
| `scripts/` | Running, packaging and driving the app |
| `test/` | The smoke check, the mock agent, and checks for the bar, diagrams (`diagrams.mjs`) and agents' stories (`story.mjs`) |

## The canvas engine (`packages/canvas`)

| Path | Holds |
| --- | --- |
| `src/editor.ts`, `store.ts` | The board's behaviour (camera, select, move, resize, snap, arrows, undo) and its state, saved in the page's storage |
| `src/render.ts`, `shapes.ts`, `kinds.ts` | Drawing the board: the marks and the kinds of shape, and the tiles a large board is kept as while the view moves |
| `src/story.ts`, `mk.ts`, `notation.ts` | Stories that play through moments, the helpers they are written with, and the JSON form agents send |
| `src/templates/`, `trial/`, `accepted.ts` | The templates agents start from and the accepted diagrams |
| `src/catalogue.json`, `GUIDE.md`, `guide.ts` | The catalogue agents search with `weld guide find`, and the guide they read with `weld guide` |

Both apps' checks exercise it: the Mac app's `test/diagrams.mjs` and the web canvas's `pnpm check`.

## Releasing

A release is what `install.sh` installs, checked against the SHA-256 written in it, so it is published from the very
build that was pinned:

```sh
pnpm --filter @weld/mac release       # builds out/release/Weld-<version>-arm64.{dmg,zip} and SHA256SUMS.txt
scripts/pin-release.sh                # writes that version and the zip's SHA-256 into install.sh
git commit -am "release: v<version>" && git tag v<version> && git push && git push --tags
gh release create v<version> apps/mac/out/release/* --title "Weld <version>"
```

`.github/workflows/release.yml` can build a release in CI instead, run by hand for a tag (then pin its zip, not a local one); the tag must match the
version in `apps/mac/package.json`, and it refuses to run for a branch. It runs in the `release` environment: keep the signing secrets there,
and limit the environment to `v*` tags in the repository's settings, so only a pushed tag can be signed. It builds the app, signs it if set up, checks the app copied out of the DMG, and drafts a
GitHub release with the DMG, a zip and their checksums. Publish the draft when it looks right.

Signing needs an Apple Developer account. Add these repository secrets (all of them; with none, releases are ad-hoc
signed and people allow Weld in Privacy & Security the first time):

| Secret | What it is |
| --- | --- |
| `MACOS_CERTIFICATE` | A "Developer ID Application" certificate exported as .p12, base64-encoded |
| `MACOS_CERTIFICATE_PASSWORD` | The .p12's password |
| `APPLE_API_KEY_P8` | The contents of an App Store Connect API key (.p8), for notarization |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | That key's id and issuer id |
