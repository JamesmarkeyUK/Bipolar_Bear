#!/usr/bin/env bash
#
# bump-version.sh — bump the BipolarBear app version across BOTH repos at once.
#
# Unified scheme: build number N  ->  marketing version "1.N".
# Single command instead of hand-editing the web repo and the native repo
# separately (which is how they drifted apart before).
#
# Usage:   scripts/bump-version.sh <buildNumber>
#   e.g.   scripts/bump-version.sh 13      # -> version 1.13, build 13
#
# Native repo path defaults to ~/bipolarbear-native (per CLAUDE.md). Override:
#          NATIVE_REPO=/path/to/native scripts/bump-version.sh 13
#
# It edits files only — it does NOT commit, push, rsync, or cap-sync. Review the
# printed diffs, then commit in both repos and run the usual release steps
# (rsync www -> npx cap sync -> Xcode / Android Studio build) from CLAUDE.md.
#
set -euo pipefail

BUILD="${1:?Usage: bump-version.sh <buildNumber>   (e.g. 13 -> v1.13 build 13)}"
[[ "$BUILD" =~ ^[0-9]+$ ]] || { echo "error: build number must be an integer, got '$BUILD'"; exit 1; }
VER="1.$BUILD"

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="${NATIVE_REPO:-$HOME/bipolarbear-native}"
[[ -d "$NATIVE" ]] || { echo "error: native repo not found at '$NATIVE' (set NATIVE_REPO=...)"; exit 1; }

PBX="$NATIVE/ios/App/BipolarBear.xcodeproj/project.pbxproj"   # main app + widget, Debug+Release
GRADLE="$NATIVE/android/app/build.gradle"
BRAND="$WEB/js/shared/brand-config.js"
SW="$WEB/service-worker.js"
for f in "$PBX" "$GRADLE" "$BRAND" "$SW"; do
  [[ -f "$f" ]] || { echo "error: expected file missing: $f"; exit 1; }
done

# Edit in place (BSD/macOS sed); abort if the pattern matched nothing, so a
# renamed/moved field surfaces loudly instead of silently no-op'ing.
bump() { # <file> <grep-ere-to-confirm-present> <sed-ere>
  local f="$1" check="$2" expr="$3"
  grep -Eq "$check" "$f" || { echo "error: pattern not found in $f -> /$check/"; exit 1; }
  sed -i '' -E "$expr" "$f"
}

# ── iOS (4 entries each: main app + widget extension, Debug + Release) ──
bump "$PBX"    'MARKETING_VERSION = [0-9.]+;'      "s/(MARKETING_VERSION = )[0-9.]+;/\\1$VER;/g"
bump "$PBX"    'CURRENT_PROJECT_VERSION = [0-9]+;' "s/(CURRENT_PROJECT_VERSION = )[0-9]+;/\\1$BUILD;/g"
# ── Android ──
bump "$GRADLE" 'versionName "[0-9.]+"'             "s/(versionName )\"[0-9.]+\"/\\1\"$VER\"/"
bump "$GRADLE" 'versionCode [0-9]+'                "s/(versionCode )[0-9]+/\\1$BUILD/"
# ── Web: app version shown in UI ──
bump "$BRAND"  "_APP_VERSION = '[0-9.]+'"          "s/(_APP_VERSION = ')[0-9.]+'/\\1$VER'/"
# ── Web: service-worker cache name (independent counter, +1 each release) ──
CUR="$(grep -oE 'bipolarbear-v[0-9]+' "$SW" | head -1 | grep -oE '[0-9]+')"
NEXT=$((CUR + 1))
bump "$SW"     "bipolarbear-v$CUR" "s/bipolarbear-v$CUR/bipolarbear-v$NEXT/g"

echo "Bumped to $VER (build $BUILD).  service-worker cache: bipolarbear-v$CUR -> v$NEXT"
echo
echo "=== Bipolar_Bear (web) — $WEB ==="
git -C "$WEB" --no-pager diff --stat
echo "=== bipolarbear-native — $NATIVE ==="
git -C "$NATIVE" --no-pager diff --stat
echo
echo "Next: add a CACHE_NAME changelog note in service-worker.js, commit BOTH repos,"
echo "then rsync www -> npx cap sync -> build (see Bipolar_Bear/CLAUDE.md)."
