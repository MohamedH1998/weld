#!/bin/sh
# After `pnpm --filter @weld/mac release`: writes the release's version and its zip's SHA-256 into install.sh, which then
# installs exactly that release. Commit it with the release tag.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$root/apps/mac/package.json').version")
zip="$root/apps/mac/out/release/Weld-$version-arm64.zip"
[ -f "$zip" ] || { echo "no $zip: run pnpm --filter @weld/mac release first" >&2; exit 1; }
out=$(shasum -a 256 "$zip") || { echo "couldn't hash $zip" >&2; exit 1; }
sum=${out%% *}
case "$sum" in *[!0-9a-f]* | "") echo "not a SHA-256: $sum" >&2; exit 1 ;; esac
[ "${#sum}" -eq 64 ] || { echo "not a SHA-256: $sum" >&2; exit 1; }
sed -i '' -e "s/^VERSION=\".*\"$/VERSION=\"$version\"/" -e "s/^SHA256=\".*\"$/SHA256=\"$sum\"/" "$root/install.sh"
grep -qx "SHA256=\"$sum\"" "$root/install.sh" && grep -qx "VERSION=\"$version\"" "$root/install.sh" || { echo "couldn't write the pin into install.sh" >&2; exit 1; }
echo "install.sh now installs Weld $version ($sum). Publish exactly $zip with the tag v$version."
