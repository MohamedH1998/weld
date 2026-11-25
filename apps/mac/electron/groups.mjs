// The agents Weld starts run in process groups of their own (so stopping one stops what it started). If Weld itself is
// killed outright, nothing stops them: they are written down here as they start, and the next Weld ends what is left.
//
// Which group is still ours: only one whose leader (the agent itself) is alive and started exactly when ours did. Ending
// that group ends what the agent started too. A group whose leader has gone is left alone: once a group has emptied its
// number can be reused, so nothing left in it can be proven to be ours.
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const started = (pid) => {
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
};
/** Every process now in group `pgid`, by pid. */
const inGroup = (pgid) => {
  try {
    return execFileSync("ps", ["-A", "-o", "pid=,pgid="], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().split(/\s+/).map(Number))
      .filter(([p, g]) => g === pgid && p)
      .map(([p]) => p);
  } catch {
    return [];
  }
};

export function processGroups(file) {
  let list = {};
  try {
    list = JSON.parse(readFileSync(file, "utf8")) || {};
  } catch {
    list = {};
  }
  const save = () => {
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(list));
      renameSync(`${file}.tmp`, file);
    } catch {
      /* not kept: at worst a crash leaves one running, as before */
    }
  };
  return {
    /** A group just started (its leader `proc`), forgotten when the leader exits. */
    add(proc) {
      const pid = proc?.pid;
      if (!pid) return;
      list[pid] = { start: started(pid) };
      save();
      proc.once("exit", () => {
        delete list[pid];
        save();
      });
    },
    /** Left by a Weld that did not get to stop them: every group still ours is ended. Resolves once they are gone. */
    async sweep() {
      const left = Object.entries(list);
      if (!left.length) return 0;
      const ours = [];
      for (const [p, { start }] of left) {
        const pid = Number(p);
        if (!start || started(pid) !== start) continue; // gone, or a new process that reused the number
        if (!inGroup(pid).includes(pid)) continue; // alive, but no longer leading a group of its own
        ours.push(pid);
      }
      for (const pid of ours) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          /* gone */
        }
      }
      if (ours.length) {
        await new Promise((r) => setTimeout(r, 1500));
        for (const pid of ours) {
          try {
            if (inGroup(pid).length) process.kill(-pid, "SIGKILL");
          } catch {
            /* gone */
          }
        }
      }
      list = {};
      save();
      return ours.length;
    },
  };
}
