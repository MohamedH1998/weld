<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/mac/brand/lockup-dark.svg">
  <img alt="Weld" src="apps/mac/brand/lockup.svg" width="180">
</picture>

The infinite canvas harness for coding agents.

**[Install on Mac](#install)** &nbsp;·&nbsp; **[Try the canvas](https://weld.momito.co.uk)** &nbsp;·&nbsp; [Guide](docs/guide.md)

Weld puts your agents, their terminals and the pages they build side by side on one board. Run Claude Code and Codex
together, point at what you mean instead of describing it, and watch the work come together.

- **Agents, side by side.** Claude Code, Codex, Cursor, OpenCode and more, each with a mark showing where it is
  working.
- **Works with T3 Code.** One click in Settings, and Weld's threads open in [T3 Code](https://github.com/pingdotgg/t3code),
  on your phone too.
- **Point, don't describe.** Select anything on the board and ask about it. The work lands beside it.
- **Plan on the canvas.** Agents draw diagrams that play through their moments, starting from a catalogue of 279.
- **See what gets built.** Pages open live on the board, exactly as your browser shows them.
- **Ask AI, right where you are.** Select a drawing or a page and press **Ask AI**: a smith, a short-lived helper, changes it in place, with Undo.

Weld has no model of its own. It runs the agents you already use, signed in as you, and keeps everything on your Mac.

## Install

On a Mac with Apple silicon and macOS 13 or later, in Terminal:

```sh
s=$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh) && /bin/sh -c "$s"
```

That puts the latest Weld in Applications; open it from there. Run the line again to update. Weld runs
[Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://github.com/openai/codex); if you have
neither, it offers to install one the first time it opens. Weld isn't notarized by Apple yet: see the
[guide](docs/guide.md#install) for what that means and for the other ways to install.

To build it yourself instead, with [Node](https://nodejs.org) 22.13 or later and [pnpm](https://pnpm.io/installation):

```sh
git clone https://github.com/MohamedH1998/weld && cd weld
pnpm install
pnpm app
```

The canvas also runs in any browser at [weld.momito.co.uk](https://weld.momito.co.uk), with boards you can share by link.

## Build

```sh
pnpm dev        # the Mac app, with reload
pnpm dev:web    # the canvas in a browser
```

| | |
| --- | --- |
| [`apps/mac`](apps/mac) | The Mac app |
| [`apps/web`](apps/web) | The canvas on the web |
| [`packages/canvas`](packages/canvas) | The canvas engine both are built on |

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and the [guide](docs/guide.md) for agents, keys and privacy.

## License

[MIT](LICENSE)
