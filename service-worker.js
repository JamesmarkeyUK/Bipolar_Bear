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
// v39: Wiki feature Phase 1 — extract KNOWN_MEDS from survival-kit.js into shared js/shared/medications.js so the anonymous-board Wiki tab (forthcoming) and survival-kit read the same source.
// v40: Wiki feature Phase 2 — add 📖 Wiki tab + hidden wiki-section to anonymous.html; setTab in anonymous.js routes wiki tab (hides post list, hides compose FAB). i18n 'anon.board.wiki' added across 10 locales.
// v41: Wiki feature Phase 3 — populate wiki section with sub-section pills (Medications / Support Groups / Community Wisdom), renderers in anonymous.js, wiki CSS, and precache wiki JSON data.
// v42: Wiki feature Phase 4 — add 🔍 search FAB that toggles an inline search bar in the wiki tab (per-section substring filter); convert wiki strings to i18n keys (English populated, other locales fall back).
// v43: Wiki — add 🧠 Conditions pill with peer-friendly definitions of Bipolar I, Bipolar II, Cyclothymia, and Other Specified Bipolar (NOS). Single disclaimer at top, NHS link per card. i18n keys pillConditions + conditionsDisclaimer added to English.
// v44: Wiki — stack pill chips across two rows on mobile (<520px), and slowly rotate the row that doesn't contain the active pill when its content overflows the screen.
// v45: Wiki — add Rapid Cycling card to the Conditions section (course specifier, not a separate diagnosis).
// v46: Wiki — broaden the Conditions section with Mixed Features, Seasonal Pattern, Major Depressive Disorder, Anxiety Disorders, ADHD, BPD/EUPD, and Schizophrenia & Schizoaffective. Each card has an NHS info link.
// v47: Wiki — add 8 new sections: Therapies, Lifestyle, Warning Signs, Side Effects, Hospital, Workplace, Pregnancy, and Books & Films. New shared _renderWikiSimpleCards helper. i18n keys for pill labels + per-section disclaimers added to English locale.
// v48: Wiki — add For Loved Ones section (partners, family, carers): early signs, what to say, helping during mania / depression, hospital admissions, carer wellbeing, carer rights, and when to call for help.
// v49: Wiki — rebalance pill rows 7/6 (was 6/7). Hospital moves from row 1 to row 0 alongside the rest of the clinical group.
// v50: Wiki — drop the auto-marquee (broken in Firefox; conflicted with manual scroll). Both pill rows are now independently scrollable; CSS mask-image fades the edge that has more content; first wiki open per session triggers a one-time peek nudge so the user sees the rows can be swiped.
// v51: Mobile UX — `touch-action: manipulation` on anonymous/beta/privacy pages kills the 300ms double-tap-zoom delay; tapping a wiki pill now smooth-scrolls the pill to the left edge of its row to reveal more pills.
// v52: v1.4 — version bump for the Wiki release. Refreshes precached brand-config.js (_APP_VERSION='1.4') and js/index.js (new _WHATS_NEW_HEADLINES['1.4'] entry).
// v53: Wiki — each card now shows the source website (e.g. "NHS.uk", "Mind", "Bipolar UK") and an "AI summary" / "Direct quote" badge above the link button; link button text now reads "Read on {site} ↗".
// v54: Wiki Books & Films — each media card now reserves a 72×108 cover slot (book jacket / film poster) at images/wiki-media/<slug>.jpg. Missing files hide themselves so unfilled entries render the same as before.
// v55: add js/shared/version-check.js — fetches /version.json and shows a top banner when a newer release is available (web → refresh, native → open store). New <script> tag added to index/journal/survival-kit/anonymous.html. Also: index.html shows a "v1.4 · iOS" chip below the auth FAB (populated by BB.versionLabel()); four home-page badges (journal streak, survival progress, anon messages, anon streak) get blurred-text skeleton placeholders that reserve their layout row until js/index.js swaps in real values — kills the empty-to-populated layout jump on the home screen for signed-in / guest-PIN users. fab.js now delegates its version label to BB.versionLabel() (single source of truth). Old v54 caches must drop so the new shared script, HTML, CSS, and JS all land together.
// v56: survival-kit.html / .css / .js — add 6 quick-add medication chips (Lithium, Quetiapine, Lamotrigine, Sodium Valproate, Olanzapine, Aripiprazole) in the My Medications modal. Tapping a chip fills the name input and focuses the dosage field.
// v57: remove the beta landing page / web access gate — `/` now serves index.html directly (worker.js), and the inline + js beta-gate redirects are gone. Dropped beta.html, css/beta.css, js/beta.js from the precache. Also: fixed the broken social-share image (og:image now points at the new haloed bear via images/og-card.png instead of a 404'd favicons path), added a real 1200×630 share card, fixed site.webmanifest, and added robots.txt + sitemap.xml.
// v58: extend "deleted by admin" tombstone visibility from 1 hour to 24 hours on the anonymous board.
// v59: in-app confirmation popup before enabling notifications/health sync on native (consent gate that survives account deletion, since OS permission grants can't be revoked programmatically); journal settings version label now reads the canonical window._APP_VERSION instead of a hardcoded 1.2, so it stays in sync with the home page.
// v60: permission-prompt fixes (journal.js). Notifications no longer prompt at startup/during the tutorial — initNotifications() now uses the non-prompting checkPermissions() and only re-schedules if already granted, so the OS notification sheet is raised solely by the reminder/weekly toggles. Health-sync toggle now actually requests OS Health access at the moment it's enabled (it previously only set a flag, so users saw "Not yet authorised" and were never asked); auto-sync on mood/focused-mode steps is gated behind checkHealthPermissions so a Firestore-rehydrated flag after reinstall can't pop a surprise sheet from ordinary navigation. When iOS suppresses the Health sheet (stuck grant after reinstall), the toggle offers a deep-link to Apple Health settings. iOS health status label no longer over-promises "Authorised" (read grants are opaque on iOS) — Android wording unchanged.
// v61: add the public marketing/landing page — worker.js now serves
//      marketing.html at `/` (the web app moved to /index.html). Precache
//      marketing.html + css/marketing.css + js/marketing.js so the new
//      homepage works offline. Installed PWAs still open the app directly
//      (manifest start_url is now /index.html).
// v62: add the Bipolar Anonymous marketing page — worker.js now serves
//      marketing-anonymous.html at `/` on bipolaranonymous.app (the board
//      stays at /anonymous). Precache it; it reuses css/marketing.css +
//      js/marketing.js, already cached.
// v63: js/marketing.js — hold each showcase carousel on its hero screenshot
//      until it scrolls into view, instead of auto-advancing from page load.
// v64: drop the (yellow) Bipolar Anonymous screenshot from the Bipolar Bear
//      carousel on both marketing pages — it clashed with the orange section.
// v65: v1.5 — version bump for the permission-prompt / HealthKit-reinstall
//      fix. _APP_VERSION='1.5' (brand-config.js), version.json web=1.5
//      (app stays 1.4 until the native build ships), new _WHATS_NEW_HEADLINES
//      ['1.5'] entry in js/index.js.
// v66: re-version onto the unified scheme — display = "1." + build number
//      (zero-padded). The journal.js permission fix ships as build 9, so
//      _APP_VERSION='1.09', version.json web=1.09 (app stays 1.4 until the
//      native 1.09 / build 9 build is live). Native: MARKETING_VERSION 1.09,
//      CURRENT_PROJECT_VERSION 9 (iOS app+widget); versionName 1.09,
//      versionCode 9 (Android).
// v68: root routing fix — wrangler.json now sets assets.run_worker_first so
//      worker.js actually runs for `/` and serves marketing.html (previously
//      Cloudflare served index.html directly and the worker was bypassed).
//      Bumped to drop any stale runtime-cached `/` → app-shell entry so
//      returning visitors land on the marketing page.
// v69: marketing showcase carousels are now dressed as a phone — the viewport
//      is a dark device body (bezel + dynamic-island pill) with the screenshot
//      clipped to the rounded screen inside it (css/marketing.css +
//      js/marketing.js).
// v70: home screen is now Journal-only by default. Survival Kit / Bipolar
//      Anonymous AND the stat badges are opt-in — enabled from Profile →
//      Customise (flags flipped from "hide" opt-out to "enabled" opt-in:
//      bbSurvivalBtnEnabled / bbAnonBtnEnabled / bbHomeStatsEnabled + Firestore
//      homeSurvivalEnabled / homeAnonEnabled / homeStatsEnabled). Account delete
//      / full reset returns to Journal-only with stats off. Also: Android
//      hardware/swipe back on journal.html + survival-kit.html now returns to
//      the home screen instead of exiting the app (js/journal.js,
//      js/survival-kit.js); and the guest Profile → Account page is stripped to
//      just the delete/reset option (index.html + js/index.js). Refresh precache.
// v71: consolidate the home-screen auth FAB. index.html shipped its own
//      #authFabWrapper (pre-dock auth button) on top of fab.js's #bbAuthFab at
//      the SAME bottom-centre coordinates — two stacked buttons toggled by
//      bbFabsUnlocked, with index.js and fab.js setting the wrapper's display
//      to opposite values (a latent desync). Removed the wrapper; #bbAuthFab is
//      now the single auth/profile button, always visible (fab.js owns it).
//      index.js restyles it per auth state + dims it offline; version chip is a
//      standalone #bbHomeVersion. Touches index.html, js/index.js, fab.js.
// v72: rename the landing route /marketing → /welcome. marketing.html →
//      welcome.html, marketing-anonymous.html → welcome-anonymous.html,
//      css/marketing.css → css/welcome.css, js/marketing.js → js/welcome.js.
//      worker.js now serves the host-aware landing at both `/` and `/welcome`
//      (wrangler run_worker_first gains "/welcome"). Precache paths updated.
// v73: js/anonymous.js — fix comment threads for standalone (email-code)
//      users. Firestore rules require auth on the comments subcollection
//      while bbAnonPosts itself is open, so posting worked but threads
//      silently failed. The board now signs in anonymously
//      (_ensureAuthSession) before subscribing/sending; send failures keep
//      the typed text and show a hint instead of vanishing; listener errors
//      no longer masquerade as "No comments yet".
// v74: welcome carousels — hide the prev/next arrows while the hero
//      screenshot (slide 1) is showing; they fade in once the carousel
//      auto-advances. Touches js/welcome.js, css/welcome.css.
// v75: mood-meter bear shadow moved off filter:drop-shadow onto a
//      .mood-stage::after ellipse — iOS Safari painted the drop-shadow as a
//      grey rectangle behind the transparent PNG. Touches css/welcome.css.
// v76: home buttons vertically centred between the logo and the FAB dock;
//      home stats (streak/stability/survival progress) now paint instantly
//      from cache for returning users via an inline early-paint script;
//      welcome hero gains a faded bear backdrop on mobile. Touches
//      index.html, css/index.css, welcome.html, css/welcome.css.
// v77: stats-off users no longer see the skeleton placeholders blur-flash on
//      load — the early-paint script applies bb-hide-stats synchronously when
//      the Show-stats preference is off. Touches index.html.
// v78: App Store review fixes — the ☕ donation FAB is suppressed in the iOS
//      native shell (Guideline 3.1.1: external donation links must use IAP;
//      web + Android unchanged), and the health-sync UI now names Apple
//      Health / Health Connect explicitly instead of "your phone's health
//      app" (Guideline 2.5.1). Touches fab.js, journal.html, js/journal.js.
// v79: App Store hardening round 2 — anonymous board gains a per-user mute
//      (🙈 on each post, persisted in bbAnon_muted, managed from the About
//      sheet) to satisfy Apple UGC guideline 1.2's block-user requirement;
//      all user-facing "BETA" labels renamed "Experimental" (2.3.10 risk).
//      Touches anonymous.html, js/anonymous.js, journal.html, js/journal.js.
// v80: version bump to 1.11 (build 11) for the App Store resubmission —
//      _APP_VERSION in brand-config.js + what's-new headline in js/index.js.
// v81: home polish — logo now vertically centred between the page top and
//      the Mood Journal button (css/index.css auto margin) so the default
//      single-button home looks balanced; tutorial finale gains a blocking
//      "Create an account to customise your experience" hint pointing at the
//      profile FAB before the complete popup (js/index.js, one-shot via
//      bbAccountHintShown). Touches css/index.css, js/index.js, js/journal.js.
// v82: post-sign-up onboarding — creating an account now auto-opens the
//      profile popup (after the tutorial-complete toast, if any) with the
//      Survival / Anonymous customise toggles pulsing under a NEW pill
//      (cleared once both are enabled or after 3 views). New optional
//      _fabOnSignUp hook in fab.js. Touches fab.js, js/index.js,
//      css/index.css.
// v83: App Store 2.5.1 — surface the Apple Health (HealthKit) sync card at the
//      top of the journal Settings panel (was buried under Advanced), and
//      confirm iOS read access by probing real data ("Connected to Apple
//      Health"). Touches journal.html, js/journal.js.
// v84: v1.12 — build-12 version bump (_APP_VERSION 1.12). Touches
//      js/shared/brand-config.js.
// v85: i18n pass + home live-data fixes — mood labels (Manic/Elevated/Stable/
//      Low/Depressed) and focused-mode step options (energy, sleep quality,
//      medication, anxiety/stress/irritability, yes/no) now go through BB.t
//      (EN + FR complete); auth/account modal "Create an account" cluster
//      wired to i18n. Home: entry tick now paints synchronously from cache
//      (validated against today/yesterday so a stale day no longer sticks)
//      and the online reconcile no longer trusts a stale done:true. Touches
//      js/shared/i18n.js, js/journal.js, journal.html, fab.js, js/index.js,
//      index.html.
// v86: i18n pass round 2 (EN + FR) — wired the remaining hardcoded strings:
//      classic (non-focused) journal form (sleep quality, medication, more-
//      data question rows + yes/no/normal answers, notes), edit-entry mood +
//      medication dropdowns, focused-mode placeholders/buttons (notes,
//      intention, "More details", budget/goals "Set"/"Change", Over budget/
//      On track), the empty-entries state, and the fab.js feedback modal,
//      quick-note modal, FAB picker, account change-password/email modal +
//      its success/error messages. Touches js/shared/i18n.js, js/journal.js,
//      journal.html, fab.js.
// v87: i18n pass round 3 (EN + FR) — focused-mode step titles (anxiety/
//      stress/irritability/exercise/outside/alcohol/budget), the full edit-
//      entry modal (Date/Energy/Sleep/Notes labels, all 8 advanced group
//      labels + "Not recorded"/option values, Save Changes), the Missing
//      Entries modal, and the common confirm dialogs (select mood, discard
//      changes, delete-all-entries). Touches js/shared/i18n.js, js/journal.js,
//      journal.html.
// v88: v1.13 — build-13 version bump (_APP_VERSION 1.13). App Store Guideline
//      5.1.1(iv) fix: removed the cancelable in-app confirm() that sat before
//      the HealthKit / Health Connect permission request when enabling the
//      health-sync toggle. Flipping the toggle on now goes straight to the OS
//      permission sheet (the real consent gate) — no exit button between the
//      user's action and the request. Touches js/journal.js, brand-config.js.
// v89: Full EN/FR i18n pass (moods, focused-mode steps + titles, journal
//      labels, FAB strings, edit-entry modal, confirm dialogs, Missing Entries
//      modal). Home live-data fix. Touches js/shared/i18n.js, js/journal.js,
//      js/index.js, journal.html, fab.js.
// v90: Home anonymous visit-streak badge is now lapse-aware. The cached
//      Anon_streak didn't self-expire, so a broken streak kept painting on the
//      home page until the board recomputed it (the "2-day streak that wasn't"
//      bug). New BB.anonLiveStreak() validates against AnonVisitDate; index.html
//      early-paint + _updateStreakBadge() use it, and the home auth listener now
//      restores AnonVisitDate from Firestore. Touches js/shared/brand-config.js,
//      js/index.js, index.html.
// v91: Anonymous privacy sheet rewritten to be accurate — posts are plaintext
//      on Firestore, so the old "End-to-End Encrypted / Messages are encrypted"
//      claims were false. Now states posts are public, identity is hashed, and
//      data is encrypted in transit + at rest. Updated across all 10 languages
//      in js/shared/i18n.js + anonymous.html defaults. Also added an App Store
//      reviewer bypass (test@bipolarbear.app) to js/anonymous.js.
// v92: Sign-in is now optional everywhere — all features (customise journal +
//      home) work as a guest, and signing in only backs up/syncs data. The
//      home profile FAB opens the Profile modal for guests (was the sign-in
//      form), the journal dock FAB opens Settings for guests (was the sign-in
//      form) and Settings gained a guest-only "Sign in to back up" button, and
//      the tutorial-finale account hint is reframed around optional backup.
//      Touches js/index.js, js/journal.js, journal.html, js/shared/i18n.js.
// v93: v1.14 (build 14) release — version bump only, rolls up the v90–v92
//      web changes (lapse-aware anon streak, accurate privacy sheet,
//      optional sign-in) into a fresh App Store build.
// v94: Settings/profile tidy-up — drop the duplicate "Health data:" status
//      line from the top Apple Health sync card (it already shows in the
//      settings footer), and move the guest "Sign up / in" button below the
//      language picker in the home Profile modal to mirror the Settings menu.
//      Also fixes the journal open/close button rendering its raw i18n key
//      (duplicate journal.btn block in the en + fr locales). Touches
//      journal.html, index.html, js/shared/i18n.js.
// v95: Move the Apple Health (HealthKit) sync card off the top level of
//      Settings into the Advanced "Mobile Settings" panel, below the Daily
//      Mood Reminder. Touches journal.html.
// v96: Tutorial finale auto-enables the Survival Kit home button (only if the
//      flag was never set) when it points the user at the profile button, so
//      the Survival Kit is pre-selected in the Customise panel and visible on
//      the home screen once they close it. Touches js/index.js.
// v97: In-app changelog updated for v1.14 — added a "What's New" headline
//      (js/index.js) and a v1.14 block in the full Changelog modal
//      (journal.html) covering this release's user-facing changes.
// v98: Tutorial finale now also auto-enables the Bipolar Anonymous home
//      button alongside the Survival Kit (each only if its flag was never
//      set), so both are pre-selected in the Customise panel. Touches
//      js/index.js.
// v99: First journal visit after the tutorial shows a one-shot blocking hint
//      (index-finale style: dimmer + elevated FAB + label) pointing at the dock
//      Settings FAB. New i18n key journal.hint.settingsFab in all 10 locales.
//      Touches js/journal.js, js/shared/i18n.js, journal.html (changelog).
// v100: Spelling fix — user-facing "Monika" → "Moniker" (the correct English
//       word for a chosen handle) across all 10 locales + hardcoded HTML/JS
//       copy. Internal identifiers untouched (Firestore bbAnonMonikas,
//       localStorage Anon_monika, element ids, i18n key names, openMonikaSettings).
// v101: EN/FR language coverage pass — wired the remaining hardcoded English
//       strings on the Bipolar Anonymous board (anonymous.js: relative times,
//       button states, empty/error states, medication subtitles, status rows,
//       aria-labels) through BB.t, and fully internationalised the public
//       marketing landing pages (welcome.html, welcome-anonymous.html,
//       js/welcome.js — new lp.* namespace, data-no-lang-picker opt-out) and
//       the Survival Kit (survival-kit.html, js/survival-kit.js — new sk.*
//       namespace covering the mood scale, strategies, mind games, reading/
//       media, and dynamic modal titles/buttons). English + French added in
//       js/shared/i18n.js. Touches js/shared/i18n.js, js/anonymous.js,
//       welcome.html, welcome-anonymous.html, js/welcome.js, survival-kit.html,
//       js/survival-kit.js.
// v103: Bipolar Anonymous App Store compliance — in-app account deletion
//       (guideline 5.1.1) plus a signup terms-acceptance gate, a zero-tolerance
//       Community Guidelines & Terms overlay, and an in-app contact (guideline
//       1.2) in anonymous.html / js/anonymous.js; a mobile top-bar overflow fix
//       (css/anonymous.css); and the contact email switched to
//       bipolar@unisim.co.uk (privacy.html + anonymous board).
const CACHE_NAME = 'bipolarbear-v103';

/**
 * Files that should be available offline. Each entry is precached on `install`.
 * Keep entries to ones we always want offline; per-request caching below
 * picks up everything else as the user navigates.
 */
const STATIC_ASSETS = [
  './welcome.html',
  './welcome-anonymous.html',
  './index.html',
  './journal.html',
  './survival-kit.html',
  './anonymous.html',
  './privacy.html',

  // FAB dock + page-specific JS (extracted from inline scripts in Phase 4).
  './fab.js',
  './js/welcome.js',
  './js/index.js',
  './js/journal.js',
  './js/survival-kit.js',
  './js/anonymous.js',

  // Shared modules — small, loaded by every page.
  './js/shared/platform.js',
  './js/shared/debug.js',
  './js/shared/brand-config.js',
  './js/shared/firebase-config.js',
  './js/shared/onboarding.js',
  './js/shared/medications.js',
  './js/shared/version-check.js',
  './js/shared/i18n.js',

  // NOTE: /version.json is deliberately NOT precached. It must always be
  // fetched fresh so a new release reaches stale clients on next page load
  // — see worker.js for the no-store header.

  // Shared theme tokens (loaded before page-specific CSS).
  './css/theme.css',

  // Page-specific stylesheets (extracted from inline <style> in Phase 4).
  './css/welcome.css',
  './css/index.css',
  './css/journal.css',
  './css/survival-kit.css',
  './css/anonymous.css',

  // Manifests. Icons are deliberately not precached — they're served from
  // /icons/favicons/ (referenced in <link rel="icon">) and the browser's
  // own image cache handles them adequately.
  './manifest.json',
  './manifest-anonymous.json',

  // Wiki tab data (fetched by js/anonymous.js renderers).
  './data/wiki-support-groups.json',
  './data/wiki-posts.json',
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
