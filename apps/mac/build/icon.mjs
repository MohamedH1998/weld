// Renders the icon drawing to a 1024px picture, then to an .icns (run with electron).
import { app, BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const here = import.meta.dirname;
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(here, "icon.html"));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const png = path.join(here, "icon.png");
  writeFileSync(png, img.resize({ width: 1024, height: 1024 }).toPNG());
  const set = path.join(here, "icon.iconset");
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set);
  for (const n of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(n), String(n), png, "--out", path.join(set, `icon_${n}x${n}.png`)]);
    execFileSync("sips", ["-z", String(n * 2), String(n * 2), png, "--out", path.join(set, `icon_${n}x${n}@2x.png`)]);
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(here, "icon.icns")]);
  rmSync(set, { recursive: true, force: true });
  app.quit();
});
