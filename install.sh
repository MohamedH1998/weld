#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon (macOS 13 or later):
#
#   s=$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh) && /bin/sh -c "$s"
#
# It downloads the release named below, checks it against the SHA-256 written here and its signature, and puts it in
# Applications (or where Weld already is), then opens it. Run it again to update. It needs no sudo, and the only thing
# on the Mac it ever changes is Weld.app (plus folders of its own, named .weld-install.*, beside it while it works).
#
# Safety, in short:
#   - nothing runs until the whole script has arrived (everything is in main(), called on the last line);
#   - nothing is installed unless its SHA-256 is the one pinned here and its signature is intact;
#   - an update makes and checks the new copy before touching the old one, then swaps them by renaming; if it is cut
#     off, the old copy is put back, and if even that is impossible (power lost) it is kept, and the next run puts it
#     back before doing anything else;
#   - it never deletes or replaces anything at Weld.app that isn't Weld, and deletes only folders it made in this run.

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
  is_sha "$SHA256" || fail "there is no Weld release to install yet."

  tmp="" work="" lock="" old="" target="" swapped=""
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # where it goes: where Weld is (or was, if an update there was cut off), else Applications, else ~/Applications
  if [ -n "${WELD_INSTALL_DIR:-}" ]; then dest="$WELD_INSTALL_DIR"
  elif present "/Applications"; then dest=/Applications
  elif present "$HOME/Applications"; then dest="$HOME/Applications"
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

  # an update cut off hard last time: its old Weld is put back first, before anything is downloaded
  if [ ! -e "$target" ] && [ ! -L "$target" ]; then
    for left in "$dest"/.weld-install.*/Weld.app.previous; do
      ours "$(dirname "$left")" && [ -d "$left" ] && [ ! -L "$left" ] || continue
      checked "$left" || fail "an earlier update left a Weld at $left that doesn't check out, so nothing was changed. Move it to the Trash (or to $target if you trust it), then run this again."
      mv "$left" "$target" || fail "couldn't put back the Weld an earlier update left at $left. Move it to $target yourself, then run this again."
      # (and its folder goes too: the unused new copy in it, if any, only when it is a sound Weld and not a link, then
      # the folder with rmdir, which can only remove an empty folder)
      spare="$(dirname "$left")/Weld.app"
      if [ -d "$spare" ] && [ ! -L "$spare" ] && checked "$spare"; then rm -rf "$spare"; fi
      rmdir "$(dirname "$left")" 2>/dev/null || true
      say "Put back the Weld that an earlier, cut-off update had moved aside."
      break
    done
  fi

  # what is there now must be Weld (never a link, never another app that happens to be called Weld)
  if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] || fail "$target is a link, not an app. Move it aside, then run this again."
    [ "$(bundle_id "$target")" = "$BUNDLE_ID" ] || fail "$target isn't Weld. Move it aside, then run this again."
    # (the same check a cut-off update's backup must pass to be put back, so the old copy can always be recovered)
    checked "$target" || fail "the Weld at $target doesn't check out (its signature is broken), so it wasn't replaced. Move it to the Trash, then run this again."
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

  # the new copy, made and checked beside the old one, in a folder of this run's own (same disk: the swap is renames)
  work=$(mktemp -d "$dest/.weld-install.XXXXXX") || fail "couldn't make a folder in $dest. Your installed Weld is unchanged."
  ditto "$tmp/app/Weld.app" "$work/Weld.app" || fail "couldn't copy Weld into $dest (is the disk full?). Your installed Weld is unchanged."
  checked "$work/Weld.app" || fail "the copy in $dest didn't check out. Your installed Weld is unchanged."

  running && fail "Weld is open. Quit it (⌘Q), then run this again."

  # (looked at again now: something else may have been put at Weld.app while the download ran)
  if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] && checked "$target" || fail "$target changed while Weld was downloading and isn't a sound Weld now, so it wasn't touched."
    # (named before it is moved: whatever happens from here, cleanup knows where the old Weld is)
    old="$work/Weld.app.previous"
    mv "$target" "$old" || { old=""; fail "couldn't move the old Weld aside (macOS may be asking to let your terminal change apps: allow it in System Settings → Privacy & Security → App Management). Your installed Weld is unchanged."; }
    # (what was moved aside must be the Weld checked a moment ago: if not, it goes straight back, untouched)
    if ! checked "$old"; then mv "$old" "$target"; old=""; fail "$target changed during the update, so it was put back as it was."; fi
  fi
  # (mv into a path that is a folder moves inside it: so if anything appeared at Weld.app since, the new copy is taken
  # back out and nothing is left inside it)
  mv "$work/Weld.app" "$target" || fail "couldn't put the new Weld in place."
  if [ -e "$target/Weld.app" ]; then mv "$target/Weld.app" "$work/Weld.app"; fail "something appeared at $target during the update, so it was left as it was."; fi
  swapped=1

  say "Weld is installed: $target"
  [ "${WELD_NO_OPEN:-}" = 1 ] || open "$target"
}

# On the way out, however it ends. If the old Weld was moved aside and the new one never arrived, the old one goes back;
# if it can't, it is kept (and said where) rather than deleted. Only then are this run's own folders removed.
cleanup() {
  keep=""
  if [ -n "$old" ] && [ -z "$swapped" ] && [ -d "$old" ]; then
    if [ ! -e "$target" ] && [ ! -L "$target" ] && mv "$old" "$target" 2>/dev/null; then
      say "The update didn't finish, so your previous Weld was put back."
    else
      keep=1
      say "weld: the update didn't finish, and your previous Weld couldn't be put back. It is safe at: $old" >&2
      say "      Move it to $target yourself, or run this script again." >&2
    fi
  fi
  [ -z "$work" ] || [ -n "$keep" ] || rm -rf "$work"
  [ -z "$tmp" ] || rm -rf "$tmp"
  [ -z "$lock" ] || rm -f "$lock"
}

# whether Weld is (or was, mid-update) in a folder
present() {
  [ -e "$1/Weld.app" ] && return 0
  for left in "$1"/.weld-install.*/Weld.app.previous; do ours "$(dirname "$left")" && [ -d "$left" ] && return 0; done
  return 1
}

# a folder this script could have made for this account: a real folder (not a link), owned by it, and private to it
ours() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -O "$1" ] && [ "$(stat -f '%Lp' "$1")" = 700 ]
}

bundle_id() { defaults read "$1/Contents/Info" CFBundleIdentifier 2>/dev/null || true; }

# a sound copy of Weld: its bundle id, and its signature intact
checked() {
  [ -d "$1" ] && [ "$(bundle_id "$1")" = "$BUNDLE_ID" ] && codesign --verify --deep --strict "$1" 2>/dev/null
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
