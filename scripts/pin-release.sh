#!/bin/sh
# After `pnpm --filter @weld/mac release`: writes the release's version and its zip's SHA-256 into install.sh, which then
# installs exactly that release. Commit it with the release tag.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$root/apps/mac/package.json').version")
zip="$root/apps/mac/out/release/Weld-$version-arm64.zip"
[ -f "$zip" ] || { echo "no $zip: run pnpm --filter @weld/mac release first" >&2; exit 1; }
sum=$(shasum -a 256 "$zip" | awk '{ print $1 }')
sed -i '' -e "s/^VERSION=\".*\"$/VERSION=\"$version\"/" -e "s/^SHA256=\".*\"$/SHA256=\"$sum\"/" "$root/install.sh"
grep -E '^(VERSION|SHA256)=' "$root/install.sh"
