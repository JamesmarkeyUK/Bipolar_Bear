/**
 * BipolarBear PWA service worker.
 *
 * Strategy: network-first with a cache fallback. Successful GETs are cached as
 * we see them so the app keeps working when the device drops offline. We
 * bypass Google/Firebase/CDN traffic entirely — Firestore handles its own
 * offline persistence and we don't want to fight it.
 *
 * Bump CACHE_NAME whenever a precached asset changes; old caches are deleted
 * on activate. Currently registered from journal.html and survival-kit.html
 * (see `navigator.serviceWorker.register('/service-worker.js')` in those
 * files); the other pages still benefit because the cache is shared per-origin.
 *
 * @file service-worker.js
 */

// Bump this string to invalidate every client's cache. Format: <slug>-vN.
// v4: per-page CSS/JS were extracted to css/* and js/* in Phase 4 of the
//     2026-Q2 refactor — every old client must drop its v3 cache.
// v5: fix journal.js boot crash (setDefaultDate ran before #entryDate existed,
//     leaving logoCurrentIndex in TDZ → broke delete-all + easter egg).
// v6: move <script src="js/journal.js"> to end of <body> in journal.html so
//     all DOM nodes the script touches at top-level exist when it runs.
// v7: anonymous.html + js/anonymous.js — add Sign Out button for standalone
//     (email-code) users in the Monika settings overlay.
// v8: css/anonymous.css + js/anonymous.js — make Monika settings sheet
//     scrollable, hide duplicate "Discover BipolarBear" link on anon domain.
// v9: js/anonymous.js — hide Stability Counter on Monika sheet for
//     standalone (anon-direct) users; BB-app users only.
// v10: beta.html / css / js — remove WhatsApp group link.
// v11: js/anonymous.js — fix duplicate chat messages (initBoard handler
//     wiring is now one-time; Post button has an in-flight guard).
// v12: js/anonymous.js — _bbRestoreProfile falls back to
//     anonProfiles/{hash(email)} when userSettings has no anonProfile, so
//     a BB account whose email was already used standalone reuses the
//     existing monika instead of prompting for a new one.
// v13: add js/shared/brand-config.js + css/theme.css scaffolding (Phase 1
//     of the multi-variant refactor). Additive only — nothing consumes
//     them yet, but they are linked from every HTML page so must be in
//     the offline cache.
// v14: Phase 2 of the multi-variant refactor — sweep brand-coloured hex
//     literals in css/{index,journal,survival-kit,anonymous,beta}.css
//     onto the var(--brand-*) tokens defined in theme.css. Visually
//     identical, but every CSS-precached file changed so v13 caches
//     would still serve the old palette.
// v15: extend the same sweep to inline style="..." attributes in the
//     five page HTML files. Paint-blocking <style>body{...}</style>
//     blocks and <meta theme-color> values intentionally still use hex
//     literals (one can't see :root tokens at parse time, the other
//     isn't CSS).
// v16: complete the Phase 2 sweep across js/{index,journal,survival-kit,
//     anonymous}.js and fab.js. Brand hex literals in template-literal
//     style="..." strings, .style.X assignments, Object.assign({style,
//     background, color}), and confetti/toast colour arrays now resolve
//     via var(--brand-*). All five files still parse via `node --check`.
// v17: Phase 3a of the multi-variant refactor — add BB.storage helper to
//     brand-config.js and sweep the 19 'bbAnon{Posts,Monikas,Reports}'
//     Firestore collection literals onto BB_BRAND.collections.*. Runtime
//     behaviour identical (the resolved values match the old literals).
// v18: Phase 3b — sweep ~390 localStorage call sites across js/shared/{
//     debug,onboarding}.js, js/{index,journal,survival-kit,anonymous,
//     beta}.js, fab.js onto BB.storage. brand-config.js moved to first
//     in the shared-helpers script load so debug.js + onboarding.js can
//     read through BB.storage. sessionStorage and a small set of
//     mixed/dual-use array literals intentionally still use raw
//     localStorage (documented in commit notes); they don't block the
//     multi-variant goal because they don't hardcode the prefix
//     anywhere a future variant would need to override.
// v19: move _nukeGuestData / _confirmDeleteGuestData from js/index.js to
//     fab.js so the "🗑 Delete all guest data" button in the shared auth
//     modal works on /journal and /survival-kit too (was a silent no-op
//     because window._confirmDeleteGuestData was only defined on /).
// v21: brand-config.js gains BB_BRAND.bundle + BB.isAnonymousApp() so the
//     standalone Bipolar Anonymous app can detect itself when running
//     natively (where location.hostname is 'localhost' and the existing
//     domain check missed). js/anonymous.js sweeps onto the helper. The
//     precached brand-config.js content changed, so old clients must
//     drop their v20 cache.
// v23: js/anonymous.js — hide the "0" comment count on posts with no
//     comments yet (only the 💬 emoji shows; count appears once > 0).
// v24: v1.0 — fix stale signed-out home stats and the signed-in journal
//     redirect loop on native; show app version in the profile FAB popup
//     (window._APP_VERSION = '1.0'). Touches js/index.js, fab.js,
//     js/shared/brand-config.js, journal.html, survival-kit.html — every
//     old client must drop v23.
// v25: anonymous.html / css / js — surface app version (window._APP_VERSION)
//     in the About overlay footer, and drop the 52px top-padding floor on
//     .board-header so mobile Safari (where env(safe-area-inset-top) is 0)
//     no longer renders an empty yellow spacer above the board header. The
//     Capacitor shell + PWA standalone still get the inset because the rule
//     is now calc(16px + env(safe-area-inset-top)).
// v26: js/anonymous.js — stack the ADMIN chip on its own line beneath the
//     monika in the board header pill so the streak + birthday badges no
//     longer overflow off the right edge of the bar for admin accounts.
// v27: v1.1 — pull BipolarBear stability streak and account creation date
//     into the Anonymous board when signing in with a linked BB email.
// v28: js/index.js — unlock the settings/auth FAB the moment the onboarding
//     tutorial reaches step 12, instead of waiting for the user to dismiss
//     the "Tutorial Complete!" popup.
// v29: v1.2 — settings/auth FAB unlocks after first journal entry (not tutorial completion).
// v30: v1.2 — wire mood-form heading and view-entry label through i18n (was hardcoded English).
// v31: v1.2 — translate focused-mode wizard step titles, date phrases, and tracking field labels.
// v32: v1.2 — translate submit buttons, save-confirm modal, edit button states, draft status.
// v33: v1.2 — translate calendar entry rows and delete-field-confirm modal.
// v34: v1.2 — translate mood-info modal labels, Bipolar UK toggle, and mood-linking buttons.
// v35: v1.2 — translate missing-entries banner (with pluralization), calendar empty state, focused-mode preview chips.
// v36: v1.2 — fix syntax error in index.js (smart quotes in _WHATS_NEW_HEADLINES broke home page: hint, logo tap, profile button, anon link, survival kit nav).
// v37: security — escape Firestore-sourced gradient/streak/icon fields in anonymous-board renderers; 6-digit code boxes.
// v38: v1.3 — version bump for the security release; refresh precached brand-config.js (_APP_VERSION='1.3') and js/index.js (new _WHATS_NEW_HEADLINES entry).
const CACHE_NAME = 'bipolarbear-v38';

/**
 * Files that should be available offline. Each entry is precached on `install`.
 * Keep entries to ones we always want offline; per-request caching below
 * picks up everything else as the user navigates.
 */
const STATIC_ASSETS = [
  './index.html',
  './journal.html',
  './survival-kit.html',
  './anonymous.html',
  './beta.html',
  './privacy.html',

  // FAB dock + page-specific JS (extracted from inline scripts in Phase 4).
  './fab.js',
  './js/index.js',
  './js/journal.js',
  './js/survival-kit.js',
  './js/anonymous.js',
  './js/beta.js',

  // Shared modules — small, loaded by every page.
  './js/shared/platform.js',
  './js/shared/debug.js',
  './js/shared/brand-config.js',
  './js/shared/firebase-config.js',
  './js/shared/onboarding.js',

  // Shared theme tokens (loaded before page-specific CSS).
  './css/theme.css',

  // Page-specific stylesheets (extracted from inline <style> in Phase 4).
  './css/index.css',
  './css/journal.css',
  './css/survival-kit.css',
  './css/anonymous.css',
  './css/beta.css',

  // Manifests. Icons are deliberately not precached — they're served from
  // /icons/favicons/ (referenced in <link rel="icon">) and the browser's
  // own image cache handles them adequately.
  './manifest.json',
  './manifest-anonymous.json',
];

/**
 * Hostnames whose responses we deliberately bypass. Firebase and Google CDNs
 * have their own caching and offline behaviour — caching them here would
 * stale-pin SDK builds.
 */
const BYPASS_HOSTS = ['googleapis.com', 'firebase', 'gstatic.com'];

self.addEventListener('install', (event) => {
  // Take over as soon as installation finishes — we don't need the old SW
  // to keep serving while the new one warms up.
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      // Best-effort: a missing file shouldn't block install.
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  // Drop every cache that isn't ours, then claim open clients so the new SW
  // controls them without a reload.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Service workers only see GETs in practice, but be defensive.
  if (req.method !== 'GET') return;

  // Don't intercept Firebase / Google traffic — let it go straight to network.
  const url = req.url;
  if (BYPASS_HOSTS.some((h) => url.includes(h))) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Cache successful responses for next time.
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() =>
        // Network failed: serve from cache. For top-level navigations,
        // fall back to index.html so the app shell renders rather than a
        // bare offline error.
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        })
      )
  );
});

self.addEventListener('message', (event) => {
  // Lets a page force-activate a waiting service worker:
  //   navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
