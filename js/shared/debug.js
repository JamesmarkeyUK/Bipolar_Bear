/**
 * Debug logging helper, gated by a localStorage flag so logs can be turned
 * on/off on a device without rebuilding.
 *
 *   localStorage.setItem('bbDebug', '0');  // silence info logs
 *   localStorage.removeItem('bbDebug');    // restore default (verbose)
 *
 * `BB.log` is silenceable; `BB.warn` and `BB.error` always pass through —
 * warnings and errors should never be silently swallowed.
 *
 * Default is verbose so we don't lose visibility while we're still actively
 * debugging Android. Flip the default once the app stabilises.
 *
 * @file js/shared/debug.js
 */
(function () {
  /**
   * @returns {boolean} true unless `localStorage.bbDebug === '0'`.
   */
  function _enabled() {
    try {
      return localStorage.getItem('bbDebug') !== '0';
    } catch (_) {
      // localStorage can throw in incognito on iOS — fail open (verbose).
      return true;
    }
  }

  /**
   * Info-level log. No-op when debug is disabled.
   * @param {...any} args
   */
  function log() {
    if (!_enabled()) return;
    // eslint-disable-next-line no-console
    console.log.apply(console, arguments);
  }

  /**
   * Warning-level log. Always emitted.
   * @param {...any} args
   */
  function warn() {
    // eslint-disable-next-line no-console
    console.warn.apply(console, arguments);
  }

  /**
   * Error-level log. Always emitted.
   * @param {...any} args
   */
  function error() {
    // eslint-disable-next-line no-console
    console.error.apply(console, arguments);
  }

  window.BB = window.BB || {};
  window.BB.log = log;
  window.BB.warn = warn;
  window.BB.error = error;
})();
