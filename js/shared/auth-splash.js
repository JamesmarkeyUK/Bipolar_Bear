/**
 * Loading splash for a restoring Firebase session.
 *
 * Firebase Auth restores a cached session asynchronously — `auth` isn't ready
 * until the SDK has downloaded, initialised and read its own localStorage
 * record, which on a cold load is comfortably long enough to see. Until then
 * every page paints its signed-out chrome (the locked Bipolar Anonymous
 * button, "Sign in to join the community", the Sign In FAB), so a returning
 * user watches the app tell them they're logged out and then correct itself.
 *
 * This covers that gap with the app icon and a line tracing its outline, and
 * it is deliberately conservative about when it appears:
 *
 * - **Only when a session is actually coming back.** `arm()` looks for a
 *   populated `firebase:authUser:*` entry in localStorage — the same probe the
 *   early-paint script in index.html uses. A genuine guest has none, so they go
 *   straight to the signed-out home rather than waiting behind a splash for a
 *   sign-in that is never going to happen.
 * - **Before first paint.** The module is loaded synchronously in `<head>`, so
 *   the class lands on `<html>` before `<body>` is parsed and the splash is
 *   part of the first frame rather than something that appears over one.
 * - **It always comes down.** `hide()` is idempotent and a self-contained
 *   timeout takes the splash away regardless, so a Firebase CDN failure or a
 *   thrown error in a page script can never strand somebody behind it.
 *
 * Pages opt in by carrying the `#bbAuthSplash` markup and calling
 * `BB.authSplash.hide()` once auth has resolved; the CSS lives in
 * `css/theme.css`.
 *
 * @file js/shared/auth-splash.js
 */
(function () {
  window.BB = window.BB || {};

  /** Class on <html> that makes the splash visible (see css/theme.css). */
  var CLS = 'bb-auth-restoring';
  /**
   * Hard ceiling on how long the splash may cover the page. Auth normally
   * resolves in well under a second; this is only here so that a failure
   * anywhere downstream degrades to today's behaviour (a brief signed-out
   * flash) instead of a page nobody can use.
   */
  var MAX_MS = 6000;
  /** Must match the opacity transition in css/theme.css. */
  var FADE_MS = 220;

  var _armed  = false;
  var _hidden = false;

  /**
   * Is there a Firebase session in localStorage waiting to be restored?
   * Mirrors the probe in index.html's early-paint script.
   * @returns {boolean}
   */
  function _sessionPending() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('firebase:authUser:') === 0) {
          var v = localStorage.getItem(k);
          if (v && v !== 'null' && v.length > 5) return true;
        }
      }
    } catch (_) { /* private mode — treat as no session, show nothing */ }
    return false;
  }

  var authSplash = {
    /**
     * Show the splash if — and only if — a cached session is about to be
     * restored. Safe to call before <body> exists; it only touches <html>.
     * @returns {boolean} whether the splash was raised
     */
    arm: function () {
      if (_armed || _hidden) return _armed;
      if (!_sessionPending()) return false;
      try {
        document.documentElement.classList.add(CLS);
      } catch (_) { return false; }
      _armed = true;
      // Self-contained safety net: this module is the only thing that can
      // take the splash down, so it must not depend on any other script
      // surviving to do it.
      setTimeout(function () { authSplash.hide(); }, MAX_MS);
      return true;
    },

    /** True while the splash is covering the page. */
    isVisible: function () { return _armed && !_hidden; },

    /**
     * Take the splash down. Idempotent, and safe to call when it was never
     * raised. Fades out first so the revealed page doesn't snap in.
     */
    hide: function () {
      if (_hidden) return;
      _hidden = true;
      if (!_armed) return;
      var el = document.getElementById('bbAuthSplash');
      if (!el) {
        try { document.documentElement.classList.remove(CLS); } catch (_) {}
        return;
      }
      el.setAttribute('data-leaving', '1');
      setTimeout(function () {
        try { document.documentElement.classList.remove(CLS); } catch (_) {}
        el.removeAttribute('data-leaving');
      }, FADE_MS);
    },
  };

  window.BB.authSplash = authSplash;
  // Arm on load: the point of this module is to beat first paint, so there is
  // nothing to wait for. Pages without the markup are unaffected — the class
  // then styles nothing.
  authSplash.arm();
})();
