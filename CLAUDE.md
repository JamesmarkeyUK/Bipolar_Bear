# BipolarBear — Notes for Claude (and other AI assistants)

Static site + Capacitor wrapper. Mood-tracking app (orange theme) plus an
anonymous peer-community board (yellow theme). No build system, no bundler —
files served as-is by Cloudflare Pages and bundled into the iOS/Android
shells by Capacitor.

For deep technical reference (encryption design, scoring algorithms, Firestore
rules, function deploys) see `DOCS.md`. This file is the cheat-sheet for
making safe edits.

## Pages

```
index.html         Home, navigation, FAB dock, streak badges
journal.html       Mood entries (E2E encrypted), stats, focused mode, PDF export
survival-kit.html  Coping resources, goals, medications, memories
anonymous.html     Anonymous community board (yellow theme)
beta.html          Web access gate (Capacitor bypasses)
privacy.html       Static
```

## Source layout

Each page is a thin HTML shell that pulls in one stylesheet and one script:

- `css/<page>.css`
- `js/<page>.js`

Plus four shared modules loaded in `<head>` of every page:

- `js/shared/platform.js`        — `isNative() / isIOS() / isAndroid()` and `window.BB.platform.*`
- `js/shared/debug.js`           — `BB.log()` gated by `localStorage.bbDebug`
- `js/shared/firebase-config.js` — `window.BB_FIREBASE_CONFIG`
- `js/shared/onboarding.js`      — `BB.onboarding.getStep()` and `resolvePointerPosition()` (index + journal only)

`fab.js` is a self-contained IIFE that injects the floating action bar dock
plus the auth/account modals. Loaded on `index`, `journal`, `survival-kit`
(NOT `anonymous` — that page has its own yellow-themed UI).

## Things that must stay inline in HTML — do not extract

- The `<style>body{background:...}</style>` one-liner — paint-blocking critical CSS
- The beta-gate `<script>` — must redirect before any render
- The native-PIN-gate one-liner (where present) — same reason
- `window.Capacitor = window.Capacitor || null` shim (journal only)
- The "Isolated safety net" 8s timeout in journal.html — must survive errors in the main script body
- The pre-activation IIFE in anonymous.html — picks the initial screen synchronously before Firebase auth resolves

## Loading order

In every page's HTML, scripts must appear in this order:

1. Shared helpers (`js/shared/*`) — synchronous in `<head>`
2. Inline critical scripts (above)
3. Firebase compat SDKs (`<script src=https://gstatic...>`) — `defer` on journal.html
4. `js/<page>.js` — comes AFTER the Firebase SDKs
5. `fab.js` — last

If you put `js/<page>.js` before the Firebase SDKs, init code will see
`firebase` as undefined. Most pages handle this defensively but don't rely
on the catch.

## Native build flow

```bash
# In the repo (working copy):
git pull

# Sync to the Capacitor project:
rsync -av --delete \
  --exclude='.git' --exclude='.claude' --exclude='.DS_Store' \
  ./ ~/bipolarbear-native/www/

# Then open native IDE:
cd ~/bipolarbear-native && npx cap sync
npx cap open ios       # or: npx cap open android
```

## Firestore collections

```
entries/{auto}              E2E encrypted. Plaintext fields: userId, timestamp.
userSettings/{uid}          Settings + nested anonProfile + currentStreak/stableStreak/fabState
personalDetails/{uid}       PDF-export contact details
counters/{...}              appCosts, peopleHelped, peopleHelpedApp, helpedCount
bbAnonPosts/{auto}          Community posts (plaintext)
bbAnonMonikas/{lowercase}   Monika reservation (uniqueness)
anonProfiles/{sha256email}  Cross-device anon profile lookup (standalone path)
betaSignups/{auto}          Beta access requests
feedback/{auto}             In-app feedback submissions
```

Cloud Functions region: `europe-west1`.

## localStorage key categories

| Prefix             | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `bb*`              | Main app state (FAB, onboarding, hints, streaks)         |
| `bbAnon_*`         | Anonymous board state                                    |
| `entry:<ts>`       | Cached journal entry (per-entry)                         |
| `trackCustom_*`    | Custom tracking field toggles                            |
| `_labelOverride_*` | User-renamed UI labels                                   |

Settings that live in BOTH localStorage AND `userSettings/{uid}`:

`moodLinkingEnabled, showMoodSuggestion, healthSyncEnabled,
focusedModeEnabled, incognitoMode, achievementToastsEnabled, reminderEnabled,
reminderTime, weeklySummaryEnabled, customiseFormEnabled, disabledSteps,
currentStreak, stableStreak, fabState`

## When adding a new feature

If it adds a localStorage key, also consider updating:

- `logout()` in `js/journal.js` — clear-list (only if the value shouldn't survive logout)
- `deleteAllEntries()` in `js/journal.js` — clear-list (for full reset / account delete)
- `userSettings` write+read in the journal auth listener — if it should sync cross-device
- The home-screen auth listener in `js/index.js` — if it affects the home screen

If it adds a CSS or JS file:

- Add it to `STATIC_ASSETS` in `service-worker.js`
- Bump `CACHE_NAME` (`bipolarbear-vN`) so existing clients drop their stale cache

## Gotchas (from real bugs we fixed)

- **`let db` does not attach to `window`.** If you declare module state with
  `let`/`const` in an inline `<script>` block, other `<script>` tags (and
  fab.js) cannot see it via `window.db`. Use `var` OR explicitly mirror with
  `window.db = db;`. Same for `currentUser` and `auth`. Already done in
  `index.html` and `journal.html` — preserve it.

- **innerHTML + user-supplied data → escape it.** Each page has a helper:

  | File                     | Helper       |
  |--------------------------|--------------|
  | `js/index.js`            | `_escHtml()` |
  | `js/anonymous.js`        | `esc()`      |
  | `js/survival-kit.js`     | `_esc()`     |
  | `js/journal.js`          | `_esc()`     |

  Use them when splicing localStorage / Firestore strings into innerHTML.

- **Firebase Auth requires recent re-login** for `user.delete()` and
  `user.updateEmail()`. Always re-authenticate (prompt for password and call
  `reauthenticateWithCredential`) BEFORE these operations, so a wrong password
  aborts cleanly without leaving the user in a half-deleted state.

- **Firestore writes need `window.currentUser`** to be defined. Many toggle
  handlers gate writes on `if (window.db && window.currentUser)`. If
  `currentUser` isn't mirrored to window, writes silently no-op.

- **Encrypted entries**: only `userId` and `timestamp` are plaintext on
  Firestore. Everything else (mood, energy, sleep, notes…) is in an
  encrypted blob. To read entry dates without decryption — for example to
  recompute streaks from the home page — use the plaintext `timestamp`
  (JS millisecond Unix timestamp).

- **Service worker cache name** must be bumped (`bipolarbear-vN`) on every
  release that changes precached assets, otherwise users see stale files.

- **Widget CFBundleVersion** must match the main app's `CFBundleVersion`.
  Bump both together — App Store Connect rejects mismatches.

- **Cloudflare Pages auto-deploys** on every push to `main`. There is no
  staging — `main` IS production for the web build. iOS/Android builds are
  manual through Xcode / Android Studio.

- **Two Capacitor configs** ship two distinct apps:

  | Config                              | App ID                       | Manifest                  |
  |-------------------------------------|------------------------------|---------------------------|
  | `capacitor.config.json`             | `com.bipolarbear.app`        | `manifest.json`           |
  | `capacitor-anonymous.config.json`   | `com.bipolaranonymous.app`   | `manifest-anonymous.json` |

- **`worker.js` (Cloudflare Worker, edge) ≠ `service-worker.js` (browser).**
  Don't confuse them. `worker.js` routes hostnames at the edge;
  `service-worker.js` caches assets in the browser.

## iPhone-frame markup

Every page wraps content in `#iphone-frame > #app-shell > #scroll-view`.
Below `520px` the frame styles are no-ops (mobile + Capacitor). At `≥520px`
the frame renders as a desktop iPhone 15 Pro mockup. At `≥920px` it scales
up to an iPad-sized frame.

If you add a fixed-position element: position it relative to `#app-shell`
on `≥920px` (the shell creates a containing block via `transform:
translateZ(0)`), and to the viewport otherwise. See `_applyFabDock()` in
`fab.js` for the canonical pattern.

## Testing checklist after a major change

- [ ] Web local: `python3 -m http.server 8765` from repo root, then hard-refresh in browser
- [ ] iPhone: rsync → `npx cap sync` → Xcode build
- [ ] Android: rsync → `npx cap sync` → Android Studio build
- [ ] If `service-worker.js` `CACHE_NAME` bumped, hard-refresh on every device once
- [ ] If a Firestore-synced setting changed, test signed-out (guest) AND signed-in paths

## What `claude-code` should default to doing

- Branch off `main` for any non-trivial change. Don't commit directly to `main`.
- Push at meaningful checkpoints (per phase, per logical change) — not just at the end.
- Don't skip git pre-commit hooks. If a hook fails, fix the cause; don't `--no-verify`.
- Don't create PRs unless asked. Direct merge / fast-forward is fine for solo work.
- For big refactors, do one commit per phase so individual phases stay revertable.
