#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon (macOS 13 or later):
#
#   s=$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh) && /bin/sh -c "$s"
#
# It downloads the release named below, checks it against the checksum written here and its signature, and puts it in
# Applications (or where Weld already is), then opens it. Run it again to update. It needs no sudo and changes
# nothing else on the Mac. An update never leaves you without a working Weld: the new copy is made and checked beside
# the old one, and only then swapped in.
#
# Everything is inside main(), called on the last line, so a script cut off while downloading runs nothing at all.

set -eu

REPO="MohamedH1998/weld"
BUNDLE_ID="app.weld.mac"
# The release this script installs, and the SHA-256 of its zip: set here at each release (scripts/pin-release.sh), so
# what is installed is checked against this file, not only against a list that came with the download.
VERSION="0.0.0"
SHA256="unreleased"

say() { printf '%s\n' "$*"; }
fail() { say "weld: $*" >&2; exit 1; }

main() {
  [ "$(uname -s)" = Darwin ] || fail "Weld is a Mac app."
  # (Apple silicon even from a terminal running under Rosetta, which says x86_64)
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "Weld needs a Mac with Apple silicon."
  major=$(sw_vers -productVersion | cut -d. -f1)
  [ "$major" -ge 13 ] || fail "Weld needs macOS 13 or later."

  tmp=$(mktemp -d)
  work="" lock="" old="" target=""
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [ "$SHA256" != unreleased ] || [ -n "${WELD_DOWNLOAD:-}" ] || fail "there is no Weld release to install yet."
  from="${WELD_DOWNLOAD:-https://github.com/$REPO/releases/download/v$VERSION}"
  want="${WELD_SHA256:-$SHA256}"
  say "Installing Weld ${VERSION}…"
  curl -fL --progress-bar "$from/Weld-$VERSION-arm64.zip" -o "$tmp/Weld.zip" || fail "couldn't download Weld."
  got=$(shasum -a 256 "$tmp/Weld.zip" | awk '{ print $1 }')
  [ "$want" = "$got" ] || fail "the download isn't the Weld $VERSION this script expects (its checksum differs), so nothing was installed."

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

  # one install at a time into this folder, held until everything here is tidied away
  # (shlock writes this run's pid, and takes over a lock whose run is no longer alive)
  shlock -f "$dest/.weld-install.lock" -p $$ || fail "another Weld install is running into $dest. Wait for it to finish."
  lock="$dest/.weld-install.lock"

  # an update cut off at the worst moment last time (the power went, say): its old Weld is put back first
  if [ ! -e "$target" ]; then
    for left in "$dest"/.weld-install.*/Weld.app.previous; do
      [ -d "$left" ] && checked "$left" && mv "$left" "$target" && say "Put back the Weld a cut-off update had moved aside." && break
    done
  fi

  # what is there now must be Weld (never a link, never another app that happens to be called Weld)
  if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] || fail "$target is a link, not an app. Move it aside, then run this again."
    [ "$(defaults read "$target/Contents/Info" CFBundleIdentifier 2>/dev/null || true)" = "$BUNDLE_ID" ] || fail "$target isn't Weld. Move it aside, then run this again."
  fi

  # the new copy, made and checked beside the old one, in a folder of this run's own (same disk: the swap is renames)
  work=$(mktemp -d "$dest/.weld-install.XXXXXX") || fail "couldn't make a folder in $dest. Your installed Weld is unchanged."
  ditto "$tmp/app/Weld.app" "$work/Weld.app" || fail "couldn't copy Weld into $dest (is the disk full?). Your installed Weld is unchanged."
  checked "$work/Weld.app" || fail "the copy in $dest didn't check out. Your installed Weld is unchanged."

  running && fail "Weld is open. Quit it (⌘Q), then run this again."

  if [ -e "$target" ]; then
    # (between these two renames, an interruption puts the old one back: see cleanup)
    mv "$target" "$work/Weld.app.previous" || fail "couldn't move the old Weld aside (macOS may be asking to let your terminal change apps: allow it in System Settings → Privacy & Security → App Management). Your installed Weld is unchanged."
    old="$work/Weld.app.previous"
    mv "$work/Weld.app" "$target" || fail "couldn't put the new Weld in place, so the old one was put back."
    old=""
  else
    mv "$work/Weld.app" "$target" || fail "couldn't put Weld in $dest."
  fi

  say "Weld is installed: $target"
  [ "${WELD_NO_OPEN:-}" = 1 ] || open "$target"
}

# On the way out, however it ends: the old Weld put back if it was moved aside and the new one never arrived; then this
# run's own folders (and only those) removed, and the lock let go.
cleanup() {
  if [ -n "$old" ] && [ -d "$old" ] && [ ! -e "$target" ]; then mv "$old" "$target" 2>/dev/null || true; fi
  [ -z "$work" ] || rm -rf "$work"
  rm -rf "$tmp"
  [ -z "$lock" ] || rm -f "$lock"
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
