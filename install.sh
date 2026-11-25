#!/bin/sh
# Installs Weld, the infinite canvas harness for coding agents, on a Mac with Apple silicon (macOS 13 or later):
#
#   s=$(curl -fsSL https://raw.githubusercontent.com/MohamedH1998/weld/main/install.sh) && /bin/sh -c "$s"
#
# It downloads the release named below, checks it against the SHA-256 written here and its signature, and puts it in
# Applications (or where Weld already is). Run it again to update. It needs no sudo.
#
# Safety, in short:
#   - nothing runs until the whole script has arrived (everything is in main(), called on the last line);
#   - nothing is installed unless its SHA-256 is the one pinned here and its signature is intact;
#   - all its work happens in a private folder of yours (in ~/Library) that no other account can enter; the only thing it
#     ever does in Applications is one rename of Weld.app, done by the system in a single step (renameatx_np):
#     RENAME_SWAP to exchange the old Weld for the new one (so there is never a moment without a Weld), or, for a first
#     install, RENAME_EXCL, which fails rather than touch anything that has appeared there;
#   - it never replaces anything at Weld.app that isn't the sound Weld it found, and it starts nothing itself.

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

  tmp="" lock="" had="" was="" ours_id=""
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

  # this run's own folder, inside a folder of the installer's own in this account's Library: kept (not a temporary
  # folder the system clears), owned by this account and closed to everyone else, with no access rules (ACLs) that
  # would let anyone else in; it must be on the same disk as Applications, so the swap is a single rename
  home_dir="$HOME/Library/Application Support/Weld Installer"
  mkdir -p -m 700 "$home_dir" 2>/dev/null || fail "couldn't make $home_dir."
  private "$home_dir" || fail "$home_dir isn't private to this account, so the installer won't work in it."
  # (anything an earlier run had to keep is said, and left for the person)
  for left in "$home_dir"/weld-install.*; do
    [ -e "$left" ] && say "weld: an earlier install kept something at $left. Look inside before deleting it." >&2
  done
  tmp=$(mktemp -d "$home_dir/weld-install.XXXXXX")
  private "$tmp" || fail "couldn't make a private folder in $home_dir."
  [ "$(stat -f %d "$tmp")" = "$(stat -f %d "$dest")" ] || fail "$dest isn't on the same disk as this account's temporary folder, which the installer needs to swap Weld in safely."

  # one install at a time into this folder (mkdir: only one run can make it; if it is there, this run stops)
  mkdir "$dest/.weld-install.lock" 2>/dev/null || fail "another Weld install is running into $dest. Wait for it to finish; if none is (an earlier one was force-quit), remove the folder $dest/.weld-install.lock and run this again."
  lock="$dest/.weld-install.lock"

  # what is there must be a sound Weld (never a link, never another app that happens to be called Weld); its identity
  # on disk is taken first, so only this very folder, still sound, is ever swapped out
  if occupied "$target"; then
    was=$(identity "$target")
    [ "$was" != none ] && checked "$target" && [ "$(identity "$target")" = "$was" ] || fail "$target isn't a sound copy of Weld, so it wasn't touched. Move it to the Trash, then run this again."
    had=1
  fi

  # the download, checked against the SHA-256 pinned above before it is even opened, then unpacked and checked
  from="${WELD_DOWNLOAD:-https://github.com/$REPO/releases/download/v$VERSION}"
  say "Installing Weld ${VERSION}…"
  curl -fL --progress-bar "$from/Weld-$VERSION-arm64.zip" -o "$tmp/Weld.zip" || fail "couldn't download Weld."
  got=$(sha_of "$tmp/Weld.zip") || fail "couldn't check the download, so nothing was installed."
  [ "$got" = "$SHA256" ] || fail "the download isn't the Weld $VERSION this script expects (its checksum differs), so nothing was installed."
  ditto -x -k "$tmp/Weld.zip" "$tmp/new"
  new="$tmp/new/Weld.app"
  checked "$new" || fail "the download isn't a sound copy of Weld, so nothing was installed."
  ours_id=$(identity "$new")

  running && fail "Weld is open. Quit it (⌘Q), then run this again."

  if [ -n "$had" ]; then
    # one step: Weld.app becomes the new copy, and the old one comes to this run's private folder
    swap "$new" "$target" || fail "couldn't swap in the new Weld (macOS may be asking to let your terminal change apps: allow it in System Settings → Privacy & Security → App Management). Your installed Weld is unchanged."
    # (what came out must be the very Weld found before, still sound: if anything else had been put there meanwhile,
    # it goes straight back, in one step again)
    if [ "$(identity "$new")" != "$was" ] || ! checked "$new"; then
      swap "$new" "$target" || fail "$target changed during the update and couldn't be swapped back. What was there is at $new; move it back yourself."
      fail "$target changed during the update, so it was put back as it was."
    fi
  else
    # a first install: only into an empty place (it fails, touching nothing, if anything has appeared there)
    place "$new" "$target" || fail "something appeared at $target during the install, so it was left as it was."
  fi

  # (not opened from here: only what was checked is ever started by this script, and it starts nothing)
  say "Weld is installed in $dest. Open it from there (or Spotlight: Weld)."
}

# On the way out, however it ends: this run's private folder goes (it holds only the download, the new copy, or the
# old Weld swapped out), except when an update was refused after something unknown came out of Applications: then it is
# kept, and said where. The lock is let go.
cleanup() {
  if [ -n "$tmp" ] && [ -d "$tmp" ]; then
    if occupied "$tmp/new/Weld.app" && ! known "$tmp/new/Weld.app"; then
      say "weld: kept $tmp, which holds something that came out of $dest unexpectedly. Look inside before deleting it (the next run will remind you)." >&2
    else
      rm -rf "$tmp"
    fi
  fi
  [ -z "$lock" ] || rmdir "$lock" 2>/dev/null || true
}

# a folder only this account can use: a real folder (not a link), owned by it, mode 700, and with no ACL entries
private() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -O "$1" ] && [ "$(stat -f '%Lp' "$1")" = 700 ] && [ -z "$(ls -led "$1" | sed 1d)" ]
}

# whether something in this run's folder is known: this run's own new copy or the very Weld found at the start (by
# identity), and still a sound Weld (checked: either may have spent a moment in Applications); a failed lookup is unknown
known() {
  id=$(identity "$1")
  [ "$id" != none ] || return 1
  { [ "$id" = "$ours_id" ] || { [ -n "$was" ] && [ "$id" = "$was" ]; }; } && checked "$1"
}

# a path's identity on disk (device and inode: the same folder keeps it when renamed or swapped)
identity() { stat -f '%d:%i' "$1" 2>/dev/null || echo none; }

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
