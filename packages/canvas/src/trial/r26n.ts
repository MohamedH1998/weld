// shape: Two ways through
// template: turns  (main mark: lifeline)
// nearest: r25n (borrow: one party asking three in turn, both outcomes shown in order; here as messages down lifelines, not elbow wires)
// A coordinator asks three databases to prepare. Each votes; all yes, and it tells all three to commit.
// Then the same rows are reused: one no, and it tells all three to roll back.
import { story } from "../story";
import { lifeline, message, panel } from "../mk";

// each party's line runs down the middle of its panel (x + 120); each message has its own row, 60 px apart
const COORD = 120, ORDERS = 420, STOCK = 720, PAYMENTS = 1020, ROW = (i: number) => 160 + i * 60, END = ROW(8) + 36;

export const TRIAL = story({
  slug: "r26n", name: "Two-phase commit keeps three databases in step", about: "The coordinator asks each database to prepare. If all three vote yes it tells them all to commit. If one votes no it tells them all to roll back.",
  things: [
    panel("coord", 0, 0, "COORDINATOR", "waiting", 240, 104),
    panel("orders", 300, 0, "ORDERS", "waiting", 240, 104),
    panel("stock", 600, 0, "STOCK", "waiting", 240, 104),
    panel("payments", 900, 0, "PAYMENTS", "waiting", 240, 104),
  ],
  links: [
    // the parties' lines, there throughout
    lifeline("lc", "coord", COORD, END),
    lifeline("lo", "orders", ORDERS, END),
    lifeline("ls", "stock", STOCK, END),
    lifeline("lp", "payments", PAYMENTS, END),
    // the prepare round: one request to each database, all sent from the coordinator
    message("p1", COORD, ORDERS, ROW(0), "PREPARE"),
    message("p2", COORD, STOCK, ROW(1), "PREPARE"),
    message("p3", COORD, PAYMENTS, ROW(2), "PREPARE"),
    // the all-yes outcome: three votes, then commit to all three
    message("y1", ORDERS, COORD, ROW(3), "YES"),
    message("y2", STOCK, COORD, ROW(4), "YES"),
    message("y3", PAYMENTS, COORD, ROW(5), "YES"),
    message("c1", COORD, ORDERS, ROW(6), "COMMIT"),
    message("c2", COORD, STOCK, ROW(7), "COMMIT"),
    message("c3", COORD, PAYMENTS, ROW(8), "COMMIT"),
    // the one-no outcome, in the same rows: votes, then roll back to all three
    message("v1", ORDERS, COORD, ROW(3), "YES"),
    message("v2", STOCK, COORD, ROW(4), "NO", "red"),
    message("v3", PAYMENTS, COORD, ROW(5), "YES"),
    message("r1", COORD, ORDERS, ROW(6), "ROLLBACK", "red"),
    message("r2", COORD, STOCK, ROW(7), "ROLLBACK", "red"),
    message("r3", COORD, PAYMENTS, ROW(8), "ROLLBACK", "red"),
  ],
  beats: [
    { on: ["coord"], show: ["p1", "p2", "p3"], run: ["p1", "p2", "p3"], say: { coord: "asking all three to prepare", orders: "asked to prepare", stock: "asked to prepare", payments: "asked to prepare" } },
    { on: ["orders"], show: ["y1"], run: ["y1"], say: { orders: "prepared, yes", coord: "1 of 3 yes" } },
    { on: ["stock"], show: ["y2"], run: ["y2"], say: { stock: "prepared, yes", coord: "2 of 3 yes" } },
    { on: ["payments"], show: ["y3"], run: ["y3"], say: { payments: "prepared, yes", coord: "3 of 3 yes: commit" } },
    { on: ["coord"], show: ["c1", "c2", "c3"], run: ["c1", "c2", "c3"], say: { coord: "all yes: committing", orders: "committed", stock: "committed", payments: "committed" }, hold: 1200 },
    // the same rows again, this time with a no
    { drop: ["y1", "y2", "y3", "c1", "c2", "c3"], on: ["orders"], show: ["v1"], run: ["v1"], say: { orders: "prepared, yes", coord: "1 of 3 yes", stock: "asked to prepare", payments: "asked to prepare" } },
    { on: ["stock"], show: ["v2"], run: ["v2"], say: { stock: "prepared, no", coord: "a no: roll back" } },
    { on: ["payments"], show: ["v3"], run: ["v3"], say: { payments: "prepared, yes", coord: "3 answers in: roll back" } },
    { on: ["coord"], show: ["r1", "r2", "r3"], run: ["r1", "r2", "r3"], say: { coord: "rolling back all three", orders: "rolled back", stock: "rolled back", payments: "rolled back" }, hold: 2400 },
  ],
});
