#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon (macOS 13 or later):
#
#   s=$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh) && /bin/sh -c "$s"
#
# It downloads the release named below, checks it against the SHA-256 written here and its signature, and puts it in
# Applications (or where Weld already is), then opens it. Run it again to update. It needs no sudo, and the only thing
# on the Mac it ever changes is Weld.app (plus a folder of its own, named .weld-install.*, beside it while it works).
#
# Safety, in short:
#   - nothing runs until the whole script has arrived (everything is in main(), called on the last line);
#   - nothing is installed unless its SHA-256 is the one pinned here and its signature is intact;
#   - the new copy is made and checked beside the old one, then the two are exchanged in one step by the system
#     (renameatx_np with RENAME_SWAP), so there is never a moment without a Weld; a first install uses RENAME_EXCL,
#     which fails rather than touch anything that has appeared at Weld.app;
#   - it never replaces anything at Weld.app that isn't a sound Weld, and deletes only a sound copy of Weld it made.

set -eu

REPO="MohamedH1998/weld"
BUNDLE_ID="app.weld.mac"
# The release this script installs, and the SHA-256 of its zip: written here at each release by scripts/pin-release.sh.
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
  [ -x /usr/bin/perl ] || fail "this Mac has no /usr/bin/perl (part of macOS), which the installer uses to swap apps safely."
  is_sha "$SHA256" || fail "there is no Weld release to install yet."

  tmp="" work="" lock="" swapped=""
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # where it goes: where Weld already is, else Applications, else ~/Applications
  if [ -n "${WELD_INSTALL_DIR:-}" ]; then dest="$WELD_INSTALL_DIR"
  elif [ -e /Applications/Weld.app ]; then dest=/Applications
  elif [ -e "$HOME/Applications/Weld.app" ]; then dest="$HOME/Applications"
  elif [ -w /Applications ]; then dest=/Applications
  else dest="$HOME/Applications"
  fi
  if [ "$dest" = /Applications ] && [ ! -w /Applications ]; then
    fail "Weld is in /Applications, which this account can't change. Update it from an administrator account."
  fi
  mkdir -p "$dest"
  target="$dest/Weld.app"

  # one install at a time into this folder (shlock writes this run's pid, and takes over a lock whose run has died)
  shlock -f "$dest/.weld-install.lock" -p $$ || fail "another Weld install is running into $dest. Wait for it to finish."
  lock="$dest/.weld-install.lock"

  # what is there must be a sound Weld (never a link, never another app that happens to be called Weld)
  if occupied "$target" && ! checked "$target"; then
    fail "$target isn't a sound copy of Weld, so it wasn't touched. Move it to the Trash, then run this again."
  fi

  # the download, checked against the SHA-256 pinned above before it is even opened
  tmp=$(mktemp -d)
  from="${WELD_DOWNLOAD:-https://github.com/$REPO/releases/download/v$VERSION}"
  say "Installing Weld ${VERSION}…"
  curl -fL --progress-bar "$from/Weld-$VERSION-arm64.zip" -o "$tmp/Weld.zip" || fail "couldn't download Weld."
  got=$(sha_of "$tmp/Weld.zip") || fail "couldn't check the download, so nothing was installed."
  [ "$got" = "$SHA256" ] || fail "the download isn't the Weld $VERSION this script expects (its checksum differs), so nothing was installed."
  ditto -x -k "$tmp/Weld.zip" "$tmp/app"
  checked "$tmp/app/Weld.app" || fail "the download isn't a sound copy of Weld, so nothing was installed."

  # the new copy, made and checked beside the old one, in a folder of this run's own (same disk, for the swap)
  work=$(mktemp -d "$dest/.weld-install.XXXXXX") || fail "couldn't make a folder in $dest. Your installed Weld is unchanged."
  ditto "$tmp/app/Weld.app" "$work/Weld.app" || fail "couldn't copy Weld into $dest (is the disk full?). Your installed Weld is unchanged."
  checked "$work/Weld.app" || fail "the copy in $dest didn't check out. Your installed Weld is unchanged."

  running && fail "Weld is open. Quit it (⌘Q), then run this again."

  if occupied "$target"; then
    # one step: Weld.app becomes the new copy, and the old one takes its place in the work folder
    swap "$work/Weld.app" "$target" && swapped=1 || fail "couldn't swap in the new Weld (macOS may be asking to let your terminal change apps: allow it in System Settings → Privacy & Security → App Management). Your installed Weld is unchanged."
    # (what was swapped out must be the Weld checked before: if anything else had been put there meanwhile, it goes
    # straight back, in one step again)
    if ! checked "$work/Weld.app"; then
      swap "$work/Weld.app" "$target" || fail "$target changed during the update and couldn't be swapped back. What was there is at $work/Weld.app."
      fail "$target changed during the update, so it was put back as it was."
    fi
  else
    # a first install: only into an empty place (it fails, touching nothing, if something has appeared there)
    place "$work/Weld.app" "$target" || fail "something appeared at $target during the install, so it was left as it was."
  fi

  say "Weld is installed: $target"
  [ "${WELD_NO_OPEN:-}" = 1 ] || open "$target"
}

# On the way out, however it ends: this run's work folder goes. Before a swap it holds only this run's own copy; after
# one, it goes only if it holds nothing but a sound copy of Weld (the old one swapped out, or the new one swapped back);
# anything else in it is kept, and said where.
cleanup() {
  if [ -n "$work" ] && [ -d "$work" ]; then
    # (before any swap, it holds only this run's own copy, whole or half-made)
    if [ -z "$swapped" ]; then rm -rf "$work"
    elif [ -z "$(ls -A "$work")" ]; then rmdir "$work"
    elif [ "$(ls -A "$work")" = Weld.app ] && checked "$work/Weld.app"; then rm -rf "$work"
    else say "weld: kept $work, which holds something the installer didn't expect. Look inside before deleting it." >&2
    fi
  fi
  [ -z "$tmp" ] || rm -rf "$tmp"
  [ -z "$lock" ] || rm -f "$lock"
}

# whether anything at all is at a path (a link counts, even a broken one)
occupied() { [ -e "$1" ] || [ -L "$1" ]; }

# The system's own rename, through the Perl that ships with macOS: renameatx_np (syscall 488) with RENAME_SWAP (2),
# which exchanges two paths in one step and fails if either is missing, or RENAME_EXCL (4), which fails rather than
# replace anything already at the destination.
renamex() { /usr/bin/perl -e 'my ($f, $t, $fl) = @ARGV; exit(syscall(488, -2, $f, -2, $t, $fl + 0) == 0 ? 0 : 1)' "$1" "$2" "$3"; }
swap() { renamex "$1" "$2" 2; }
place() { renamex "$1" "$2" 4; }

bundle_id() { defaults read "$1/Contents/Info" CFBundleIdentifier 2>/dev/null || true; }

# a sound copy of Weld: a real folder (not a link), its bundle id, and its signature intact
checked() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ "$(bundle_id "$1")" = "$BUNDLE_ID" ] && codesign --verify --deep --strict "$1" 2>/dev/null
}

# a SHA-256 written out: exactly 64 lowercase hex digits
is_sha() {
  case "$1" in *[!0-9a-f]* | "") return 1 ;; esac
  [ "${#1}" -eq 64 ]
}

# a file's SHA-256, or failure (never an empty or partial answer taken for one)
sha_of() {
  out=$(shasum -a 256 "$1") || return 1
  sum=${out%% *}
  is_sha "$sum" || return 1
  printf '%s' "$sum"
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
