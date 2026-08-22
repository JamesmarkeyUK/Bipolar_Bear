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
          if (typeof n !== 'number' || !isFinite(n) || n < 0) return self.cached(kind);
          window.BB.storage.set(CACHE_KEY[kind], String(n));
          return n;
        })
        .catch(function () { return self.cached(kind); });
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
        if (counted) {
          var c = self.cached(kind);
          if (c !== null) window.BB.storage.set(CACHE_KEY[kind], String(c + 1));
        }
        return counted;
      }).catch(function () { return false; });
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
        .catch(function () { return false; });
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
