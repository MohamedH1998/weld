// template: layouts  (main mark: segments)
// shape: Two orders, the light sweeps the prices
// nearest: layouts (same twelve parts, two orders, a light that sweeps what is read)
import { story } from "../story";
import { caption, label, segments } from "../mk";

// three orders, each with id, name, quantity and price: kept by row (each row whole), or by column (each column whole)
const ONE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const BY_ROW = ["1001  id", "Ada  name", "2  qty", "4.50  price", "1002  id", "Ben  name", "1  qty", "9.00  price", "1003  id", "Cy  name", "3  qty", "2.25  price"];
const BY_COLUMN = ["1001  id", "1002  id", "1003  id", "Ada  name", "Ben  name", "Cy  name", "2  qty", "1  qty", "3  qty", "4.50  price", "9.00  price", "2.25  price"];

export const TRIAL = story({
  slug: "r27d", name: "Adding up prices: by row or by column", about: "Twelve parts of three orders, kept by row or by column: summing the prices reads every part one way, only the three prices the other.",
  things: [
    label("rn", 0, -28, "KEPT BY ROW"), segments("row", 0, 0, 720, ONE, BY_ROW, 0),
    label("cn", 0, 132, "KEPT BY COLUMN"), segments("col", 0, 160, 720, ONE, BY_COLUMN, 0),
    caption("c", 0, 290, "The same twelve parts, kept two ways."),
  ],
  links: [],
  beats: [
    {},
    { set: { row: 1 }, say: { c: "By row: each order sits together, price last." } },
    { set: { row: 12 }, over: 2400, say: { c: "Summing the prices reads every part to reach them: twelve reads." } },
    { set: { row: 0, col: 10 }, say: { c: "By column: the prices sit together, so the sum starts at the first." } },
    { set: { col: 12 }, over: 1200, say: { c: "Three reads, and nothing else." }, hold: 2400 },
  ],
});
