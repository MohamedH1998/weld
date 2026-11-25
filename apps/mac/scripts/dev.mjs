// Runs the page's dev server and opens the app on it.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import electron from "electron";

// macOS names an app in the menu bar and the Dock from its bundle, and Electron's own bundle is called Electron. So the
// dev app runs from a copy of that bundle named Weld, with Weld's icon: made once per Electron version (a clone on
// APFS, so it is quick and takes no space), and signed again, since renaming it changes what its signature covers.
function weldBundle() {
  const exe = String(electron), stock = path.resolve(exe, "../../.."); // …/Electron.app
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(root, "node_modules", ".weld-dev"), app = path.join(dir, "Weld.app"), stamp = path.join(dir, "made-from");
  const from = `${stock} ${JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version}`;
  try {
    if (existsSync(app) && readFileSync(stamp, "utf8") === from) return path.join(app, "Contents", "MacOS", "Electron");
    rmSync(dir, { recursive: true, force: true });
    execFileSync("mkdir", ["-p", dir]);
    execFileSync("cp", ["-Rc", stock, app]);
    const plist = path.join(app, "Contents", "Info.plist");
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) execFileSync("plutil", ["-replace", key, "-string", "Weld", plist]);
    const icon = path.join(root, "build", "icon.icns");
    if (existsSync(icon)) execFileSync("cp", [icon, path.join(app, "Contents", "Resources", "electron.icns")]);
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
    writeFileSync(stamp, from);
    return path.join(app, "Contents", "MacOS", "Electron");
  } catch {
    // (anything in the way: Electron's own bundle, named Electron, rather than no app at all)
    return exe;
  }
}

const server = await createServer({ server: { port: 3210, strictPort: true } });
await server.listen();
const app = spawn(process.platform === "darwin" ? weldBundle() : String(electron), ["."], { stdio: "inherit", env: { ...process.env, WELD_DEV_URL: "http://localhost:3210" } });
app.on("exit", async () => {
  await server.close();
  process.exit(0);
});
