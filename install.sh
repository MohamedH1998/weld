#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon:
#
#   curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh | sh
#
# It downloads the latest release, checks it against the release's checksums and its signature, puts it in
# Applications and opens it. Run it again to update. Nothing else on the Mac is changed.
set -eu

repo="MohamedH1998/weld"
from="${WELD_DOWNLOAD:-https://github.com/$repo/releases/latest/download}"
say() { printf '%s\n' "$*"; }
fail() { say "weld: $*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || fail "Weld is a Mac app."
[ "$(uname -m)" = arm64 ] || fail "Weld needs a Mac with Apple silicon."
major=$(sw_vers -productVersion | cut -d. -f1)
[ "$major" -ge 13 ] || fail "Weld needs macOS 13 or later."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

say "Downloading Weld…"
curl -fL --progress-bar "$from/Weld-arm64.zip" -o "$tmp/Weld.zip" || fail "couldn't download Weld from $from."
curl -fsSL "$from/SHA256SUMS.txt" -o "$tmp/SHA256SUMS.txt" || fail "couldn't download the release's checksums."
want=$(awk '$2 == "Weld-arm64.zip" { print $1 }' "$tmp/SHA256SUMS.txt")
got=$(shasum -a 256 "$tmp/Weld.zip" | awk '{ print $1 }')
[ -n "$want" ] && [ "$want" = "$got" ] || fail "the download doesn't match the release's checksum, so nothing was installed."

ditto -x -k "$tmp/Weld.zip" "$tmp/app"
[ -d "$tmp/app/Weld.app" ] || fail "the download didn't hold Weld.app."
codesign --verify --deep --strict "$tmp/app/Weld.app" 2>/dev/null || fail "Weld's signature didn't check out, so nothing was installed."

# into Applications, or (where that can't be written) the person's own Applications folder
dest="${WELD_INSTALL_DIR:-/Applications}"
if [ ! -w "$dest" ]; then dest="$HOME/Applications"; mkdir -p "$dest"; fi
if pgrep -xq Weld; then fail "Weld is open. Quit it (⌘Q), then run this again to update."; fi

rm -rf "$dest/Weld.app"
ditto "$tmp/app/Weld.app" "$dest/Weld.app"
say "Weld is installed in $dest."
[ "${WELD_NO_OPEN:-}" = 1 ] || open "$dest/Weld.app"
