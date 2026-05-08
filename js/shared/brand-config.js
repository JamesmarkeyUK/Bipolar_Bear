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
