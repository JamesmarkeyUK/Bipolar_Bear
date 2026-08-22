/**
 * Global community-size counters.
 *
 * Two Firestore counter documents, both living in the existing `counters/`
 * collection alongside `helpedCount` / `appCosts`:
 *
 *   counters/userCount      — Bipolar Bear accounts (main app)
 *   counters/anonUserCount  — Bipolar Anonymous members (board)
 *
 * Counting is client-side and idempotent per account, not a live `count()`
 * aggregate: `userSettings/{uid}` and `anonProfiles/{hash}` are only readable
 * by their own owner, so nobody can count them from the client. Instead each
 * account writes a one-time "I've been counted" flag into its OWN profile
 * document inside the same transaction that bumps the counter — so an account
 * can be counted exactly once, however many devices it signs in from, and
 * accounts that existed before this shipped are picked up the first time they
 * open the app (no backfill migration needed).
 *
 * A localStorage mirror of the flag short-circuits the transaction entirely on
 * every subsequent load, so the steady-state cost is one document read for the
 * display and nothing else.
 *
 * Displayed values are cached in localStorage so a returning user sees the
 * last known number immediately instead of a gap while Firestore resolves.
 *
 * @file js/shared/user-count.js
 */
(function () {
  window.BB = window.BB || {};

  /** Firestore doc id in `counters/` per counter kind. */
  var DOC_ID = { app: 'userCount', anon: 'anonUserCount' };
  /** localStorage key holding the last known value (via BB.storage prefix). */
  var CACHE_KEY = { app: 'UserCountCache', anon: 'AnonUserCountCache' };
  /** localStorage key mirroring "this account has already been counted". */
  var FLAG_KEY = { app: 'UserCounted', anon: 'Anon_counted' };

  /**
   * Presence ("live right now") collections. One document per open session,
   * doc id = a random per-tab id, contents = a single `lastSeen` timestamp.
   * Deliberately carries NO uid, email or monika: a live count should never
   * become a record of who was reading a mental-health app and when.
   */
  var PRESENCE = { app: 'bbPresence', anon: 'bbAnonPresence' };
  /** A session counts as live for this long after its last heartbeat. */
  var LIVE_WINDOW_MS = 120000;   // 2 min
  /** How often an open, visible page re-beats and re-counts. */
  var BEAT_MS = 45000;           // 45 s
  /** Presence docs older than this are swept opportunistically. */
  var STALE_MS = 1800000;        // 30 min
  /** Safety cap on a live-count query that can't use the count() aggregate. */
  var LIVE_CAP = 500;

  /** BB.log / BB.warn if debug.js loaded, plain console otherwise. */
  function _log(msg, extra) {
    var f = (window.BB && window.BB.log) || (window.console && console.log);
    if (f) extra === undefined ? f(msg) : f(msg, extra);
  }
  function _warn(msg, extra) {
    var f = (window.BB && window.BB.warn) || (window.console && console.warn);
    if (f) extra === undefined ? f(msg) : f(msg, extra);
  }

  /**
   * Random per-tab session id for the presence document, kept in
   * sessionStorage so a reload reuses it (and a new tab gets its own).
   * @returns {string}
   */
  function _sessionId() {
    var KEY = 'bbPresenceId';
    try {
      var existing = sessionStorage.getItem(KEY);
      if (existing) return existing;
    } catch (_) { /* private mode — fall through to a per-load id */ }
    var id = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { sessionStorage.setItem(KEY, id); } catch (_) {}
    return id;
  }

  function _counterRef(db, kind) {
    return db.collection('counters').doc(DOC_ID[kind] || DOC_ID.app);
  }

  /** Read a possibly-nested field ('anonProfile.counted') off a plain object. */
  function _readPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /** Build `{a: {b: value}}` from 'a.b' — a merge-safe patch for one field. */
  function _patchPath(path, value) {
    var parts = path.split('.');
    var out = value;
    for (var i = parts.length - 1; i >= 0; i--) {
      var wrap = {};
      wrap[parts[i]] = out;
      out = wrap;
    }
    return out;
  }

  var userCount = {
    /**
     * Last known value for a counter, or null if we've never read one.
     * @param {'app'|'anon'} kind
     * @returns {number|null}
     */
    cached: function (kind) {
      var raw = parseInt(window.BB.storage.get(CACHE_KEY[kind]) || '', 10);
      return isNaN(raw) || raw < 0 ? null : raw;
    },

    /**
     * Fetch the current counter value, refreshing the localStorage cache.
     * Never rejects — falls back to the cached value (or null) on any
     * network/permission error so a counter is never a broken page.
     * @param {object} db  Firestore instance
     * @param {'app'|'anon'} kind
     * @returns {Promise<number|null>}
     */
    load: function (db, kind) {
      var self = this;
      if (!db) return Promise.resolve(this.cached(kind));
      return _counterRef(db, kind).get()
        .then(function (snap) {
          var n = snap.exists ? snap.data().count : null;
          if (typeof n !== 'number' || !isFinite(n) || n < 0) {
            // Missing doc (nobody has been counted yet) or a junk value — the
            // caller hides its line rather than showing a zero.
            _log('[userCount] no value for ' + DOC_ID[kind] +
              (snap.exists ? ' (doc exists, count=' + JSON.stringify(n) + ')' : ' (doc does not exist yet)'));
            return self.cached(kind);
          }
          window.BB.storage.set(CACHE_KEY[kind], String(n));
          _log('[userCount] ' + DOC_ID[kind] + ' = ' + n);
          return n;
        })
        .catch(function (e) {
          // Never fatal, but never silent either — a permission-denied here is
          // the difference between "no users yet" and "rules block the read".
          _warn('[userCount] read of counters/' + DOC_ID[kind] + ' failed:', e && (e.code || e.message || e));
          return self.cached(kind);
        });
    },

    /**
     * Count this account exactly once, then never again.
     *
     * Runs a transaction over the account's own profile document: if the flag
     * at `flagPath` isn't set yet, set it and increment the counter in the
     * same atomic write (so two devices racing can't double-count). A
     * localStorage mirror means the transaction only ever runs once per
     * device anyway.
     *
     * @param {object} db        Firestore instance
     * @param {'app'|'anon'} kind
     * @param {object} profileRef  DocumentReference the account owns and can write
     * @param {string} flagPath    Field path for the flag, e.g. 'anonProfile.counted'
     * @returns {Promise<boolean>} true if this call was the one that counted them
     */
    countOnce: function (db, kind, profileRef, flagPath) {
      var self = this;
      if (!db || !profileRef) return Promise.resolve(false);
      if (window.BB.storage.get(FLAG_KEY[kind]) === '1') return Promise.resolve(false);
      var counterRef = _counterRef(db, kind);
      return db.runTransaction(function (tx) {
        return tx.get(profileRef).then(function (snap) {
          var data = snap.exists ? snap.data() : {};
          if (_readPath(data, flagPath) === true) return false;
          tx.set(profileRef, _patchPath(flagPath, true), { merge: true });
          tx.set(
            counterRef,
            { count: window.firebase.firestore.FieldValue.increment(1) },
            { merge: true }
          );
          return true;
        });
      }).then(function (counted) {
        window.BB.storage.set(FLAG_KEY[kind], '1');
        _log('[userCount] ' + DOC_ID[kind] + ': this account ' +
          (counted ? 'counted (+1)' : 'was already counted'));
        if (counted) {
          var c = self.cached(kind);
          if (c !== null) window.BB.storage.set(CACHE_KEY[kind], String(c + 1));
        }
        return counted;
      }).catch(function (e) {
        _warn('[userCount] counting this account into counters/' + DOC_ID[kind] + ' failed:',
          e && (e.code || e.message || e));
        return false;
      });
    },

    /**
     * Give the count back when an account is deleted. No-op unless this device
     * knows the account was counted (the profile document holding the flag is
     * being destroyed by the same delete flow, so the local mirror is the only
     * thing left to check).
     * @param {object} db  Firestore instance
     * @param {'app'|'anon'} kind
     * @returns {Promise<boolean>} true if a decrement was sent
     */
    uncount: function (db, kind) {
      var self = this;
      if (window.BB.storage.get(FLAG_KEY[kind]) !== '1') return Promise.resolve(false);
      window.BB.storage.remove(FLAG_KEY[kind]);
      if (!db) return Promise.resolve(false);
      return _counterRef(db, kind)
        .set(
          { count: window.firebase.firestore.FieldValue.increment(-1) },
          { merge: true }
        )
        .then(function () {
          var c = self.cached(kind);
          if (c !== null) window.BB.storage.set(CACHE_KEY[kind], String(Math.max(0, c - 1)));
          return true;
        })
        .catch(function (e) {
          _warn('[userCount] decrement of counters/' + DOC_ID[kind] + ' failed:', e && (e.code || e.message || e));
          return false;
        });
    },

    /**
     * Start reporting this session as live, and report back how many sessions
     * are live, roughly every 45 seconds.
     *
     * Each open page owns one presence document (random id, held in
     * sessionStorage so a reload keeps the same one) carrying nothing but a
     * `lastSeen` timestamp. "Live" is then simply "beat within the last two
     * minutes", so a closed tab drops out on its own even if its delete never
     * lands. Heartbeats pause while the tab is hidden — a backgrounded tab
     * isn't someone using the app.
     *
     * Everything here is best-effort: if the writes or the query are refused,
     * it warns once per failure and the caller simply never gets a live number.
     *
     * @param {object} db  Firestore instance
     * @param {'app'|'anon'} kind
     * @param {function(number)} onCount  called with the live session count
     * @returns {function()} stop function (clears the timer, drops the doc)
     */
    startPresence: function (db, kind, onCount) {
      var noop = function () {};
      if (!db || !window.firebase || !window.firebase.firestore) return noop;

      var coll = db.collection(PRESENCE[kind] || PRESENCE.app);
      var ref  = coll.doc(_sessionId());
      var timer = null;
      var stopped = false;
      var sweeps = 0;

      function hidden() {
        try { return document.visibilityState === 'hidden'; } catch (_) { return false; }
      }

      function beat() {
        return ref.set(
          { lastSeen: window.firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        ).catch(function (e) {
          _warn('[userCount] presence beat on ' + (PRESENCE[kind] || PRESENCE.app) + ' failed:',
            e && (e.code || e.message || e));
        });
      }

      function count() {
        var cutoff = window.firebase.firestore.Timestamp.fromMillis(Date.now() - LIVE_WINDOW_MS);
        var q = coll.where('lastSeen', '>', cutoff);
        // Prefer the count() aggregate (one read regardless of how many are
        // live); fall back to a capped document read on SDKs without it.
        var p = (typeof q.count === 'function')
          ? q.count().get().then(function (agg) { return agg.data().count; })
          : q.limit(LIVE_CAP).get().then(function (snap) { return snap.size; });
        return p.then(function (n) {
          _log('[userCount] ' + (PRESENCE[kind] || PRESENCE.app) + ': ' + n + ' live');
          if (!stopped && typeof onCount === 'function') onCount(n);
          return n;
        }).catch(function (e) {
          _warn('[userCount] live count on ' + (PRESENCE[kind] || PRESENCE.app) + ' failed:',
            e && (e.code || e.message || e));
        });
      }

      // Sweep abandoned documents now and then so the collection doesn't grow
      // without bound. Every 10th tick, a handful at a time, failures ignored —
      // it's tidying, not correctness (the lastSeen window already excludes them).
      function sweep() {
        if (sweeps++ % 10 !== 0) return;
        var old = window.firebase.firestore.Timestamp.fromMillis(Date.now() - STALE_MS);
        coll.where('lastSeen', '<', old).limit(10).get()
          .then(function (snap) { snap.forEach(function (d) { d.ref.delete().catch(function () {}); }); })
          .catch(function () {});
      }

      function tick() {
        if (stopped || hidden()) return;
        beat().then(count).then(sweep);
      }

      tick();
      timer = setInterval(tick, BEAT_MS);
      // Coming back to a backgrounded tab should refresh immediately rather
      // than waiting out the rest of the interval.
      try {
        document.addEventListener('visibilitychange', function () { if (!hidden()) tick(); });
      } catch (_) {}
      // Best-effort tidy-up; the 2-minute window covers us when it doesn't land.
      try {
        window.addEventListener('pagehide', function () { ref.delete().catch(function () {}); });
      } catch (_) {}

      return function stop() {
        stopped = true;
        if (timer) clearInterval(timer);
        ref.delete().catch(function () {});
      };
    },

    /**
     * Format a count for display. Fixed en-US grouping so the number reads the
     * same on every device locale — matches fmtCount() on the survival kit's
     * people-helped counter.
     * @param {number} n
     * @returns {string}
     */
    format: function (n) { return Number(n).toLocaleString('en-US'); },
  };

  window.BB.userCount = userCount;
})();
