// template: handoff  (main mark: panel)
// nearest: git-add-commit-push (borrow: one card per stop, each stop's detail line says its state)
import { story } from "../story";
import { card, panel, wire } from "../mk";

export const TRIAL = story({
  slug: "r25g", name: "A failed test stops the pipeline", about: "A push starts a build, then the tests, then a deploy to staging. The tests fail, so the pipeline stops there and the deploy never runs.",
  things: [
    card("push", 0, 16, "Push", 170, 72),
    panel("build", 250, 0, "BUILD", "waiting", 240, 104),
    panel("tests", 570, 0, "TESTS", "waiting", 240, 104),
    panel("deploy", 890, 0, "STAGING", "waiting", 240, 104),
  ],
  links: [
    wire("l1", "push.r", "build.l", { text: "commit" }),
    wire("l2", "build.r", "tests.l", { text: "image" }),
    wire("l3", "tests.r", "deploy.l", { text: "tested image" }),
  ],
  beats: [
    { on: ["push"], run: ["l1"], say: { build: "building" } },
    { on: ["build"], say: { build: "built" }, tone: { build: "green" } },
    { on: ["tests"], run: ["l2"], say: { tests: "running 240 tests" }, tone: { build: "green" } },
    { on: ["tests"], say: { tests: "1 failed" }, tone: { build: "green", tests: "red" } },
    { say: { deploy: "never ran" }, tone: { build: "green", tests: "red" }, faint: ["deploy", "l3"], hold: 2400 },
  ],
});
