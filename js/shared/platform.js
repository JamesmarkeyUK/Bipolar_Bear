/**
 * Capacitor / native platform detection helpers shared by every page.
 *
 * Replaces the long `window.Capacitor && window.Capacitor.isNativePlatform &&
 * window.Capacitor.isNativePlatform()` chain that was duplicated 10+ times
 * across the inline scripts. Existing call sites use `isNative()`, `isIOS()`
 * and `isAndroid()` as bare globals, so we expose both `window.BB.platform.*`
 * (the canonical namespace) and `window.isNative` etc. (legacy aliases).
 *
 * Loading order: include this script in `<head>` before any inline `<script>`
 * that calls `isNative()`. It has no external dependencies and is safe to
 * load synchronously.
 *
 * @file js/shared/platform.js
 */
(function () {
  /**
   * Internal: returns the current Capacitor global if present.
   * @returns {object|undefined} `window.Capacitor` or undefined when running on the web.
   */
  function _cap() {
    return window.Capacitor;
  }

  /**
   * True when the page is running inside a Capacitor native shell
   * (iOS or Android), false in any browser context.
   * @returns {boolean}
   */
  function isNative() {
    var c = _cap();
    return !!(c && c.isNativePlatform && c.isNativePlatform());
  }

  /**
   * True when running inside the Capacitor iOS shell.
   * @returns {boolean}
   */
  function isIOS() {
    return isNative() && _cap().getPlatform() === 'ios';
  }

  /**
   * True when running inside the Capacitor Android shell.
   * @returns {boolean}
   */
  function isAndroid() {
    return isNative() && _cap().getPlatform() === 'android';
  }

  // Canonical namespace.
  window.BB = window.BB || {};
  window.BB.platform = { isNative: isNative, isIOS: isIOS, isAndroid: isAndroid };

  // Legacy globals — keep existing inline call sites working.
  window.isNative = isNative;
  window.isIOS = isIOS;
  window.isAndroid = isAndroid;
})();
