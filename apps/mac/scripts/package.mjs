// Builds Weld.app, and with --release, the files a release ships: a DMG, a zip and their checksums.
//   pnpm app       out/Weld-darwin-<arch>/Weld.app, to run on this Mac (--install also puts it in /Applications)
//   pnpm release   the same app built apart and signed for others to download, then
//                  out/release/Weld-<version>-<arch>.{dmg,zip}
//                  and SHA256SUMS.txt
//
// Signing, for --release, follows what is set (all or nothing):
//   none of these          ad-hoc signed: it runs on any Mac once the person allows it in Privacy & Security
//   WELD_SIGN_IDENTITY     "Developer ID Application: …", in the keychain
//   APPLE_API_KEY          path to an App Store Connect API key (.p8)
//   APPLE_API_KEY_ID       that key's id
//   APPLE_API_ISSUER       its issuer id
//                          all four: signed with the hardened runtime, notarized and stapled (app and DMG)
// Anything in between is a mistake, and stops the build.
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APP_ID } from "../electron/identity.mjs";

const release = process.argv.includes("--release");
const install = process.argv.includes("--install");
const applications = process.env.WELD_INSTALL_DIR ?? "/Applications";
// (never replaced while it runs: the running app would lose its files from under it)
if (install) {
  let running = false;
  try { execFileSync("pgrep", ["-f", `${applications}/Weld.app/Contents/MacOS/Weld$`]); running = true; } catch {}
  if (running) { console.error("Weld is running: quit it, then run this again."); process.exit(1); }
}
const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// ── how it is signed ────────────────────────────────────────────────
const APPLE = ["WELD_SIGN_IDENTITY", "APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"];
const given = APPLE.filter((k) => process.env[k]);
if (release && given.length && given.length < APPLE.length) {
  console.error(`Signing is half set up: ${given.join(", ")} given, ${APPLE.filter((k) => !process.env[k]).join(", ")} missing.`);
  process.exit(1);
}
const signed = release && given.length === APPLE.length;
const identity = process.env.WELD_SIGN_IDENTITY;
const notary = signed ? { appleApiKey: process.env.APPLE_API_KEY, appleApiKeyId: process.env.APPLE_API_KEY_ID, appleApiIssuer: process.env.APPLE_API_ISSUER } : null;

// ── what goes in, laid out by hand: the built page, the app's own process, the one native module it loads ──
const stage = path.join(root, "out", "stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, "node_modules", "@lydell"), { recursive: true });
cpSync(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });
cpSync(path.join(root, "electron"), path.join(stage, "electron"), { recursive: true });
writeFileSync(path.join(stage, "package.json"), JSON.stringify({ name: pkg.name, productName: "Weld", version: pkg.version, description: pkg.description, license: pkg.license, type: "module", main: pkg.main }, null, 2));
// the shell library and the build of it for this machine, copied out of the package manager's store
const pty = realpathSync(path.join(root, "node_modules", "@lydell", "node-pty"));
cpSync(pty, path.join(stage, "node_modules", "@lydell", "node-pty"), { recursive: true, dereference: true });
const native = `node-pty-darwin-${process.arch}`;
cpSync(realpathSync(path.join(pty, "..", native)), path.join(stage, "node_modules", "@lydell", native), { recursive: true, dereference: true });

// ── the licences that travel with it: Weld's own, and every library and font it carries ──
const notices = path.join(root, "out", "THIRD_PARTY_NOTICES.txt");
{
  const list = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: root, encoding: "utf8" }));
  const parts = [`Weld ${pkg.version} includes the following third-party software.\n`];
  for (const [license, pkgs] of Object.entries(list))
    for (const p of pkgs.sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = p.paths?.[0];
      const file = dir && readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)/i.test(f));
      const text = file ? readFileSync(path.join(dir, file), "utf8").trim() : `${license} (see ${p.homepage ?? "the package"})`;
      parts.push(`${"─".repeat(72)}\n${p.name} ${p.versions.join(", ")} — ${license}\n\n${text}\n`);
    }
  mkdirSync(path.dirname(notices), { recursive: true });
  writeFileSync(notices, parts.join("\n"));
}

const [out] = await packager({
  dir: stage,
  // (a release is built apart from the app run here, so building one never replaces a Weld that is open)
  out: path.join(root, "out", release ? "release-build" : ""),
  name: "Weld",
  appBundleId: APP_ID,
  appVersion: pkg.version,
  platform: "darwin",
  arch: process.arch,
  overwrite: true,
  prune: false,
  asar: false,
  electronVersion: JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version,
  icon: path.join(root, "build", "icon.icns"),
  appCategoryType: "public.app-category.developer-tools",
  appCopyright: "Copyright © 2026 The Weld authors. MIT License.",
  extraResource: [path.join(root, "..", "..", "LICENSE"), notices],
  afterExtract: [
    (dir, _version, _platform, _arch, done) => {
      // the app speaks English: Electron's other hundred-odd languages (some 45 MB) are left out
      const res = path.join(dir, "Electron.app", "Contents", "Frameworks", "Electron Framework.framework", "Versions", "A", "Resources");
      try {
        for (const f of readdirSync(res)) if (f.endsWith(".lproj") && !/^(en|en_GB|Base)\.lproj$/.test(f)) rmSync(path.join(res, f), { recursive: true, force: true });
      } catch {
        /* laid out otherwise: left whole */
      }
      // Electron's and Chromium's licences go inside the app, so every copy of it carries them
      for (const f of ["LICENSE", "LICENSES.chromium.html"]) if (existsSync(path.join(dir, f))) cpSync(path.join(dir, f), path.join(dir, "Electron.app", "Contents", "Resources", f === "LICENSE" ? "LICENSE.electron.txt" : f));
      done();
    },
  ],
  ...(signed
    ? {
        osxSign: {
          identity,
          continueOnError: false,
          optionsForFile: () => ({ hardenedRuntime: true, entitlements: path.join(root, "build", "entitlements.mac.plist") }),
        },
        osxNotarize: notary,
      }
    : {}),
});
rmSync(stage, { recursive: true, force: true });
const app = path.join(out, "Weld.app");

if (release) {
  if (!signed) run("codesign", ["--force", "--deep", "--sign", "-", app]);
  run("codesign", ["--verify", "--deep", "--strict", app]);

  const dest = path.join(root, "out", "release");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const name = `Weld-${pkg.version}-${process.arch}`;

  // the DMG: the app and a shortcut to Applications to drag it into
  const folder = path.join(root, "out", "dmg");
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder);
  run("ditto", [app, path.join(folder, "Weld.app")]);
  symlinkSync("/Applications", path.join(folder, "Applications"));
  const dmg = path.join(dest, `${name}.dmg`);
  run("hdiutil", ["create", "-volname", "Weld", "-srcfolder", folder, "-fs", "HFS+", "-format", "UDZO", "-ov", dmg]);
  rmSync(folder, { recursive: true, force: true });
  if (signed) {
    run("codesign", ["--sign", identity, "--timestamp", dmg]);
    run("xcrun", ["notarytool", "submit", dmg, "--key", notary.appleApiKey, "--key-id", notary.appleApiKeyId, "--issuer", notary.appleApiIssuer, "--wait"]);
    run("xcrun", ["stapler", "staple", dmg]);
  }

  // the zip, of the same app
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, path.join(dest, `${name}.zip`)]);
  // (and under a name without the version, so the install script can always fetch the latest release from one address)
  const latest = `Weld-${process.arch}.zip`;
  run("cp", [path.join(dest, `${name}.zip`), path.join(dest, latest)]);

  const sums = execFileSync("shasum", ["-a", "256", `${name}.dmg`, `${name}.zip`, latest], { cwd: dest, encoding: "utf8" });
  writeFileSync(path.join(dest, "SHA256SUMS.txt"), sums);
  console.log(`${signed ? "signed and notarized" : "ad-hoc signed"}: ${dest}`);
}
if (install) {
  const to = path.join(applications, "Weld.app");
  // (signed ad hoc, as a release is without an identity: a Mac on Apple silicon runs only signed code)
  run("codesign", ["--force", "--deep", "--sign", "-", app]);
  rmSync(to, { recursive: true, force: true });
  run("ditto", [app, to]);
  console.log(`installed: ${to}`);
} else console.log(app);
