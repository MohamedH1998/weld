#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon (macOS 13 or later):
#
#   /bin/sh -c "$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh)"
#
# It finds the latest release, downloads it, checks it against that release's checksums and its signature, and puts it
# in Applications (or where Weld already is), then opens it. Run it again to update. It needs no sudo and changes
# nothing else on the Mac. An update never leaves you without a working Weld: the new copy is made and checked beside
# the old one, and only then swapped in.
#
# Everything is inside main(), called on the last line, so a script cut off while downloading runs nothing at all.

set -eu

REPO="MohamedH1998/weld"
BUNDLE_ID="app.weld.mac"

say() { printf '%s\n' "$*"; }
fail() { say "weld: $*" >&2; exit 1; }

main() {
  [ "$(uname -s)" = Darwin ] || fail "Weld is a Mac app."
  # (Apple silicon even from a terminal running under Rosetta, which says x86_64)
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "Weld needs a Mac with Apple silicon."
  major=$(sw_vers -productVersion | cut -d. -f1)
  [ "$major" -ge 13 ] || fail "Weld needs macOS 13 or later."

  stage=""
  tmp=$(mktemp -d)
  lock="${TMPDIR:-/tmp}/weld-install.lock"
  mkdir "$lock" 2>/dev/null || fail "another Weld install is running. Wait for it to finish (or remove $lock if none is)."
  trap 'rm -rf "$tmp" "$lock" ${stage:+"$stage"}' EXIT INT TERM

  # one release for every file, named by its tag (asking for "latest" twice could straddle a new release)
  if [ -n "${WELD_DOWNLOAD:-}" ]; then
    from="$WELD_DOWNLOAD"
  else
    tag=$(curl -fsSIL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" | sed -n 's|.*/releases/tag/||p')
    [ -n "$tag" ] || fail "couldn't find Weld's latest release. Check your connection and try again."
    from="https://github.com/$REPO/releases/download/$tag"
    say "Installing Weld ${tag#v}…"
  fi

  curl -fL --progress-bar "$from/Weld-arm64.zip" -o "$tmp/Weld.zip" || fail "couldn't download Weld."
  curl -fsSL "$from/SHA256SUMS.txt" -o "$tmp/SHA256SUMS.txt" || fail "couldn't download the release's checksums."
  want=$(awk '$2 == "Weld-arm64.zip" { print $1 }' "$tmp/SHA256SUMS.txt")
  got=$(shasum -a 256 "$tmp/Weld.zip" | awk '{ print $1 }')
  [ -n "$want" ] && [ "$want" = "$got" ] || fail "the download doesn't match the release's checksum, so nothing was installed."

  ditto -x -k "$tmp/Weld.zip" "$tmp/app"
  checked "$tmp/app/Weld.app" || fail "the download isn't a sound copy of Weld, so nothing was installed."

  # where it goes: where Weld already is, else Applications, else the person's own Applications folder
  if [ -n "${WELD_INSTALL_DIR:-}" ]; then dest="$WELD_INSTALL_DIR"
  elif [ -e "$HOME/Applications/Weld.app" ] && [ ! -e /Applications/Weld.app ]; then dest="$HOME/Applications"
  elif [ -w /Applications ]; then dest=/Applications
  elif [ -e /Applications/Weld.app ]; then fail "Weld is in /Applications, which this account can't change. Update it from an administrator account."
  else dest="$HOME/Applications"
  fi
  mkdir -p "$dest"
  target="$dest/Weld.app"

  # what is there now must be Weld (never a link, never another app that happens to be called Weld)
  if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] || fail "$target is a link, not an app. Move it aside, then run this again."
    [ "$(defaults read "$target/Contents/Info" CFBundleIdentifier 2>/dev/null || true)" = "$BUNDLE_ID" ] || fail "$target isn't Weld. Move it aside, then run this again."
  fi

  # the new copy, made and checked beside the old one (same disk, so the swap is a rename)
  stage="$dest/.Weld.app.installing-$$"
  ditto "$tmp/app/Weld.app" "$stage" || fail "couldn't copy Weld into $dest (is the disk full?). Your installed Weld is unchanged."
  checked "$stage" || fail "the copy in $dest didn't check out. Your installed Weld is unchanged."

  running && fail "Weld is open. Quit it (⌘Q), then run this again."

  if [ -e "$target" ]; then
    old="$dest/.Weld.app.previous-$$"
    mv "$target" "$old" || fail "couldn't move the old Weld aside (macOS may be asking to let your terminal change apps: allow it in System Settings → Privacy & Security → App Management). Your installed Weld is unchanged."
    if ! mv "$stage" "$target"; then
      mv "$old" "$target"
      fail "couldn't put the new Weld in place, so the old one was put back."
    fi
    rm -rf "$old"
  else
    mv "$stage" "$target" || fail "couldn't put Weld in $dest."
  fi
  stage=""

  say "Weld is installed: $target"
  [ "${WELD_NO_OPEN:-}" = 1 ] || open "$target"
}

# a sound copy of Weld: its bundle id, and its signature intact
checked() {
  [ -d "$1" ] && [ "$(defaults read "$1/Contents/Info" CFBundleIdentifier 2>/dev/null || true)" = "$BUNDLE_ID" ] && codesign --verify --deep --strict "$1" 2>/dev/null
}

# whether Weld is open (pgrep: 0 found, 1 none, anything else is an error, which is not taken to mean "closed")
running() {
  set +e
  pgrep -xq Weld
  r=$?
  set -e
  [ "$r" -le 1 ] || fail "couldn't tell whether Weld is open. Quit it if it is, then run this again."
  [ "$r" -eq 0 ]
}

main "$@"
