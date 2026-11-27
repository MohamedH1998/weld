// template: tickets  (main mark: zone)
// For a board of work: a column per stage (queued, building, in review, done), a ticket per piece of work in the column it is in, the counts in the column names.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: columns left to right in the order work moves; the one in hand lit (`on`), done ones green, ones waiting on the person amber; no wires.
// To move a ticket, send the story again with "replace": "#id" and the ticket in its new column.
import { story } from "../story";
import { caption, ticket, zone } from "../mk";

export const TRIAL = story({
    slug: "template-tickets", name: "Seven of ten in main", about: "A ticket board: queued, building, in review and in main, the one being built lit and the merged ones green.",
    things: [zone("queued", 0, 0, 280, 600, "QUEUED  ·  3"), zone("building", 300, 0, 280, 600, "BUILDING  ·  1"), zone("review", 600, 0, 280, 600, "IN REVIEW  ·  1"), zone("main", 900, 0, 280, 600, "IN MAIN  ·  5"),
      ticket("t59", 15, 50, "#59", "Refunds: list"), ticket("t60", 15, 160, "#60", "Refunds: issue"), ticket("t61", 15, 270, "#61", "Gift cards"),
      ticket("t50", 315, 50, "#50", "Order link fix"),
      ticket("t58", 615, 50, "#58", "Webhooks go-live"),
      ticket("t53", 915, 50, "#53", "Saved addresses"), ticket("t54", 915, 160, "#54", "Events schema"), ticket("t55", 915, 270, "#55", "Events service"), ticket("t56", 915, 380, "#56", "Webhook stream"), ticket("t57", 915, 490, "#57", "Webhook watch"),
      caption("c", 0, 630, "Seven of ten in main; one building, one waiting on your review. Nothing is live until you ship.")],
    links: [],
    beats: [{ on: ["t50"], tone: { t58: "amber", t53: "green", t54: "green", t55: "green", t56: "green", t57: "green" } }],
  });
