# Security

Please report a vulnerability privately, through GitHub's **Report a vulnerability** on this repository's Security
tab, rather than in a public issue. Say what you found, how to reproduce it, and what it lets someone do. We aim to
reply within a week.

## What Weld can do on your Mac

Weld runs coding agents, shells and web pages as you. In particular:

- An agent in **Full access** can read and change any file you can and run any command. Edits only narrows
  that for Claude and Codex; ACP agents run in Full access only.
- The `weld` command that agents use reaches Weld over a local port, with a key per conversation that Weld hands only
  to the processes it starts.
- T3 Code reaches Weld over a socket only your user can open. Any program running as you can use it, as it could
  already run the agents directly.
- Pages on the board run in a separate, sandboxed session with no access to Weld itself. Local files are shown from an
  address of their own folder, so a page reaches only that folder.

Reports about any of these boundaries being crossed are especially welcome.
