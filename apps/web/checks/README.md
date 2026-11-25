# Checks

Scripts that drive the real app in headless Chrome. Start the dev server first (`pnpm dev`).

- `pnpm check` runs the edge cases (`cases.mjs`), the arrow continuity sweep (`sweep.mjs`) and every tool on every kind of target (`matrix.mjs`, a printed table to read).
- `pnpm check:fuzz` sends random real input and checks the board after every action; then undoes to empty and redoes to the same board. `node checks/fuzz.mjs <seed> <runs> <actions>` reproduces a run.
- `pnpm check:perf` times painting and pointer moves with 10,000 shapes.
