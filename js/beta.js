/**
 * Beta-landing-page logic (extracted from inline <script> in beta.html).
 *
 * Responsibilities:
 *   - Fast-path redirect to index.html if the access code has already been entered
 *   - Beta signup form: validates email + platform and writes to Firestore
 *     (`betaSignups` collection)
 *   - Access-code gate (`accessPw`): unlocks the web build by writing
 *     `bbWebUnlocked='true'` to localStorage, then redirects to index.html
 *   - "People helped" counter from `counters/peopleHelped` (or
 *     `peopleHelpedApp` on native)
 *   - Logo easter egg: 5 quick taps cycles through the 3 logo variants and
 *     persists the choice in `logoVariant` localStorage
 *
 * Loading order: include after the Firebase compat SDKs and after the
 * shared modules in <head> (firebase-config.js, platform.js, debug.js).
 *
 * @file js/beta.js
 */
(function () {
  'use strict';

  // ── Firebase init ──
  // Config lives in js/shared/firebase-config.js so every page reads the
  // same source of truth.
  firebase.initializeApp(window.BB_FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // If already unlocked, skip straight to the app.
  if (localStorage.getItem('bbWebUnlocked') === 'true') {
    location.replace('index.html');
  }

  /** Currently-selected platform from the chooser ('iPhone' | 'Android' | 'Web') or null. */
  let selectedPlatform = null;

  /**
   * Toggle which platform-chooser button is selected. Wired from inline
   * `onclick=` on each button, hence exposed on `window`.
   * @param {HTMLElement} el The clicked `.platform-btn` element.
   */
  window.selectPlatform = function (el) {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selectedPlatform = el.dataset.platform;
  };

  /**
   * Sign in anonymously if not already authenticated. Required so the
   * `betaSignups.add()` write below passes the security rules. Failures
   * are non-fatal — the write may still succeed on retry, or fail with a
   * clearer error if rules truly block it.
   * @returns {Promise<void>}
   */
  async function ensureAnonymousAuth() {
    if (auth.currentUser) return;
    try { await auth.signInAnonymously(); } catch (e) { /* proceed anyway */ }
  }

  /**
   * Validate inputs, sign in anonymously, and append a `betaSignups` doc.
   * On success swaps the form for the success block. On failure re-enables
   * the button and surfaces a generic error (specific Firebase errors are
   * intentionally hidden from end users).
   * @returns {Promise<void>}
   */
  window.submitSignup = async function () {
    const emailEl = document.getElementById('betaEmail');
    const errorEl = document.getElementById('signupError');
    const btn = document.querySelector('.submit-btn');

    const email = emailEl.value.trim();
    errorEl.style.display = 'none';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.style.display = '';
      return;
    }
    if (!selectedPlatform) {
      errorEl.textContent = 'Please select a platform.';
      errorEl.style.display = '';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      await ensureAnonymousAuth();
      await db.collection('betaSignups').add({
        email,
        platform: selectedPlatform,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        source: 'web'
      });
      document.getElementById('signupForm').style.display = 'none';
      document.getElementById('signupSuccess').style.display = '';
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Request beta access →';
      errorEl.textContent = 'Something went wrong. Please try again.';
      errorEl.style.display = '';
    }
  };

  /**
   * Shared access-code gate. Unlocks the web build when the magic word is
   * typed. Wrong code shows the inline error and refocuses the input.
   *
   * Note: this is a friction speed-bump, not a security boundary. The real
   * security model is Firestore rules + per-account E2E encryption.
   */
  window.checkPassword = function () {
    const val = document.getElementById('accessPw').value;
    const errEl = document.getElementById('pwError');
    if (val === 'bipolar') {
      localStorage.setItem('bbWebUnlocked', 'true');
      location.replace('index.html');
    } else {
      errEl.style.display = '';
      document.getElementById('accessPw').value = '';
      document.getElementById('accessPw').focus();
    }
  };

  // ── People helped counter ──
  // One-shot fetch from Firestore. The native build uses a separate counter
  // doc so app-store visits don't inflate the web headline.
  (async function _renderPeopleHelped() {
    try {
      await ensureAnonymousAuth();
      const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      const docId = isNative ? 'peopleHelpedApp' : 'peopleHelped';
      const doc = await db.collection('counters').doc(docId).get({ source: 'server' });
      const count = doc.exists ? (doc.data().count || 0) : 0;
      const el = document.getElementById('betaHelpedCount');
      if (el) {
        el.textContent = `🤝 ${Number(count).toLocaleString('en-US')} people visited BipolarBear.app`;
        el.style.display = '';
      }
    } catch (e) { /* silent fail — the empty counter is acceptable */ }
  })();

  // ── Logo easter egg ──
  // 5 quick taps cycles through 3 logo variants. The current choice is
  // persisted in `logoVariant` and applied on every page load.
  (function _wireLogoEasterEgg() {
    const logoImg = document.querySelector('.logo-img');
    const srcs = [
      'images/logos/good_logo.png',
      'images/logos/elevated_logo.png',
      'images/logos/sad_logo.png',
    ];
    let currentIndex = parseInt(localStorage.getItem('logoVariant') || '0');
    let clickCount = 0;
    let resetTimer = null;

    logoImg.src = srcs[currentIndex];
    logoImg.style.cursor = 'pointer';

    const hint = document.querySelector('.logo-hint');
    const hintText = hint ? hint.querySelector('span') : null;

    logoImg.addEventListener('click', () => {
      clearTimeout(resetTimer);
      clickCount++;

      // Update the encouraging hint text as the user clicks.
      if (hint && hintText) {
        hint.style.animation = 'none';
        hint.style.opacity = '1';
        if (clickCount === 1) {
          hintText.textContent = 'Click me again!';
        } else if (clickCount >= 2) {
          hintText.textContent = 'and again…';
        }
      }

      // Quick "wiggle" feedback on every click.
      logoImg.style.transition = 'transform 0.1s ease';
      logoImg.style.transform = 'scale(1.15) rotate(5deg)';
      setTimeout(() => { logoImg.style.transform = ''; logoImg.style.transition = ''; }, 120);

      if (clickCount === 5) {
        // Threshold reached — cycle to the next variant with a flourish.
        clickCount = 0;
        currentIndex = (currentIndex + 1) % srcs.length;
        localStorage.setItem('logoVariant', currentIndex);

        if (hint) hint.style.display = 'none';

        logoImg.style.transition = 'transform 0.4s ease, opacity 0.3s ease';
        logoImg.style.transform = 'scale(0) rotate(180deg)';
        logoImg.style.opacity = '0';
        setTimeout(() => {
          logoImg.src = srcs[currentIndex];
          logoImg.style.transform = 'scale(1.1) rotate(-5deg)';
          logoImg.style.opacity = '1';
          setTimeout(() => {
            logoImg.style.transition = '';
            logoImg.style.transform = '';
          }, 200);
        }, 300);
      } else {
        // Reset the click streak after 1.5s of inactivity.
        resetTimer = setTimeout(() => { clickCount = 0; }, 1500);
      }
    });
  })();
})();
