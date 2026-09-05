/**
 * Remote "is a newer version available" check.
 *
 * Fetches /version.json a few seconds after each page load, compares the
 * relevant channel ("web" for browser/PWA, "app" for Capacitor native) to
 * the locally-loaded `window._APP_VERSION`, and shows a dismissible top
 * banner if the remote is newer. Tapping the banner refreshes (web) or
 * opens the relevant app store (native).
 *
 * Why the two channels: web auto-deploys on every push to main, but native
 * builds are submitted manually. After a JS-only release you can bump the
 * "web" field without nagging native users who haven't received the new
 * bundle yet.
 *
 * Fetch path:
 *   - Always hits the public domain (BB_BRAND.domain / .domainAnonymous),
 *     not a relative `/version.json`, because Capacitor's WebView origin
 *     is `capacitor://localhost` / `https://localhost` and a relative URL
 *     would try to read the bundled (shipped-with-app) copy — which is
 *     useless for telling the user a newer release exists.
 *   - The Cloudflare Worker (`worker.js`) attaches
 *     `Access-Control-Allow-Origin: *` and `Cache-Control: no-store` on
 *     /version.json so cross-origin native fetches succeed and edge caches
 *     don't pin a stale value.
 *
 * Bump `window._APP_VERSION` in `js/shared/brand-config.js` AND the matching
 * channel in `/version.json` on every release. The two fields must move
 * together — otherwise no one ever gets the prompt, or everyone gets it
 * immediately and forever.
 *
 * @file js/shared/version-check.js
 */
(function () {
  'use strict';

  // Per-platform store URLs. Both apps are live on both stores; a null entry
  // would make the banner fall back to "please update via your app store"
  // copy rather than offer a broken tap target.
  var STORE_URLS = {
    ios: {
      main:      'https://apps.apple.com/gb/app/bipolar-bear/id6766637453',
      anonymous: 'https://apps.apple.com/gb/app/bipolar-anonymous/id6768005853',
    },
    android: {
      main:      'https://play.google.com/store/apps/details?id=com.bipolarbear.app',
      anonymous: 'https://play.google.com/store/apps/details?id=com.bipolaranonymous.app',
    },
  };

  /**
   * Numeric dotted-version comparison. "1.5" > "1.4", "1.4.1" > "1.4".
   * @returns {boolean} true iff remote is strictly newer than local
   */
  function _isNewer(remote, local) {
    if (!remote || !local) return false;
    var r = String(remote).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var l = String(local).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var len = Math.max(r.length, l.length);
    for (var i = 0; i < len; i++) {
      var a = r[i] || 0;
      var b = l[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  function _channel() {
    return (window.BB && window.BB.platform && window.BB.platform.isNative()) ? 'app' : 'web';
  }

  function _isAnon() {
    try { return !!(window.BB && window.BB.isAnonymousApp && window.BB.isAnonymousApp()); }
    catch (_) { return false; }
  }

  function _storeUrl() {
    var p = window.BB && window.BB.platform;
    if (!p) return null;
    var key = _isAnon() ? 'anonymous' : 'main';
    if (p.isIOS())     return STORE_URLS.ios[key];
    if (p.isAndroid()) return STORE_URLS.android[key];
    return null;
  }

  function _versionUrl() {
    var brand = window.BB_BRAND;
    if (!brand) return null;
    var domain = _isAnon() ? brand.domainAnonymous : brand.domain;
    if (!domain) return null;
    return 'https://' + domain + '/version.json?t=' + Date.now();
  }

  // Dismissed-this-session flag. We re-show on next session even without a
  // further version bump — cheap nudge, easy to ignore.
  function _dismissed() {
    try { return sessionStorage.getItem('bbUpdateBannerDismissed') === '1'; }
    catch (_) { return false; }
  }
  function _markDismissed() {
    try { sessionStorage.setItem('bbUpdateBannerDismissed', '1'); }
    catch (_) {}
  }

  function _showBanner(remoteVersion) {
    if (document.getElementById('bbUpdateBanner')) return;
    if (_dismissed()) return;

    var native   = window.BB && window.BB.platform && window.BB.platform.isNative();
    var storeUrl = native ? _storeUrl() : null;

    var msg = native
      ? (storeUrl
          ? 'Update available — tap to open the store'
          : 'Update available — please update via your app store')
      : 'New version available — tap to refresh';

    // Inject the slide-in keyframes once per page.
    if (!document.getElementById('bbUpdateBannerStyle')) {
      var style = document.createElement('style');
      style.id = 'bbUpdateBannerStyle';
      style.textContent =
        '@keyframes bbUpdateBannerSlide{from{transform:translateY(-100%);opacity:0;}to{transform:translateY(0);opacity:1;}}';
      document.head.appendChild(style);
    }

    var banner = document.createElement('div');
    banner.id = 'bbUpdateBanner';
    banner.setAttribute('role', 'status');
    Object.assign(banner.style, {
      position:    'fixed',
      top:         '0',
      left:        '0',
      right:       '0',
      paddingTop:  'calc(env(safe-area-inset-top, 0px) + 12px)',
      paddingBottom:'12px',
      paddingLeft: '16px',
      paddingRight:'48px',
      background:  'var(--brand-primary, #ff8c42)',
      color:       'white',
      fontSize:    '0.9em',
      fontWeight:  '600',
      textAlign:   'center',
      zIndex:      '99999',
      boxShadow:   '0 2px 8px rgba(0,0,0,0.18)',
      cursor:      (native && !storeUrl) ? 'default' : 'pointer',
      animation:   'bbUpdateBannerSlide 0.3s ease',
    });
    banner.textContent = msg;

    var dismiss = document.createElement('button');
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss update notification');
    Object.assign(dismiss.style, {
      position:        'absolute',
      top:             'calc(env(safe-area-inset-top, 0px) + 8px)',
      right:           '10px',
      background:      'rgba(0,0,0,0.18)',
      color:           'white',
      border:          '0',
      borderRadius:    '50%',
      width:           '28px',
      height:          '28px',
      fontSize:        '16px',
      lineHeight:      '28px',
      padding:         '0',
      cursor:          'pointer',
    });
    dismiss.addEventListener('click', function (e) {
      e.stopPropagation();
      _markDismissed();
      banner.remove();
    });
    banner.appendChild(dismiss);

    banner.addEventListener('click', function () {
      if (native) {
        if (storeUrl) {
          try { window.open(storeUrl, '_blank'); }
          catch (_) { window.location.href = storeUrl; }
          _markDismissed();
          banner.remove();
        }
        // If no storeUrl, leave the banner up — they need the message,
        // tapping does nothing intentionally. Dismiss via × button.
        return;
      }
      // Web / PWA: best-effort SW update + hard reload.
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.update(); }));
          }).finally(function () { location.reload(); });
        } else {
          location.reload();
        }
      } catch (_) {
        location.reload();
      }
    });

    document.body.appendChild(banner);
    if (window.BB && window.BB.log) {
      window.BB.log('version-check: nudging to ' + remoteVersion + ' (channel=' + _channel() + ')');
    }
  }

  /**
   * One-shot check. Exposed on `window.BB.versionCheck` for manual testing
   * (`BB.versionCheck()` in the console forces a re-check).
   */
  function _check() {
    var local = window._APP_VERSION;
    if (!local) return;
    var url = _versionUrl();
    if (!url) return;
    try {
      fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var ch = _channel();
          var remote = data[ch];
          if (!remote) return;
          if (_isNewer(remote, local)) _showBanner(remote);
        })
        .catch(function () { /* offline / CORS / DNS — silent, retry next session */ });
    } catch (_) {}
  }

  /**
   * Build the "v1.4 · iOS" footer string used by both the auth/account
   * modals (fab.js) and the home-screen version chip (index.html). Single
   * source of truth so a copy-edit lands everywhere at once.
   *
   * Returns an empty string if `window._APP_VERSION` is somehow missing
   * (better than rendering a bare "v" placeholder).
   *
   * @returns {string}
   */
  function _versionLabel() {
    var v = window._APP_VERSION;
    if (!v) return '';
    var suffix = ' · web';
    try {
      var p = window.BB && window.BB.platform;
      if (p && p.isNative()) {
        suffix = p.isIOS() ? ' · iOS' : (p.isAndroid() ? ' · Android' : ' · native');
      } else if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        suffix = ' · PWA';
      }
    } catch (_) {}
    return 'v' + v + suffix;
  }

  window.BB = window.BB || {};
  window.BB.versionCheck = _check;
  window.BB.versionLabel = _versionLabel;

  /**
   * If the host page has a `#bbHomeVersion` element (e.g. index.html's chip
   * next to the auth FAB), drop the version label in. Other pages can use
   * the same id; pages without it are no-ops.
   */
  function _populateHomeLabel() {
    var el = document.getElementById('bbHomeVersion');
    if (el) el.textContent = _versionLabel();
  }

  // Delay slightly so first paint isn't competing with the fetch.
  function _schedule() {
    _populateHomeLabel();
    setTimeout(_check, 3000);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _schedule();
  } else {
    window.addEventListener('DOMContentLoaded', _schedule);
  }
})();
