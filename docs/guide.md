# Using Weld

The details behind the [README](../README.md): how agents use the board, which agents run, the keys, and what Weld can
do on your Mac.

## How agents use the board

Everything Weld starts is given a `weld` command. Agents are told about it, and use it the way you use the board:

| Command | What it does |
| --- | --- |
| `weld open <address>` | Put a live page beside the thread: a URL, `localhost:5173`, or a local file |
| `weld run '<command>'` | Run a dev server or watcher in the background, listed on the thread (`--show` puts it in a terminal) |
| `weld look` | See what is connected to the thread, as it is now |
| `weld draw '<json>'` | Draw on the board: shapes and arrows, or a whole diagram that plays |
| `weld guide find <words>` | Find the catalogue's diagrams closest to a subject, to start from |
| `weld click`, `weld type` | Use a page the agent opened, to check its own work |

## Agents

| Agent | How it runs |
| --- | --- |
| **Claude Code**, **Codex** | With **Full access**, **Edits only** or **Plan**. Not installed? Weld offers to install either one, in a terminal on the board, then asks you to sign in |
| **Cursor, OpenCode, Grok, Kiro, Antigravity, fx, Pi** | Found by themselves once their command-line tool is installed (`cursor-agent`, `opencode`, `grok`, `kiro-cli`, `agy`, `fx`, `pi-acp`). Early support: Full access only, until each has been checked against the real agent |
| **Any other agent** | In **Settings**, add it by the command that starts it. Keys go in as references to your shell's variables (`API_KEY=$MY_API_KEY`), so Weld never stores a secret |

Agents in the last two rows talk to Weld over the [Agent Client Protocol](https://agentclientprotocol.com), the open
standard many coding agents support. You don't need to know anything about it to use them.

### T3 Code

To use Weld's threads from [T3 Code](https://github.com/pingdotgg/t3code), open **Settings** (⌘,) and press **Connect**
under T3 Code. Weld adds itself to T3 Code as an agent. In T3 Code, open the folder a thread works in as a project, then
pick **Weld** there to open, follow and answer that folder's threads, from T3 Code's phone app too. **Disconnect** takes
it off again.

## Keys

| Key | Does |
| --- | --- |
| ⌘N, ⌘T, ⌘B | New thread, terminal, page |
| ⌘K | Jump to anything by name, or to another board |
| ⌘J | Next thread that is ready or stopped |
| ⌘I | Ask a smith |
| ⌘1, ⌘0 | See everything; the selected thing at full size |
| V, H | Select; move around |
| C, S, B | Draw a thread, terminal or page where you want it |
| R, A, L, T | Rectangle, arrow, line, text |
| Escape (thread), ⇧Escape (terminal) | Hand the keys back to the board |

## Privacy and safety

- Weld keeps everything on your Mac and sends nothing anywhere of its own accord. The agents you run, and the pages you
  open, use the network as they always do.
- An agent in **Full access** (the default for a new thread) can do anything you can. **Edits only** and **Plan** narrow
  that for Claude Code and Codex. Choose a thread's folder and mode with care.
- Work started from an empty board goes in a folder of its own under `~/Weld/scratch`, never your home folder.
- Pages run in a separate, sandboxed session with no access to Weld itself.

Boards, threads and pictures are kept in `~/Library/Application Support/Weld`. See [SECURITY.md](../SECURITY.md) for what
Weld can do on your Mac and how to report a vulnerability.
