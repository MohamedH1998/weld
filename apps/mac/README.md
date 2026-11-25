# Weld for Mac

The Weld app: an Electron window holding the board, with threads, terminals and live pages on it.

```sh
pnpm dev        # the app on a dev server, with reload
pnpm app        # build out/Weld-darwin-arm64/Weld.app
pnpm smoke      # open the app in test mode and check the basics, with a mock agent
pnpm release    # a signed (or ad-hoc signed) DMG and zip in out/release
```

| Path | Holds |
| --- | --- |
| `electron/` | The main process: windows, agents' turns, shells, the `weld` command agents use |
| `src/live/` | Threads, terminals and pages on the board, agents' marks, smiths, the bar |
| `src/canvas/` | The app's shell around the [canvas engine](../../packages/canvas) |
| `test/` | The smoke check, a mock agent, and checks for diagrams and agents' stories |

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for how changes are checked and released.
