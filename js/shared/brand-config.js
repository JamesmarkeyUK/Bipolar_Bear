/**
 * Per-variant brand configuration.
 *
 * Single source of truth for everything that differs between condition
 * variants of the same skeleton (Bipolar Bear, Anxiety Ant, …): app names,
 * mascot, domains, storage prefix, Firestore collection names, copy.
 *
 * Loaded as a shared helper in every page's <head>, BEFORE
 * firebase-config.js — so a future per-variant Firebase config can read
 * brand state if needed.
 *
 * Phase 1 of the multi-variant refactor: this file is additive. Nothing
 * consumes BB_BRAND yet; later phases sweep call sites to read from it
 * instead of using hardcoded literals.
 *
 * @file js/shared/brand-config.js
 */
window.BB_BRAND = {
  // Slug used by storage prefixes, cache names, and build artefacts.
  id: 'bipolarbear',

  // Human-readable condition label, lowercase ("bipolar", "anxiety").
  condition: 'bipolar',

  // App display names.
  appName: 'BipolarBear',
  appNameAnonymous: 'Bipolar Anonymous',

  // Mascot — used in copy ("the Bear", "Bear hug").
  mascot: 'Bear',

  // Public domains. Edge worker maps hostname → landing page.
  domain: 'bipolarbear.app',
  domainAnonymous: 'bipolaranonymous.app',

  // localStorage key namespace. All app keys live under this prefix.
  storagePrefix: 'bb',

  // Firestore collection names for the anonymous community board.
  // Keep collection names per-variant so a shared Firebase project (if
  // ever adopted) wouldn't collide; for the current per-variant Firebase
  // strategy these names can be the same across variants without conflict.
  collections: {
    posts: 'bbAnonPosts',
    monikas: 'bbAnonMonikas',
    reports: 'bbAnonReports',
  },

  // Marketing/manifest copy.
  description: 'Track your bipolar mood, energy, sleep, and medication daily',
  descriptionAnonymous:
    'An anonymous peer community for people living with bipolar disorder',
};

/**
 * Shared `BB` namespace, also populated by platform.js, debug.js, and
 * onboarding.js. brand-config.js loads first among the four shared
 * helpers, so the assign-or-create idiom is safe in either order.
 */
window.BB = window.BB || {};

/**
 * localStorage wrapper that prefixes every key with BB_BRAND.storagePrefix.
 *
 * Use `BB.storage.get('Xxx')` in JS instead of
 * `localStorage.getItem('bbXxx')` so the same source file works across
 * variants that use different prefixes. Inline `<script>` blocks in HTML
 * (the beta-gate, native-PIN-gate, etc.) still use literal keys because
 * they run before this module loads — those are parameterised at build
 * time per variant, not at runtime.
 *
 * Try/catch matches debug.js: localStorage can throw in iOS Safari
 * private mode. We fail open on read (return null) and silently no-op
 * on write — every caller already handles a missing value.
 */
window.BB.storage = {
  get: function (key) {
    try {
      return localStorage.getItem(window.BB_BRAND.storagePrefix + key);
    } catch (_) {
      return null;
    }
  },
  set: function (key, value) {
    try {
      localStorage.setItem(window.BB_BRAND.storagePrefix + key, value);
    } catch (_) {
      // ignore
    }
  },
  remove: function (key) {
    try {
      localStorage.removeItem(window.BB_BRAND.storagePrefix + key);
    } catch (_) {
      // ignore
    }
  },
};
