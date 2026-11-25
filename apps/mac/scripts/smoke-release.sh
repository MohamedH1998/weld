#!/bin/sh
# The smoke check, run on the app as people get it: copied out of the finished DMG, its signature verified first.
# usage: scripts/smoke-release.sh out/release/Weld-<version>-<arch>.dmg
set -eu
dmg="$1"
mnt="$(mktemp -d)"; dir="$(mktemp -d)"
trap 'hdiutil detach "$mnt" -quiet 2>/dev/null || true; rm -rf "$dir"' EXIT
hdiutil attach "$dmg" -mountpoint "$mnt" -nobrowse -quiet
ditto "$mnt/Weld.app" "$dir/Weld.app"
hdiutil detach "$mnt" -quiet
codesign --verify --deep --strict "$dir/Weld.app"
WELD_EXEC="$dir/Weld.app/Contents/MacOS/Weld" node scripts/shot.mjs "$dir/smoke" test/smoke.mjs
