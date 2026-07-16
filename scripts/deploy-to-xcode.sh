#!/usr/bin/env bash
#
# deploy-to-xcode.sh — sync the web build into the native Capacitor projects
# and (optionally) open Xcode / Android Studio.
#
#   ./scripts/deploy-to-xcode.sh bear          # main app  → cap copy → open iOS
#   ./scripts/deploy-to-xcode.sh anon          # anon app  → build + cap copy → open iOS
#   ./scripts/deploy-to-xcode.sh both          # both apps, open iOS for each
#
# Flags:
#   --android     open Android Studio instead of Xcode
#   --no-open     sync only, don't open any IDE
#   --pull        run `git pull --ff-only` in the repo first
#
# Notes:
#   * Uses `npx cap copy` (assets only), NOT `cap sync`. `cap sync` errors on the
#     main app (real Xcode project is BipolarBear.xcodeproj, not App.xcodeproj) and
#     is only needed when NATIVE PLUGINS change — for a plain JS/CSS update, copy is
#     enough. If you changed plugins, run `npx cap sync` in the native dir by hand.
#   * Native projects live under ~/Github/James/Bipolar_Bear_Mobile/.
#
set -euo pipefail

# Repo root = parent of this script's dir, resolved absolutely.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE_BASE="$HOME/Github/James/Bipolar_Bear_Mobile"
BEAR_NATIVE="$NATIVE_BASE/bipolarbear-native"
ANON_NATIVE="$NATIVE_BASE/bipolaranonymous-native"

TARGET="${1:-}"
OPEN_IDE="ios"
DO_OPEN=1
DO_PULL=0

# Parse remaining flags (skip $1, the target).
shift || true
for arg in "$@"; do
  case "$arg" in
    --android)  OPEN_IDE="android" ;;
    --no-open)  DO_OPEN=0 ;;
    --pull)     DO_PULL=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$TARGET" != "bear" && "$TARGET" != "anon" && "$TARGET" != "both" ]]; then
  echo "Usage: $0 {bear|anon|both} [--android] [--no-open] [--pull]" >&2
  exit 2
fi

if [[ "$DO_PULL" == "1" ]]; then
  echo "==> git pull --ff-only"
  git -C "$REPO_ROOT" pull --ff-only || echo "   (pull skipped/failed — continuing with local tree)"
fi

open_ide() {
  local native_dir="$1"
  [[ "$DO_OPEN" == "0" ]] && return 0
  echo "==> npx cap open $OPEN_IDE"
  ( cd "$native_dir" && npx cap open "$OPEN_IDE" )
}

deploy_bear() {
  echo "=================================================="
  echo " BipolarBear (com.bipolarbear.app)"
  echo "=================================================="
  echo "==> rsync repo → $BEAR_NATIVE/www/"
  rsync -av --delete \
    --exclude='.git' --exclude='.claude' --exclude='.github' --exclude='.DS_Store' \
    --exclude='www-anonymous' --exclude='scripts' --exclude='functions' \
    --exclude='store-assets' --exclude='.wrangler' --exclude='*.md' \
    "$REPO_ROOT/" "$BEAR_NATIVE/www/" | tail -3
  echo "==> npx cap copy"
  ( cd "$BEAR_NATIVE" && npx cap copy )
  open_ide "$BEAR_NATIVE"
}

deploy_anon() {
  echo "=================================================="
  echo " Bipolar Anonymous (com.bipolaranonymous.app)"
  echo "=================================================="
  echo "==> node scripts/build-anonymous.js"
  ( cd "$REPO_ROOT" && node scripts/build-anonymous.js )
  echo "==> rsync www-anonymous → $ANON_NATIVE/www/"
  rsync -av --delete "$REPO_ROOT/www-anonymous/" "$ANON_NATIVE/www/" | tail -3
  echo "==> npx cap copy"
  ( cd "$ANON_NATIVE" && npx cap copy )
  open_ide "$ANON_NATIVE"
}

case "$TARGET" in
  bear) deploy_bear ;;
  anon) deploy_anon ;;
  both) deploy_bear; deploy_anon ;;
esac

echo
echo "Done. Build & run from the IDE (⌘R in Xcode)."
