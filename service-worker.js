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
const CACHE_NAME = 'bipolarbear-v11';

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
  './js/shared/firebase-config.js',
  './js/shared/onboarding.js',

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
