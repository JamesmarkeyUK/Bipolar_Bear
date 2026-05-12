/**
 * Bipolar Anonymous board logic (extracted from inline <script> in
 * anonymous.html). Loads after the Firebase compat SDK and after the
 * shared helpers in <head> (platform.js, debug.js, firebase-config.js).
 *
 * The pre-activation IIFE that picks the initial screen synchronously
 * stays inline in anonymous.html — it MUST run before this file so the
 * verify/board/monika screen is visible during the Firebase boot.
 *
 * High-level structure:
 *   - Beta gate
 *   - Constants & state (YELLOW theme, COLOR_PRESETS, in-memory state)
 *   - Profile getters (read-through to localStorage for bbAnon_* keys)
 *   - Firebase init (initFirebase) + auth-state handler
 *   - boot() — the screen router
 *   - Helpers (esc, initials, timeAgo, _anonEmailHash, ...)
 *   - Screens: setupVerify, setupMonika, setupColor, setupMeds, setupStable, initBoard
 *   - Compose / like / SOS / report / self-delete / admin-delete flows
 *   - Cross-device profile mirror to anonProfiles/{emailHash}
 *
 * innerHTML safety: every innerHTML containing user-supplied content
 * (monika, post body, medication name, email) routes through `esc()` —
 * see the helper at the top of this file.
 *
 * @file js/anonymous.js
 */

// ─────────────────────────────────────────────────────────────────
// Beta gate (web only) — keep in sync with other pages
// ─────────────────────────────────────────────────────────────────
if (!window.Capacitor && location.protocol !== 'file:' && BB.storage.get('WebUnlocked') !== 'true') {
  location.replace('beta.html');
}

// ─────────────────────────────────────────────────────────────────
// Constants & state
// ─────────────────────────────────────────────────────────────────
const YELLOW      = 'var(--brand-secondary)';
const YELLOW_DARK = '#c49e00';
const YELLOW_LT   = '#ffe566';
const ADMIN_EMAIL = 'inbox@jamesmarkey.co.uk';
// True for both the anon web domain and the dedicated Capacitor bundle.
// See BB.isAnonymousApp() in js/shared/brand-config.js — native shells
// can't be detected by hostname alone.
const _isAnonymousApp = BB.isAnonymousApp();

const COLOR_PRESETS = [
  { key: 'orange', g1: '#ffb340', g2: '#e07800' },
  { key: 'blue',   g1: '#64b5f6', g2: '#1565c0' },
  { key: 'purple', g1: '#ce93d8', g2: '#7b1fa2' },
  { key: 'green',  g1: '#81c784', g2: '#2e7d32' },
  { key: 'pink',   g1: '#f48fb1', g2: '#c2185b' },
  { key: 'teal',   g1: '#4dd0e1', g2: '#00838f' },
];

let db = null;
let currentTab      = 'general';
let unsubTabListeners = { announcements: null, general: null };
let postsByTab        = { announcements: [], general: [] };
// Millisecond timestamp of when the user last had each tab open
const lastSeenMs = {
  announcements: parseInt(BB.storage.get('Anon_lastSeen_announcements') || '0', 10),
  general:       parseInt(BB.storage.get('Anon_lastSeen_general')       || '0', 10),
};
let localPosts      = [];
let sosTargetName   = '';
let reportTargetId  = '';
let adminDeleteId    = '';
let selfDeleteId     = '';
let commentTargetId  = '';
let currentThreadUnsub = null;
let _bbUser         = null; // Firebase-auth verified user (BB App path)
let _boardSetupDone = false; // initBoard's one-time handler wiring (compose, FAB, tabs, overlays)

// Persisted user profile (localStorage)
const profile = {
  get monika()      { return BB.storage.get('Anon_monika')    || ''; },
  get verified()    { return BB.storage.get('Anon_verified')  === 'true'; },
  get showMeds()    { return BB.storage.get('Anon_showMeds')    === 'true'; },
  get showStable()  { return BB.storage.get('Anon_showStable') === 'true'; },
  get stableStreak(){ return parseInt(BB.storage.get('Anon_stableStreak') || '0', 10); },
  get stableSince() { return BB.storage.get('Anon_stableSince') || ''; }, // standalone: YYYY-MM-DD
  get med()         { return BB.storage.get('Anon_med')       || ''; },
  get medList()     {
    try {
      const s = BB.storage.get('Anon_medList');
      if (s) return JSON.parse(s);
      const m = BB.storage.get('Anon_med');
      return m ? [{ name: m, dosage: '' }] : [];
    } catch(e) { return []; }
  },
  get hasPosted()   { return BB.storage.get('Anon_hasPosted') === 'true'; },
  get isAdmin()     { return BB.storage.get('Anon_isAdmin')   === 'true'; },
  get colorKey()    { return BB.storage.get('Anon_colorKey')  || 'orange'; },
  get grad1()       { const p = COLOR_PRESETS.find(c => c.key === this.colorKey); return p ? p.g1 : YELLOW_LT; },
  get grad2()       { const p = COLOR_PRESETS.find(c => c.key === this.colorKey); return p ? p.g2 : YELLOW_DARK; },
  get customInit()  { return BB.storage.get('Anon_initials')  || ''; },
  avatarInitials()  { return this.customInit || initials(this.monika); },
  // Pull streak from journal if available, else default to 1
  get streak()      { return parseInt(BB.storage.get('Anon_streak') || '1', 10); },
  // ISO timestamp of "Bipolar Bear birthday" — earliest of BB account
  // creation and anon profile creation. Resolved by _resolveJoinedAt().
  get joinedAt()    { return BB.storage.get('Anon_joinedAt')   || ''; },
};

// Liked posts set (persisted)
const likedPosts = new Set(
  JSON.parse(BB.storage.get('Anon_liked') || '[]')
);
function saveLiked() {
  BB.storage.set('Anon_liked', JSON.stringify([...likedPosts]));
}

// ─────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────
function initFirebase() {
  try {
    if (!firebase.apps.length) {
      // Config lives in js/shared/firebase-config.js so every page reads the
      // same source of truth.
      firebase.initializeApp(window.BB_FIREBASE_CONFIG);
    }
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    // Expose callable functions for email verification
    const _fns = firebase.app().functions('europe-west1');
    window._anonSendCode   = _fns.httpsCallable('sendAnonCode');
    window._anonVerifyCode = _fns.httpsCallable('verifyAnonCode');
    window._anonGetBBStats = _fns.httpsCallable('getBBStats');

    // Auth state handler — routes on first load, handles sign-out while on board
    let _anonInitialBoot = false;
    firebase.auth().onAuthStateChanged(async function(user) {
      const isReal = user && !user.isAnonymous;

      if (!_anonInitialBoot) {
        _anonInitialBoot = true;
        // Reload to get fresh emailVerified status
        if (isReal) await user.reload().catch(() => {});
        boot(isReal ? firebase.auth().currentUser : null);
        return;
      }

      // Subsequent auth changes — sign-out while on board (Firebase-auth path only)
      if (!isReal && BB.storage.get('Anon_verified') === 'true' && !BB.storage.get('Anon_email')) {
        BB.storage.remove('Anon_verified');
        BB.storage.remove('Anon_isAdmin');
        stopAllListeners();
        boot(null);
      }
    });
  } catch (e) {
    console.warn('[Anonymous] Firebase init failed — running offline', e);
  }
}
if (typeof firebase !== 'undefined') {
  initFirebase();
} else {
  window.addEventListener('load', () => { if (typeof firebase !== 'undefined') initFirebase(); });
}

// ─────────────────────────────────────────────────────────────────
// Screen routing
// ─────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.getElementById('app-shell').style.opacity = '1';
}

async function boot(user) {
  const isReal = user && !user.isAnonymous;
  // Treat any BipolarBear-signed-in user as "the BB user" — the anon board
  // verifies email itself via the code flow below, so we don't gate on
  // user.emailVerified here. Pre-fill + save-back keeps the BB account and
  // the anon email connected.
  _bbUser = isReal ? user : null;
  _updateLogoCursor();
  // Show "← Home" on verify/monika screens only for BB App users (Firebase Auth)
  ['verify-back-btn', 'monika-back-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = isReal ? '' : 'none';
  });

  if (isReal && user.emailVerified) {
    // Signed in to BipolarBear with verified email — skip code verification
    // Set/clear admin flag based on Firebase Auth email
    if (user.email && user.email.toLowerCase() === ADMIN_EMAIL) {
      BB.storage.set('Anon_isAdmin', 'true');
    } else {
      BB.storage.remove('Anon_isAdmin');
    }
    // Mark as verified for the synchronous pre-activation hint on next visit.
    // Cleared on sign-out by the auth-change handler above.
    BB.storage.set('Anon_verified', 'true');
    // Restore full anon profile (monika, meds, stable, etc.) from userSettings
    await _bbRestoreProfile(user.uid);
    if (profile.monika) {
      showScreen('board');
      initBoard();
    } else {
      showScreen('monika');
      setupMonika();
    }
  } else if (profile.verified && profile.monika) {
    // Standalone verified (email code path, not signed in to main app)
    // Refresh stats from Firestore on every visit so stableStreak / joinedAt
    // stay current without requiring a fresh email verification.
    const savedEmail = BB.storage.get('Anon_email');
    if (savedEmail) await _anonRestoreProfile(savedEmail);
    showScreen('board');
    initBoard();
  } else if (profile.verified) {
    showScreen('monika');
    setupMonika();
  } else {
    // Not verified — show email+code verify screen
    showScreen('verify');
    setupVerify();
  }
}

// ─────────────────────────────────────────────────────────────────
// Overlay helpers
// ─────────────────────────────────────────────────────────────────
function openOv(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeOv(id) { document.getElementById(id).classList.add('hidden'); }

// ─────────────────────────────────────────────────────────────────
// About overlay + home navigation helper
// ─────────────────────────────────────────────────────────────────
function openAbout() { openOv('ov-about'); }
document.getElementById('about-close').addEventListener('click', () => closeOv('ov-about'));

// Stamp the shared web app version (from brand-config.js) into the About footer.
(function () {
  const el = document.getElementById('about-version');
  if (el && window._APP_VERSION) el.textContent = 'v' + window._APP_VERSION;
})();

// _goHome() is called from inline onclick attributes on onboarding screens
// and the board logo. Navigates appropriately for the current bundle.
function _goHome() {
  if (_bbUser) {
    // In the native app navigate within the app; on the web go to the public homepage
    if (window.Capacitor || location.protocol === 'file:') { location.replace('index.html'); }
    else { location.href = 'https://bipolarbear.app'; }
  } else if (!_isAnonymousApp) { location.replace('index.html'); }
  // standalone users in the anonymous app (web or native): do nothing —
  // they're already at the only "home" their bundle has.
}

function _updateLogoCursor() {
  const btn = document.getElementById('board-logo-btn');
  if (!btn) return;
  if (_bbUser) {
    btn.style.cursor = 'pointer';
    btn.title = 'Back to Bipolar Bear';
  } else {
    btn.style.cursor = 'default';
    btn.title = '';
  }
}

// Close on backdrop tap
['ov-compose','ov-firstpost','ov-sos','ov-report','ov-e2ee','ov-monika','ov-self-delete','ov-admin-delete','ov-med','ov-stable','ov-about'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeOv(id);
  });
});
// Thread overlay needs special handling to also unsubscribe the comments listener
document.getElementById('ov-thread').addEventListener('click', e => {
  if (e.target === document.getElementById('ov-thread')) closeThread();
});

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────
function initials(name) { return (name || '??').slice(0, 2).toUpperCase(); }

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Whitelist a hex colour for inline `style=` interpolation. Anything that
// doesn't match a plain `#rgb`/`#rrggbb`/`#rrggbbaa` falls back to the
// default — prevents Firestore-stored gradients from breaking out of the
// style attribute.
function safeColor(c, fallback) {
  return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : fallback;
}

// Coerce a Firestore value to a finite number for safe HTML interpolation.
// Strings, NaN, Infinity, etc. all fall back to `fallback`.
function num(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function timeAgo(ts) {
  if (!ts) return 'now';
  const ms = ts.toMillis ? ts.toMillis() : (ts instanceof Date ? ts.getTime() : ts);
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return 'now';
  if (s < 3600)  return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// ─────────────────────────────────────────────────────────────────
// Bipolar Bear birthday — joined-date resolution + formatting
// ─────────────────────────────────────────────────────────────────
// Picks the earliest known join date between the BB Firebase Auth
// account (metadata.creationTime) and any previously-stored anon
// profile date. First-time standalone users get "today". The result
// is cached in localStorage and mirrored to Firestore via the
// profile-save helpers.
function _resolveJoinedAt() {
  const candidates = [];
  const stored = BB.storage.get('Anon_joinedAt');
  if (stored) candidates.push(stored);
  if (_bbUser && _bbUser.metadata && _bbUser.metadata.creationTime) {
    const ct = new Date(_bbUser.metadata.creationTime);
    if (!isNaN(ct.getTime())) candidates.push(ct.toISOString());
  }
  let earliest;
  if (candidates.length) {
    candidates.sort();
    earliest = candidates[0];
  } else {
    earliest = new Date().toISOString();
  }
  if (earliest !== stored) BB.storage.set('Anon_joinedAt', earliest);
  return earliest;
}

// Compact "Xy Yd" / "Yd" used on the user pill and post header.
function _birthdayCompact(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const days = Math.floor(ms / 86400000);
  if (days < 1) return '';
  const years = Math.floor(days / 365);
  const rem = days - years * 365;
  return years > 0 ? `${years}y ${rem}d` : `${days}d`;
}

// Verbose "1 year, 23 days old" used in the Monika overlay.
function _birthdayVerbose(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const days = Math.floor(ms / 86400000);
  const years = Math.floor(days / 365);
  const rem = days - years * 365;
  const yPart = years === 1 ? '1 year' : `${years} years`;
  const dPart = rem === 1 ? '1 day'   : `${rem} days`;
  return years > 0 ? `${yPart}, ${dPart} old` : `${dPart} old`;
}

// Localised "10 May 2026" for the Monika overlay row.
function _birthdayDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

function getLatestRealPost(tab) {
  const real = localPosts.filter(p => p.tab === tab && !p.deleted);
  if (!real.length) return null;
  return real.reduce((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? 0;
    const tb = b.timestamp?.toMillis?.() ?? 0;
    return tb > ta ? b : a;
  });
}

function isSelfDeleteEligible(post) {
  if ((post.likes || 0) > 0) return true;
  const ts = post.timestamp?.toMillis?.() ?? 0;
  return !localPosts.some(p =>
    p.id !== post.id && p.tab === post.tab && !p.deleted &&
    (p.timestamp?.toMillis?.() ?? 0) > ts
  );
}

function showHint(msg) {
  const h = document.getElementById('fab-hint');
  h.textContent = msg;
  h.classList.add('show');
  clearTimeout(h._t);
  h._t = setTimeout(() => h.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────────────────────────────
// SCREEN: Verify
// ─────────────────────────────────────────────────────────────────
function setupVerify() {
  const emailIn   = document.getElementById('email-input');
  const sendBtn   = document.getElementById('send-code-btn');
  const verifyBtn = document.getElementById('verify-btn');
  const boxes     = document.querySelectorAll('.code-box');
  const errDiv    = document.getElementById('verify-error');
  let   _pendingEmail = '';
  let   _sessionId    = null;

  function showError(msg) {
    errDiv.textContent   = msg;
    errDiv.style.display = 'block';
  }
  function clearError() {
    errDiv.style.display = 'none';
    errDiv.textContent   = '';
  }

  function _validateEmail() {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailIn.value.trim());
    sendBtn.disabled = !ok;
    emailIn.classList.toggle('valid', ok);
  }

  // Ensure email field is editable and wired for validation
  emailIn.readOnly    = false;
  emailIn.placeholder = 'your@email.com';
  emailIn.style.background = '';
  emailIn.style.color      = '';
  emailIn.style.cursor     = '';

  // Pre-fill the BipolarBear account email when the user is signed in via
  // the main app — saves typing and lets us link the verified anon email
  // back to their user account afterwards. Editable: they may want to use
  // a different inbox.
  if (!emailIn.value && _bbUser && _bbUser.email) {
    emailIn.value = _bbUser.email;
  }

  emailIn.addEventListener('input',   _validateEmail);
  emailIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !sendBtn.disabled) sendBtn.click(); });

  // Run once so button state matches whatever is already in the field
  _validateEmail();

  function getCode() { return Array.from(boxes).map(b => b.value).join(''); }

  function resetBoxes() {
    boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
    verifyBtn.disabled = true;
  }

  function goToEmailStep() {
    clearError();
    resetBoxes();
    _sessionId = null;
    document.getElementById('step-code').style.display  = 'none';
    document.getElementById('step-email').style.display = 'block';
    emailIn.focus();
  }

  async function doSend(email) {
    if (profile.verified) return;
    clearError();
    sendBtn.disabled = true;
    const origText = sendBtn.textContent;
    sendBtn.textContent = 'Sending…';
    try {
      if (!window._anonSendCode) {
        throw new Error('Verification service unavailable — please try again in a moment.');
      }
      const result = await window._anonSendCode({ email });
      _sessionId    = result.data.sessionId;
      _pendingEmail = email;
      document.getElementById('step-email').style.display = 'none';
      document.getElementById('step-code').style.display  = 'block';
      document.getElementById('code-sent-label').innerHTML =
        `Code sent to <strong>${esc(email)}</strong>. Check your inbox (and spam folder).`;
      resetBoxes();
      boxes[0].focus();
    } catch (err) {
      sendBtn.disabled    = false;
      sendBtn.textContent = origText;
      const errCode = err.code || '';
      if (errCode === 'functions/resource-exhausted') {
        showError('Too many code requests. Please wait 10 minutes and try again.');
      } else if (errCode === 'functions/invalid-argument') {
        showError('Please enter a valid email address.');
      } else {
        showError(err.message || 'Could not send verification code. Please try again.');
      }
    }
  }

  sendBtn.onclick = () => doSend(emailIn.value.trim());

  // Code box navigation + input
  boxes.forEach((box, i) => {
    box.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '');
      box.value = v ? v[0] : '';
      box.classList.toggle('filled', !!box.value);
      if (box.value && boxes[i + 1]) boxes[i + 1].focus();
      verifyBtn.disabled = getCode().length < boxes.length;
      clearError();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && boxes[i - 1]) {
        boxes[i - 1].focus();
        boxes[i - 1].value = '';
        boxes[i - 1].classList.remove('filled');
        verifyBtn.disabled = true;
      }
    });
    // Paste the full code at once
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, boxes.length);
      if (!digits) return;
      boxes.forEach((b, j) => {
        b.value = digits[j] || '';
        b.classList.toggle('filled', !!b.value);
      });
      const nextIdx = Math.min(digits.length, boxes.length - 1);
      boxes[nextIdx].focus();
      verifyBtn.disabled = getCode().length < boxes.length;
    });
  });

  verifyBtn.addEventListener('click', async () => {
    const code = getCode();
    if (code.length < boxes.length || !_sessionId) return;
    clearError();
    verifyBtn.disabled  = true;
    const origText = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying…';
    try {
      await window._anonVerifyCode({ sessionId: _sessionId, code });
      // ✅ Verified
      if (_pendingEmail.toLowerCase() === ADMIN_EMAIL) {
        BB.storage.set('Anon_isAdmin', 'true');
      }
      BB.storage.set('Anon_verified', 'true');
      BB.storage.set('Anon_email', _pendingEmail);

      // If the user is signed in via the BipolarBear app, link the verified
      // anon email to their user account so it can be used for future
      // recovery / cross-device restore, then pull any existing anon profile
      // they've already set up against this account (uid lookup beats
      // email-hash lookup).
      if (_bbUser && db) {
        db.collection('userSettings').doc(_bbUser.uid)
          .set({ anonEmail: _pendingEmail }, { merge: true }).catch(() => {});
        await _bbRestoreProfile(_bbUser.uid);
      }
      // Standalone path: email-hash lookup. _anonRestoreProfile no-ops when
      // _bbUser is set, so safe to call unconditionally.
      const _restored = await _anonRestoreProfile(_pendingEmail);

      // If the verified email belongs to a BipolarBear account, pull the
      // stability streak and account creation date so they show up on the
      // anonymous board even if the user has never visited while logged into BB.
      // Only fills gaps — never overwrites data already restored above.
      if (!_bbUser && window._anonGetBBStats) {
        try {
          const bbRes = await window._anonGetBBStats({ sessionId: _sessionId });
          if (bbRes.data && bbRes.data.bbLinked) {
            const { stableStreak, stableSince, accountCreatedAt } = bbRes.data;
            if (stableSince && !BB.storage.get('Anon_stableSince')) {
              BB.storage.set('Anon_stableSince', stableSince);
              const days = Math.max(0, Math.floor(
                (Date.now() - new Date(stableSince).getTime()) / 86400000
              ));
              BB.storage.set('Anon_stableStreak', String(stableStreak || days));
              // First-time BB stats pull — auto-show the badge so it's visible
              BB.storage.set('Anon_showStable', 'true');
            }
            if (accountCreatedAt) {
              const existing = BB.storage.get('Anon_joinedAt');
              if (!existing || accountCreatedAt < existing) {
                BB.storage.set('Anon_joinedAt', accountCreatedAt);
              }
            }
          }
        } catch (_) { /* best-effort — BB stats are supplemental */ }
      }

      if (profile.monika || _restored) {
        showScreen('board');
        initBoard();
      } else {
        showScreen('monika');
        setupMonika();
      }
    } catch (err) {
      verifyBtn.disabled  = false;
      verifyBtn.textContent = origText;
      const errCode = err.code || '';
      if (errCode === 'functions/unauthenticated') {
        // Wrong code — message already includes "X attempts remaining"
        showError(err.message || 'Incorrect code. Please try again.');
        resetBoxes();
        boxes[0].focus();
      } else if (errCode === 'functions/deadline-exceeded') {
        showError('This code has expired. Sending a new one…');
        resetBoxes();
        setTimeout(() => doSend(_pendingEmail), 1200);
      } else if (errCode === 'functions/resource-exhausted') {
        showError('Too many incorrect attempts. Please request a new code.');
        goToEmailStep();
      } else if (errCode === 'functions/not-found') {
        showError('Verification session not found. Please start again.');
        goToEmailStep();
      } else {
        showError(err.message || 'Verification failed. Please try again.');
        resetBoxes();
        boxes[0].focus();
      }
    }
  });

  // Resend code
  document.getElementById('resend-btn').addEventListener('click', () => {
    if (!_pendingEmail) { goToEmailStep(); return; }
    resetBoxes();
    clearError();
    doSend(_pendingEmail);
  });

  // Back to email step
  document.getElementById('back-to-email-btn').addEventListener('click', goToEmailStep);
}

// ─────────────────────────────────────────────────────────────────
// SCREEN: Monika
// ─────────────────────────────────────────────────────────────────
async function isMonikaInUse(monika, ownMonika) {
  if (!db) return false;
  if (ownMonika && monika.toLowerCase() === ownMonika.toLowerCase()) return false;
  const doc = await db.collection(BB_BRAND.collections.monikas).doc(monika.toLowerCase()).get();
  return doc.exists;
}

function setupMonika() {
  const input   = document.getElementById('monika-input');
  const counter = document.getElementById('monika-counter');
  const preview = document.getElementById('monika-preview');
  const av      = document.getElementById('monika-av');
  const pvName  = document.getElementById('monika-preview-name');
  const btn     = document.getElementById('monika-btn');
  const streak  = profile.streak;

  input.addEventListener('input', () => {
    const v = input.value.slice(0, 10);
    input.value = v;
    counter.textContent  = `${v.length}/10`;
    counter.style.color  = v.length >= 8 ? '#e55' : 'var(--muted)';
    input.classList.toggle('valid', v.length >= 2);
    btn.disabled = v.length < 2;
    if (v.length >= 2) {
      av.textContent    = initials(v);
      pvName.textContent = `[${v}] 🔥 ${streak}d`;
      preview.classList.add('show');
    } else {
      preview.classList.remove('show');
    }
  });

  btn.addEventListener('click', async () => {
    const monika = input.value.trim();
    if (monika.length < 2) return;
    const errEl = document.getElementById('monika-error');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      if (await isMonikaInUse(monika, null)) {
        errEl.textContent  = 'That name is already taken — please choose another.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'That\'s me →';
        return;
      }
    } catch (e) { /* network error — allow through */ }
    errEl.style.display = 'none';
    BB.storage.set('Anon_monika', monika);
    if (db) db.collection(BB_BRAND.collections.monikas).doc(monika.toLowerCase()).set({ monika, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
    _bbSaveProfile(); // persist monika to userSettings for cross-device recovery
    showScreen('meds');
    setupMeds();
  });
}

// ─────────────────────────────────────────────────────────────────
// SCREEN: Medication visibility
// ─────────────────────────────────────────────────────────────────
function setupMeds() {
  document.getElementById('meds-yes').onclick = async () => {
    BB.storage.set('Anon_showMeds', 'true');
    // For BB App users, pre-populate med list from their Firestore data
    if (_bbUser && db) {
      try {
        const snap = await db.collection('userSettings').doc(_bbUser.uid).get();
        if (snap.exists) {
          const list = snap.data().currentMedList || [];
          if (list.length > 0) {
            BB.storage.set('Anon_medList', JSON.stringify(list));
            BB.storage.set('Anon_med', list.map(m => m.name).filter(Boolean).join(', '));
          }
        }
      } catch(e) { /* silently fail — user can add manually */ }
    }
    showScreen('med-define');
    setupMedDefine(() => { showScreen('board'); initBoard(); });
  };
  document.getElementById('meds-no').onclick = () => {
    BB.storage.set('Anon_showMeds', 'false');
    showScreen('board');
    initBoard();
  };
}

// ─────────────────────────────────────────────────────────────────
// Med helpers
// ─────────────────────────────────────────────────────────────────
function _anonGetMedList() {
  try {
    const s = BB.storage.get('Anon_medList');
    if (s) return JSON.parse(s);
    const m = BB.storage.get('Anon_med');
    return m ? [{ name: m, dosage: '' }] : [];
  } catch(e) { return []; }
}

async function _anonSaveMedList(list) {
  BB.storage.set('Anon_medList', JSON.stringify(list));
  const medStr = list.map(m => m.name).filter(Boolean).join(', ');
  BB.storage.set('Anon_med', medStr);
  // Sync back to BB App if the user is signed into BipolarBear
  if (_bbUser && db) {
    try {
      await db.collection('userSettings').doc(_bbUser.uid).set(
        { currentMedList: list }, { merge: true }
      );
    } catch(e) { console.warn('[Anonymous] medList sync failed', e); }
  }
}

// ─────────────────────────────────────────────────────────────────
// Standalone profile persistence (Firestore, keyed by email hash)
// ─────────────────────────────────────────────────────────────────

// SHA-256 of email — never the raw address, so it's not directly linkable
async function _anonEmailHash(email) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(email.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Write current profile to anonProfiles/{hash}. No-op for BB users (they use userSettings).
async function _anonSaveProfile() {
  if (!db || _bbUser) return;
  const email = BB.storage.get('Anon_email');
  if (!email) return;
  try {
    const hash = await _anonEmailHash(email);
    await db.collection('anonProfiles').doc(hash).set({
      monika:       profile.monika      || null,
      colorKey:     profile.colorKey    || 'orange',
      customInit:   profile.customInit  || '',
      showMeds:     profile.showMeds,
      medList:      _anonGetMedList(),
      showStable:   profile.showStable,
      stableSince:  profile.stableSince || null,
      stableStreak: profile.stableStreak,
      visitStreak:  parseInt(BB.storage.get('Anon_streak') || '0', 10),
      visitDate:    BB.storage.get('AnonVisitDate') || null,
      joinedAt:     profile.joinedAt    || null,
      updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch(e) { console.warn('[Anonymous] profile save failed', e); }
}

// Read profile from Firestore and restore localStorage. Returns true if a monika was found.
async function _anonRestoreProfile(email) {
  if (!db) return false;
  try {
    const hash = await _anonEmailHash(email);
    const doc  = await db.collection('anonProfiles').doc(hash).get();
    if (!doc.exists) return false;
    const d = doc.data();
    if (d.monika)              BB.storage.set('Anon_monika',   d.monika);
    if (d.colorKey)            BB.storage.set('Anon_colorKey', d.colorKey);
    if (d.customInit !== undefined) BB.storage.set('Anon_initials', d.customInit || '');
    if (d.showMeds   !== undefined) BB.storage.set('Anon_showMeds', d.showMeds ? 'true' : 'false');
    if (d.medList && d.medList.length > 0) {
      BB.storage.set('Anon_medList', JSON.stringify(d.medList));
      BB.storage.set('Anon_med', d.medList.map(m => m.name).filter(Boolean).join(', '));
    }
    if (d.showStable !== undefined) BB.storage.set('Anon_showStable', d.showStable ? 'true' : 'false');
    if (d.stableSince) {
      BB.storage.set('Anon_stableSince', d.stableSince);
      // Recompute days since (it grows each day automatically)
      const days = Math.max(0, Math.floor((Date.now() - new Date(d.stableSince).getTime()) / 86400000));
      BB.storage.set('Anon_stableStreak', String(days));
    }
    if (typeof d.visitStreak === 'number') BB.storage.set('Anon_streak',  String(d.visitStreak));
    if (d.visitDate)                       BB.storage.set('AnonVisitDate', d.visitDate);
    if (d.joinedAt)                        BB.storage.set('Anon_joinedAt', d.joinedAt);
    return !!d.monika;
  } catch(e) {
    console.warn('[Anonymous] profile restore failed', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// BB App user profile persistence (userSettings/{uid}.anonProfile)
// ─────────────────────────────────────────────────────────────────

// Restore monika + settings from userSettings into localStorage. Called on boot before screen routing.
async function _bbRestoreProfile(uid) {
  if (!db || !uid) return;
  try {
    const doc = await db.collection('userSettings').doc(uid).get();
    const d   = doc.exists ? doc.data() : {};
    // Stable streak is computed by journal.html and stored flat
    if (typeof d.stableStreak === 'number') {
      BB.storage.set('Anon_stableStreak', String(d.stableStreak));
    }
    // Anon board profile is nested under anonProfile
    let ap = d.anonProfile || {};
    // Fallback: if this BB account has never been used to set up an anon
    // profile but the same email already verified on bipolaranonymous.app
    // (standalone path), pull the existing monika+settings from
    // anonProfiles/{hash(email)} so the user doesn't get prompted to pick a
    // second monika. We then copy it into userSettings/{uid}.anonProfile so
    // future sessions take the fast path.
    if (!ap.monika && _bbUser && _bbUser.email) {
      try {
        const hash    = await _anonEmailHash(_bbUser.email);
        const anonDoc = await db.collection('anonProfiles').doc(hash).get();
        if (anonDoc.exists && anonDoc.data().monika) {
          ap = anonDoc.data();
          db.collection('userSettings').doc(uid).set(
            { anonProfile: ap }, { merge: true }
          ).catch(() => {});
        }
      } catch (_) { /* best-effort */ }
    }
    if (ap.monika)                   BB.storage.set('Anon_monika',      ap.monika);
    if (ap.colorKey)                 BB.storage.set('Anon_colorKey',    ap.colorKey);
    if (ap.customInit !== undefined) BB.storage.set('Anon_initials',    ap.customInit || '');
    if (ap.showMeds   !== undefined) BB.storage.set('Anon_showMeds',    ap.showMeds   ? 'true' : 'false');
    if (ap.showStable !== undefined) {
      BB.storage.set('Anon_showStable', ap.showStable ? 'true' : 'false');
    } else if (typeof d.stableStreak === 'number' && d.stableStreak > 0 && !BB.storage.get('Anon_showStable')) {
      // Not yet configured via anon board — auto-show since BB account has a streak
      BB.storage.set('Anon_showStable', 'true');
    }
    // Fall back to the journal-computed stableStreakStart when the anon profile
    // hasn't stored its own stableSince yet (e.g. first visit to the board).
    const resolvedStableSince = ap.stableSince || d.stableStreakStart || null;
    if (resolvedStableSince) BB.storage.set('Anon_stableSince', resolvedStableSince);
    const medList = ap.medList && ap.medList.length ? ap.medList : (d.currentMedList || []);
    if (medList.length) {
      BB.storage.set('Anon_medList', JSON.stringify(medList));
      BB.storage.set('Anon_med', medList.map(m => m.name).filter(Boolean).join(', '));
    }
    if (typeof ap.visitStreak === 'number') BB.storage.set('Anon_streak',     String(ap.visitStreak));
    if (ap.visitDate)                       BB.storage.set('AnonVisitDate',    ap.visitDate);
    // Use the earliest of anonProfile.joinedAt and the BB account creation date
    // so the birthday always reflects when the user first joined BipolarBear.
    let resolvedJoinedAt = ap.joinedAt || null;
    if (_bbUser && _bbUser.metadata && _bbUser.metadata.creationTime) {
      const creationISO = new Date(_bbUser.metadata.creationTime).toISOString();
      if (!resolvedJoinedAt || creationISO < resolvedJoinedAt) resolvedJoinedAt = creationISO;
    }
    if (resolvedJoinedAt)  BB.storage.set('Anon_joinedAt', resolvedJoinedAt);
    // Mirror restored profile to anonProfiles so standalone email-code path
    // can restore it on a fresh browser/device without needing Firebase Auth.
    if (ap.monika && _bbUser && _bbUser.email) {
      _anonEmailHash(_bbUser.email).then(hash =>
        db.collection('anonProfiles').doc(hash).set({
          monika:      ap.monika,
          colorKey:    ap.colorKey    || 'orange',
          customInit:  ap.customInit  || '',
          showMeds:    !!ap.showMeds,
          medList:     medList,
          showStable:  !!ap.showStable,
          stableSince: resolvedStableSince,
          visitStreak: ap.visitStreak || 0,
          visitDate:   ap.visitDate   || null,
          joinedAt:    resolvedJoinedAt,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      ).catch(() => {});
    }
  } catch(e) { console.warn('[BB] _bbRestoreProfile failed', e); }
}

// Save current anon board profile into userSettings/{uid}.anonProfile
// and mirror to anonProfiles/{hash} so the standalone email-code path
// can restore the same profile on a fresh browser/device.
function _bbSaveProfile() {
  if (!_bbUser || !db) return;
  const data = {
    monika:      profile.monika     || null,
    colorKey:    profile.colorKey   || 'orange',
    customInit:  profile.customInit || '',
    showMeds:    profile.showMeds,
    medList:     _anonGetMedList(),
    showStable:  profile.showStable,
    stableSince: profile.stableSince || null,
    visitStreak: parseInt(BB.storage.get('Anon_streak') || '0', 10),
    visitDate:   BB.storage.get('AnonVisitDate') || null,
    joinedAt:    profile.joinedAt   || null,
    verified:    BB.storage.get('Anon_verified') === 'true',
  };
  db.collection('userSettings').doc(_bbUser.uid).set(
    { anonProfile: data }, { merge: true }
  ).catch(e => console.warn('[BB] _bbSaveProfile failed', e));
  // Mirror to anonProfiles so standalone email-code path finds the profile
  if (_bbUser.email) {
    _anonEmailHash(_bbUser.email).then(hash =>
      db.collection('anonProfiles').doc(hash).set(
        { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      )
    ).catch(e => console.warn('[BB] _bbSaveProfile mirror failed', e));
  }
}

// ─────────────────────────────────────────────────────────────────
// SCREEN: Medication entry (onboarding + editing from settings)
// ─────────────────────────────────────────────────────────────────
function setupMedDefine(onDone) {
  let medList = _anonGetMedList();

  // Contextual subtitle
  const sub = document.getElementById('med-define-sub');
  if (sub) {
    if (_bbUser && medList.length > 0) {
      sub.textContent = 'These are your current medications from BipolarBear. Edit or add more, then continue.';
    } else if (_bbUser) {
      sub.textContent = 'Add your current medications. Changes will also update your BipolarBear app.';
    } else {
      sub.textContent = 'Add your current medications. Only the name is visible on posts — dosage stays private.';
    }
  }

  function renderList() {
    const el = document.getElementById('anon-med-list-wrap');
    if (!el) return;
    if (!medList.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;margin:4px 0 10px;">No medications added yet</p>';
      return;
    }
    el.innerHTML = medList.map((m, i) => `
      <div class="anon-med-tag">
        <span style="flex:1;">💊 <strong>${esc(m.name)}</strong>${m.dosage ? ` <span style="color:var(--muted);font-size:12px;">${esc(m.dosage)}</span>` : ''}</span>
        <button class="anon-med-tag-del" data-idx="${i}">✕</button>
      </div>`).join('');
    el.querySelectorAll('.anon-med-tag-del').forEach(btn => {
      btn.onclick = () => { medList.splice(parseInt(btn.dataset.idx), 1); renderList(); };
    });
  }
  renderList();

  const nameIn = document.getElementById('anon-med-name');
  const doseIn = document.getElementById('anon-med-dose');
  nameIn.value = ''; doseIn.value = '';

  document.getElementById('anon-med-add').onclick = () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return; }
    medList.push({ name, dosage: doseIn.value.trim() });
    nameIn.value = ''; doseIn.value = '';
    nameIn.focus();
    renderList();
  };
  nameIn.onkeydown = e => { if (e.key === 'Enter') document.getElementById('anon-med-add').click(); };

  document.getElementById('anon-med-continue').onclick = async () => {
    await _anonSaveMedList(medList);
    if (onDone) onDone();
  };
  document.getElementById('anon-med-skip').onclick = () => { if (onDone) onDone(); };
}

// ─────────────────────────────────────────────────────────────────
// Medication settings overlay
// ─────────────────────────────────────────────────────────────────
function openMedSettings() {
  closeOv('ov-monika');
  let medList  = _anonGetMedList().map(m => ({ ...m })); // working copy
  let showMeds = profile.showMeds;

  // Show BB sync note if signed in
  const bbNote = document.getElementById('med-ov-bb-note');
  if (bbNote) bbNote.style.display = _bbUser ? 'block' : 'none';

  function renderList() {
    const el = document.getElementById('med-ov-list');
    if (!el) return;
    if (!medList.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0 8px;">No medications added yet</p>';
      return;
    }
    el.innerHTML = medList.map((m, i) => `
      <div class="anon-med-tag">
        <span style="flex:1;">💊 <strong>${esc(m.name)}</strong>${m.dosage ? ` <span style="color:var(--muted);font-size:12px;">${esc(m.dosage)}</span>` : ''}</span>
        <button class="anon-med-tag-del" data-idx="${i}">✕</button>
      </div>`).join('');
    el.querySelectorAll('.anon-med-tag-del').forEach(btn => {
      btn.onclick = () => { medList.splice(parseInt(btn.dataset.idx), 1); renderList(); };
    });
  }

  function updateToggle() {
    document.getElementById('med-ov-show').classList.toggle('active', showMeds);
    document.getElementById('med-ov-hide').classList.toggle('active', !showMeds);
  }

  renderList();
  updateToggle();

  document.getElementById('med-ov-show').onclick = () => { showMeds = true;  updateToggle(); };
  document.getElementById('med-ov-hide').onclick = () => { showMeds = false; updateToggle(); };

  const nameIn = document.getElementById('med-ov-name');
  const doseIn = document.getElementById('med-ov-dose');
  nameIn.value = ''; doseIn.value = '';

  document.getElementById('med-ov-add').onclick = () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return; }
    medList.push({ name, dosage: doseIn.value.trim() });
    nameIn.value = ''; doseIn.value = '';
    renderList();
  };
  nameIn.onkeydown = e => { if (e.key === 'Enter') document.getElementById('med-ov-add').click(); };

  document.getElementById('med-ov-cancel').onclick = () => closeOv('ov-med');
  document.getElementById('med-ov-save').onclick = async () => {
    BB.storage.set('Anon_showMeds', showMeds ? 'true' : 'false');
    await _anonSaveMedList(medList);
    _anonSaveProfile(); _bbSaveProfile();
    closeOv('ov-med');
    showHint('Medication updated ✓');
  };

  openOv('ov-med');
}

// ─────────────────────────────────────────────────────────────────
// SCREEN: Board
// ─────────────────────────────────────────────────────────────────
function _updateAnonStreak() {
  const today     = new Date().toISOString().slice(0, 10);
  const lastDate  = BB.storage.get('AnonVisitDate') || '';
  if (lastDate === today) return; // already counted today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const prev      = parseInt(BB.storage.get('Anon_streak') || '0', 10);
  const streak    = lastDate === yesterday ? prev + 1 : 1;
  BB.storage.set('Anon_streak',  String(streak));
  BB.storage.set('AnonVisitDate', today);
}

function initBoard() {
  BB.storage.set('AnonLastVisit', Date.now());
  _updateAnonStreak();
  _resolveJoinedAt();
  renderUserPill();
  // One-time DOM handler wiring. initBoard() is reachable from multiple paths
  // (boot, verify success, meds yes/no) — re-running setup* would attach
  // duplicate click handlers to the Post / SOS / report / delete buttons,
  // which is what caused chat messages to be written twice.
  if (!_boardSetupDone) {
    setupTabs();
    setupFAB();
    setupCompose();
    setupThread();
    setupOverlayActions();
    _boardSetupDone = true;
  }
  setTab('general');
  listenPosts(); // starts both tab listeners; setTab no longer does this
  cleanOldPosts();
  _anonSaveProfile(); _bbSaveProfile(); // persist profile to Firestore
}

function renderUserPill() {
  const m  = profile.monika;
  const s  = profile.streak;
  const g1 = profile.grad1;
  const g2 = profile.grad2;
  const av = profile.avatarInitials();
  const bday = _birthdayCompact(profile.joinedAt);
  document.getElementById('board-user-pill').innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;">
      <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${g1},${g2});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;flex-shrink:0;">${esc(av)}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;">
        <span style="font-size:12px;color:rgba(0,0,0,0.75);font-weight:600;">[${esc(m)}]</span>
        ${profile.isAdmin ? '<span style="background:rgba(0,0,0,0.55);color:#fff;font-size:9px;font-weight:800;border-radius:4px;padding:1px 5px;line-height:1.2;">ADMIN</span>' : ''}
      </div>
      <span>🔥</span>
      <span style="font-size:11px;color:rgba(0,0,0,0.6);">${s}d</span>
      ${profile.showStable && profile.stableStreak > 0 ? `<span>🧘</span><span style="font-size:11px;color:rgba(0,0,0,0.6);">${profile.stableStreak}d</span>` : ''}
      ${bday ? `<span title="Bipolar Bear birthday">🎂</span><span style="font-size:11px;color:rgba(0,0,0,0.6);">${bday}</span>` : ''}
    </div>`;
}

function setupTabs() {
  document.querySelectorAll('.board-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
}

// ── Unseen-message helpers ─────────────────────────────────────────
function stopAllListeners() {
  ['announcements', 'general'].forEach(tab => {
    if (unsubTabListeners[tab]) { unsubTabListeners[tab](); unsubTabListeners[tab] = null; }
  });
}

function saveLastSeen(tab) {
  lastSeenMs[tab] = Date.now();
  BB.storage.set('Anon_lastSeen_' + tab, String(lastSeenMs[tab]));
}

function tabHasUnseen(tab) {
  const seen = lastSeenMs[tab];
  return postsByTab[tab].some(p => {
    if (p.isSystem || p.isSeed || p.isAnnouncement || p.deleted) return false;
    const la = p.lastActivity?.toMillis?.() ?? 0;
    const ts = p.timestamp?.toMillis?.()    ?? 0;
    return Math.max(la, ts) > seen;
  });
}

function renderTabBadges() {
  ['announcements', 'general'].forEach(tab => {
    const btn = document.querySelector(`.board-tab[data-tab="${tab}"]`);
    if (btn) btn.classList.toggle('has-badge', tab !== currentTab && tabHasUnseen(tab));
  });
}
// ──────────────────────────────────────────────────────────────────

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.board-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('fab-ann').classList.toggle('active', tab === 'announcements');
  document.getElementById('fab-gen').classList.toggle('active', tab === 'general');

  const postList    = document.getElementById('post-list');
  const wikiSection = document.getElementById('wiki-section');
  const fabCompose  = document.getElementById('fab-compose');
  const fabSearch   = document.getElementById('fab-search');
  const isWiki      = tab === 'wiki';
  if (postList)    postList.style.display    = isWiki ? 'none'  : '';
  if (wikiSection) wikiSection.style.display = isWiki ? 'block' : 'none';
  if (fabCompose)  fabCompose.style.display  = isWiki ? 'none'  : '';
  if (fabSearch)   fabSearch.style.display   = isWiki ? ''      : 'none';
  if (!isWiki) closeWikiSearch();

  if (isWiki) {
    renderWiki();
    renderTabBadges();
    return;
  }

  saveLastSeen(tab);
  // Render from the already-running listener's cached data (no listener restart)
  localPosts = postsByTab[tab] || [];
  renderPosts(tab === 'general'
    ? assembleGeneralPosts(localPosts)
    : (localPosts.length ? sortPosts(localPosts) : announcementPosts()));
  renderTabBadges();
}

// ─────────────────────────────────────────────────────────────────
// Wiki tab
// ─────────────────────────────────────────────────────────────────
let _wikiSection = 'meds';
const _wikiCache = { groups: null, posts: null };
function _wt(key) { return (window.BB && window.BB.t) ? window.BB.t(key) : key; }

function renderWiki() {
  const wiki = document.getElementById('wiki-section');
  if (!wiki) return;
  if (wiki.dataset.rendered !== '1') {
    wiki.dataset.rendered = '1';
    wiki.innerHTML = `
      <div id="wiki-search-bar" class="wiki-search-bar" style="display:none;">
        <input id="wiki-search-input" type="search" placeholder="${esc(_wt('anon.wiki.searchPlaceholder'))}" autocomplete="off" />
        <button id="wiki-search-close" class="wiki-search-close" aria-label="Close search">✕</button>
      </div>
      <div class="wiki-pills">
        <div class="wiki-pill-row" data-pill-row="0">
          <div class="wiki-pill-track">
            <button class="wiki-pill active" data-wiki="meds">${esc(_wt('anon.wiki.pillMeds'))}</button>
            <button class="wiki-pill" data-wiki="conditions">${esc(_wt('anon.wiki.pillConditions'))}</button>
            <button class="wiki-pill" data-wiki="therapies">${esc(_wt('anon.wiki.pillTherapies'))}</button>
            <button class="wiki-pill" data-wiki="sideEffects">${esc(_wt('anon.wiki.pillSideEffects'))}</button>
            <button class="wiki-pill" data-wiki="lifestyle">${esc(_wt('anon.wiki.pillLifestyle'))}</button>
            <button class="wiki-pill" data-wiki="warningSigns">${esc(_wt('anon.wiki.pillWarningSigns'))}</button>
          </div>
        </div>
        <div class="wiki-pill-row" data-pill-row="1">
          <div class="wiki-pill-track">
            <button class="wiki-pill" data-wiki="hospital">${esc(_wt('anon.wiki.pillHospital'))}</button>
            <button class="wiki-pill" data-wiki="workplace">${esc(_wt('anon.wiki.pillWorkplace'))}</button>
            <button class="wiki-pill" data-wiki="pregnancy">${esc(_wt('anon.wiki.pillPregnancy'))}</button>
            <button class="wiki-pill" data-wiki="media">${esc(_wt('anon.wiki.pillMedia'))}</button>
            <button class="wiki-pill" data-wiki="lovedOnes">${esc(_wt('anon.wiki.pillLovedOnes'))}</button>
            <button class="wiki-pill" data-wiki="groups">${esc(_wt('anon.wiki.pillGroups'))}</button>
            <button class="wiki-pill" data-wiki="wisdom">${esc(_wt('anon.wiki.pillWisdom'))}</button>
          </div>
        </div>
      </div>
      <div id="wiki-body" class="wiki-body"></div>
    `;
    wiki.querySelectorAll('.wiki-pill').forEach(btn => {
      btn.addEventListener('click', () => setWikiSection(btn.dataset.wiki));
    });
    document.getElementById('wiki-search-input').addEventListener('input', applyWikiFilter);
    document.getElementById('wiki-search-close').addEventListener('click', closeWikiSearch);
    setWikiSection(_wikiSection);
  } else {
    // Re-evaluate marquee state in case viewport size changed while hidden.
    _updateWikiMarquees();
  }
}

function toggleWikiSearch() {
  const bar = document.getElementById('wiki-search-bar');
  if (!bar) return;
  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    const input = document.getElementById('wiki-search-input');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
  } else {
    closeWikiSearch();
  }
}

function closeWikiSearch() {
  const bar = document.getElementById('wiki-search-bar');
  if (!bar) return;
  bar.style.display = 'none';
  const input = document.getElementById('wiki-search-input');
  if (input) input.value = '';
  applyWikiFilter();
}

function applyWikiFilter() {
  const input = document.getElementById('wiki-search-input');
  const body  = document.getElementById('wiki-body');
  if (!body) return;
  const q = input ? input.value.trim().toLowerCase() : '';
  const cards = body.querySelectorAll('[data-wiki-search]');
  let visibleCount = 0;
  cards.forEach(c => {
    const match = !q || (c.dataset.wikiSearch || '').includes(q);
    c.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });
  // Region headings (groups view): hide if all groups under them are filtered out.
  body.querySelectorAll('[data-wiki-region]').forEach(h => {
    const region = h.dataset.wikiRegion;
    const anyVisible = Array.from(body.querySelectorAll(`[data-wiki-region-card="${CSS.escape(region)}"]`))
      .some(el => el.style.display !== 'none');
    h.style.display = anyVisible ? '' : 'none';
  });
  // No-results state.
  let noResults = body.querySelector('.wiki-no-results');
  if (q && visibleCount === 0) {
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.className = 'wiki-empty wiki-no-results';
      noResults.textContent = _wt('anon.wiki.noResults');
      body.appendChild(noResults);
    }
  } else if (noResults) {
    noResults.remove();
  }
}

function setWikiSection(section) {
  _wikiSection = section;
  document.querySelectorAll('.wiki-pill').forEach(b =>
    b.classList.toggle('active', !b.classList.contains('wiki-pill--ghost') && b.dataset.wiki === section));
  _updateWikiMarquees();
  if (section === 'meds')              renderWikiMeds();
  else if (section === 'conditions')   renderWikiConditions();
  else if (section === 'therapies')    renderWikiTherapies();
  else if (section === 'lifestyle')    renderWikiLifestyle();
  else if (section === 'warningSigns') renderWikiWarningSigns();
  else if (section === 'sideEffects')  renderWikiSideEffects();
  else if (section === 'hospital')     renderWikiHospital();
  else if (section === 'workplace')    renderWikiWorkplace();
  else if (section === 'pregnancy')    renderWikiPregnancy();
  else if (section === 'media')        renderWikiMedia();
  else if (section === 'lovedOnes')    renderWikiLovedOnes();
  else if (section === 'groups')       renderWikiGroups();
  else if (section === 'wisdom')       renderWikiWisdom();
}

// Two-line pill layout: stack rows on mobile, animate the row without the
// active pill as a continuous marquee when its content overflows the screen.
function _updateWikiMarquees() {
  const wiki = document.getElementById('wiki-section');
  if (!wiki || wiki.style.display === 'none') return;
  const rows = wiki.querySelectorAll('.wiki-pill-row');
  if (!rows.length) return;
  const isMobile = window.matchMedia('(max-width: 519px)').matches;
  rows.forEach(row => {
    const track = row.querySelector('.wiki-pill-track');
    if (!track) return;
    track.querySelectorAll('.wiki-pill--ghost').forEach(g => g.remove());
    row.classList.remove('marquee');
    const hasActive = !!track.querySelector('.wiki-pill.active');
    row.classList.toggle('active-row', hasActive);
    if (!isMobile || hasActive) return;
    const originals = Array.from(track.children);
    if (!originals.length) return;
    const trackWidth = track.scrollWidth;
    const rowWidth   = row.clientWidth;
    if (trackWidth <= rowWidth + 1) return;
    originals.forEach(el => {
      const clone = el.cloneNode(true);
      clone.classList.add('wiki-pill--ghost');
      clone.classList.remove('active');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      track.appendChild(clone);
    });
    row.classList.add('marquee');
  });
}

let _wikiMarqueeResizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(_wikiMarqueeResizeT);
  _wikiMarqueeResizeT = setTimeout(_updateWikiMarquees, 120);
});

const _CONDITIONS = [
  {
    keys: ['bipolar 1', 'bipolar one', 'bp1', 'bpi', 'mania', 'manic'],
    title: 'Bipolar I',
    body: 'Defined by at least one manic episode lasting 7+ days (or any length if it required hospital). Mania involves elevated or irritable mood, racing thoughts, reduced need for sleep, risky behaviour, and sometimes psychosis. Most people with Bipolar I also experience major depressive episodes between manic ones.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/'
  },
  {
    keys: ['bipolar 2', 'bipolar two', 'bp2', 'bpii', 'hypomania', 'hypomanic'],
    title: 'Bipolar II',
    body: 'At least one hypomanic episode (4+ days, less severe than full mania — no hospitalisation, no psychosis) and at least one major depressive episode. Hypomania can feel productive or even pleasant, which is why Bipolar II is often misdiagnosed as depression for years before the pattern is recognised.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/'
  },
  {
    keys: ['cyclothymia', 'cyclothymic'],
    title: 'Cyclothymia',
    body: 'Chronic, fluctuating mood swings lasting at least 2 years in adults (1 year in under-18s), with periods of hypomanic and depressive symptoms that don\'t quite meet the threshold for a full episode. Less severe but persistent — and it can develop into Bipolar I or II over time.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/'
  },
  {
    keys: ['nos', 'other specified', 'unspecified', 'bipolar nos'],
    title: 'Other Specified Bipolar (NOS)',
    body: 'A diagnosis used when symptoms clearly fit a bipolar pattern but don\'t meet the strict criteria for I, II, or cyclothymia — for example, hypomanic episodes shorter than 4 days, or depressive episodes alongside subthreshold hypomanic symptoms. Just as real and just as worth treating.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/'
  },
  {
    keys: ['rapid cycling', 'rapid-cycling', 'rapid cycler', 'cycling'],
    title: 'Rapid Cycling',
    body: 'Not a separate diagnosis but a course specifier that can apply to Bipolar I or II: four or more mood episodes (manic, hypomanic, or depressive) within a 12-month period, each separated by partial or full remission, or by a switch to the opposite pole. Ultra-rapid (days) and ultra-ultra-rapid / ultradian (within a single day) cycling are sometimes described too, though they sit outside the formal DSM definition. Rapid cycling is more common in Bipolar II, in women, and can be triggered or worsened by antidepressants taken without a mood stabiliser, thyroid problems, sleep disruption, or substance use. It tends to respond less well to lithium alone — clinicians often try valproate, lamotrigine, or atypical antipsychotics, and look hard for reversible triggers.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/symptoms/'
  },
  {
    keys: ['mixed features', 'mixed episode', 'mixed state', 'dysphoric mania', 'agitated depression'],
    title: 'Mixed Features',
    body: 'Manic/hypomanic and depressive symptoms occurring at the same time — for example, depressed mood with racing thoughts and agitation, or elevated energy paired with hopelessness. Used to be called "mixed episodes"; the DSM-5 reframed it as a "with mixed features" specifier that can attach to any mood episode in Bipolar I, II, or major depression. Often experienced as the most painful state in bipolar — the energy to act on suicidal thoughts is higher than in pure depression — and is a recognised high-risk window. Antidepressants alone tend to make it worse; mood stabilisers and atypical antipsychotics are first-line.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/symptoms/'
  },
  {
    keys: ['seasonal', 'sad', 'seasonal affective', 'winter depression', 'summer mania', 'seasonal pattern'],
    title: 'Seasonal Pattern',
    body: 'A specifier (not a separate diagnosis) for people whose mood episodes follow the seasons in a reliable, multi-year pattern — most commonly winter depression and spring/summer hypomania or mania, though the reverse occurs. Light therapy and dawn simulators can help the winter-depression side; for the manic side they can actually trigger a switch, so timing and clinician supervision matter. Sleep hygiene, blackout curtains during light months, and pre-emptive medication adjustments around the equinoxes are common strategies.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/seasonal-affective-disorder-sad/'
  },
  {
    keys: ['mdd', 'major depression', 'major depressive', 'depression', 'unipolar', 'unipolar depression', 'clinical depression'],
    title: 'Major Depressive Disorder',
    body: 'Recurrent depressive episodes without any history of mania or hypomania. Symptoms overlap heavily with bipolar depression — low mood, loss of interest, fatigue, sleep and appetite changes, hopelessness, suicidal thoughts — but the absence of "up" episodes is the key distinction. Because hypomania can feel pleasant or simply productive, Bipolar II is misdiagnosed as MDD for an average of around 10 years. If antidepressants trigger agitation, insomnia, or a sudden mood lift, ask your prescriber to revisit the diagnosis: that pattern can unmask bipolarity.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/clinical-depression/'
  },
  {
    keys: ['anxiety', 'gad', 'panic', 'panic disorder', 'social anxiety', 'phobia', 'anxiety disorder'],
    title: 'Anxiety Disorders',
    body: 'An umbrella covering Generalised Anxiety Disorder (persistent worry across many areas of life), Panic Disorder (sudden physical surges of fear), Social Anxiety, specific phobias, and others. Anxiety disorders co-occur with bipolar more often than not — estimates run between 50% and 75% — and can mimic or mask hypomania, since agitation and racing thoughts feature in both. SSRIs are standard for primary anxiety but need caution in bipolar because of switch risk; CBT, mindfulness-based approaches, and short-term beta-blockers for performance situations are common adjuncts.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/generalised-anxiety-disorder/'
  },
  {
    keys: ['adhd', 'add', 'attention deficit', 'hyperactive', 'hyperactivity'],
    title: 'ADHD',
    body: 'A neurodevelopmental condition involving difficulty sustaining attention, impulsivity, and (for many) hyperactivity, present since childhood. Roughly 1 in 5 adults with bipolar also meet ADHD criteria, and the symptom overlap with hypomania — talkativeness, distractibility, restlessness, sleep disruption — makes diagnosis tricky. The key distinction is duration: ADHD is a lifelong baseline trait, while hypomania is episodic and a clear change from your normal. Stimulants treat ADHD effectively but can destabilise unmedicated bipolar, so most clinicians stabilise mood first; atomoxetine and guanfacine are non-stimulant alternatives.',
    nhs: 'https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/'
  },
  {
    keys: ['bpd', 'eupd', 'borderline', 'borderline personality', 'emotionally unstable'],
    title: 'Borderline Personality Disorder (BPD / EUPD)',
    body: 'A personality disorder marked by intense, rapidly-shifting emotions (typically minutes-to-hours, rarely full days), fear of abandonment, unstable self-image and relationships, impulsivity, and self-harming or suicidal behaviour. Frequently misdiagnosed as bipolar — and vice versa — because both feature mood swings, but the timescale and triggers differ: BPD shifts are usually reactive to interpersonal events, while bipolar episodes last days-to-weeks and arise more autonomously. Dialectical Behaviour Therapy (DBT) is the gold-standard treatment; medication plays a supporting, not primary, role. The two conditions can also co-exist.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/borderline-personality-disorder/'
  },
  {
    keys: ['schizophrenia', 'psychosis', 'schizoaffective', 'psychotic'],
    title: 'Schizophrenia & Schizoaffective',
    body: 'Schizophrenia is a chronic condition involving positive symptoms (hallucinations, delusions, disorganised thinking), negative symptoms (flattened affect, reduced motivation, social withdrawal), and cognitive symptoms. It is not "split personality" and it is not the same as Bipolar I with psychotic features — in bipolar, psychosis appears during mood episodes and resolves with them; in schizophrenia, psychotic symptoms persist independently of mood. Schizoaffective disorder sits between the two: full mood episodes plus periods of psychosis when mood is stable for at least two weeks. Antipsychotics are the mainstay of treatment, with long-acting injectables as an option for adherence; psychosocial support and family-based approaches matter just as much as medication.',
    nhs: 'https://www.nhs.uk/mental-health/conditions/schizophrenia/'
  }
];

const _THERAPIES = [
  {
    keys: ['cbt', 'cognitive', 'cognitive behavioural', 'cognitive behavioral'],
    title: 'CBT — Cognitive Behavioural Therapy',
    body: 'The most widely-offered talking therapy on the NHS. CBT works on the loop between thoughts, feelings, and behaviours — for bipolar it focuses on catching distorted thinking in depression and challenging the "I don\'t need sleep / I can do anything" cognitions early in hypomania. Usually 8–20 weekly sessions. Bipolar-adapted CBT includes mood charting and prodromal-symptom work; standard CBT alone is more useful for the depressive phase.',
    link: 'https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/cognitive-behavioural-therapy-cbt/'
  },
  {
    keys: ['dbt', 'dialectical', 'mindfulness skills'],
    title: 'DBT — Dialectical Behaviour Therapy',
    body: 'Originally developed for borderline personality disorder, DBT combines CBT with mindfulness and acceptance skills. Four skill modules: mindfulness, distress tolerance, emotion regulation, interpersonal effectiveness. Useful in bipolar where mood swings include self-harm urges or intense interpersonal pain. Usually delivered as weekly individual therapy plus weekly skills group for 6–12 months. NHS access is patchier than CBT — often via specialist services.',
    link: 'https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/'
  },
  {
    keys: ['ipsrt', 'social rhythm', 'interpersonal', 'rhythm therapy'],
    title: 'IPSRT — Interpersonal & Social Rhythm Therapy',
    body: 'Bipolar-specific therapy targeting the disrupted body-clock side of the illness. You map your daily routines — wake time, first contact with people, meals, sleep — and work on stabilising them, on the theory that disrupted rhythms trigger mood episodes. The "IP" half addresses relationship grief, role transitions, and conflicts that often precede an episode. Strong evidence for relapse prevention; rarely offered on the NHS but worth asking about privately.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['mbct', 'mindfulness', 'mindfulness based'],
    title: 'MBCT — Mindfulness-Based Cognitive Therapy',
    body: 'An 8-week group programme combining mindfulness meditation with CBT principles. NICE recommends it specifically for preventing recurrence in depression. For bipolar it can help with rumination in depression and noticing early agitation in hypomania — though some people find prolonged meditation destabilising during a mood episode, so timing matters. Free apps exist; structured NHS courses are increasingly available via Talking Therapies.',
    link: 'https://www.nhs.uk/mental-health/self-help/tips-and-support/mindfulness/'
  },
  {
    keys: ['fft', 'family focused', 'family therapy', 'family-focused'],
    title: 'Family-Focused Therapy (FFT)',
    body: 'Designed specifically for bipolar disorder, FFT brings the patient and close family or partners together for 12–21 sessions. Covers psychoeducation about the illness, communication skills, and problem-solving. Strong evidence for reducing relapse and hospital admission, especially in young people newly diagnosed. Rarely on the standard NHS pathway — usually only via research clinics or specialist mood-disorder units.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['emdr', 'eye movement', 'trauma therapy', 'ptsd therapy'],
    title: 'EMDR — Eye Movement Desensitisation & Reprocessing',
    body: 'A trauma-focused therapy where you recall distressing memories while following the therapist\'s finger (or tapping/tones) in alternating left-right patterns. NICE-recommended for PTSD. Relevant for bipolar because trauma is a common co-occurring issue and unprocessed trauma can act as a relapse trigger. NHS access is via specialist trauma services; eight to twelve sessions is typical.',
    link: 'https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/'
  },
  {
    keys: ['psychoeducation', 'education', 'learning about bipolar'],
    title: 'Psychoeducation',
    body: 'Structured teaching about your condition — early warning signs, medication, lifestyle, when to seek help. Sounds basic but the evidence is strong: structured group psychoeducation (the Barcelona programme is the most famous, 21 weekly sessions) cuts relapse rates significantly. NHS CMHTs sometimes run bipolar psychoeducation groups; Bipolar UK\'s "Living with Bipolar" courses are a peer-led alternative.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['counselling', 'counseling', 'psychotherapy', 'therapy difference'],
    title: 'Counselling vs Psychotherapy',
    body: 'Counselling is usually shorter (6–12 weeks), focused on a specific issue (grief, work stress), and centred on listening and reflection. Psychotherapy is longer (months to years), goes deeper into patterns, and can be psychodynamic, person-centred, or integrative. Neither is bipolar-specific, but both can support the wider work alongside CBT/DBT/IPSRT. The NHS offers brief counselling via Talking Therapies; longer psychotherapy is usually private or via specialist services.',
    link: 'https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/'
  }
];

const _LIFESTYLE = [
  {
    keys: ['sleep', 'circadian', 'insomnia', 'sleep hygiene', 'jet lag'],
    title: 'Sleep & Circadian Rhythm',
    body: 'Probably the single most powerful lifestyle factor in bipolar. Reduced sleep is both a symptom and a trigger of mania — losing one night can switch some people. Aim for a fixed sleep window (7–9 hours), a consistent wake time even on weekends, no screens for an hour before bed, and a dark cool room. Travel across time zones, shift work, and all-nighters are high-risk; talk to your prescriber about pre-emptive sleep meds for unavoidable disruptions.',
    link: 'https://www.nhs.uk/live-well/sleep-and-tiredness/'
  },
  {
    keys: ['alcohol', 'drinking', 'booze', 'wine', 'beer'],
    title: 'Alcohol',
    body: 'Alcohol depresses mood the day after, disrupts sleep architecture (even when it helps you fall asleep), and interacts with most psychiatric meds — lithium and lamotrigine both have significant cautions. Heavy use roughly doubles relapse risk and worsens treatment response. If you drink, ideally low and slow, with food, never alone, never to manage symptoms; the UK low-risk guideline is ≤14 units/week spread over 3+ days. Mocktails and 0% beers are now everywhere.',
    link: 'https://www.nhs.uk/live-well/alcohol-advice/'
  },
  {
    keys: ['caffeine', 'coffee', 'tea', 'energy drinks'],
    title: 'Caffeine',
    body: 'A stimulant — speeds up the heart, raises anxiety, delays sleep onset (over a 6-hour half-life), and at high doses can fuel hypomania. Worth tracking how much you actually consume: a Starbucks grande is around 310mg, the upper-end NHS guideline is 400mg/day, and many bipolar specialists suggest dropping under 200mg if you\'re sensitive. Cut gradually to avoid headaches; switch to decaf or matcha (lower dose, slower release) after lunch.',
    link: 'https://www.nhs.uk/live-well/eat-well/food-types/the-effects-of-caffeine-on-your-health/'
  },
  {
    keys: ['exercise', 'gym', 'running', 'walking', 'cardio', 'strength'],
    title: 'Exercise',
    body: '150 minutes of moderate activity per week has antidepressant effects comparable to some SSRIs in mild-to-moderate depression. For bipolar specifically, the catch is that intense or novel training can also trigger hypomania — so the pattern is "regular and moderate", not "bursts of new training plans". Walking, swimming, yoga, and weight training all count; team sports add the social-rhythm bonus.',
    link: 'https://www.nhs.uk/live-well/exercise/'
  },
  {
    keys: ['light', 'dark', 'sunlight', 'blackout', 'morning light', 'lightbox'],
    title: 'Light & Dark',
    body: 'Bright morning light shifts your body clock earlier and lifts depressed mood; evening light delays sleep and can fuel mania. Useful tactics: a 20-minute morning walk or a 10,000-lux lightbox for winter depression; blackout curtains and amber glasses after 9pm during summer or in manic phases. "Dark therapy" (deliberate 14-hour darkness) has small-trial evidence for stopping early mania.',
    link: 'https://www.nhs.uk/mental-health/conditions/seasonal-affective-disorder-sad/treatment/'
  },
  {
    keys: ['routine', 'schedule', 'social rhythm', 'structure'],
    title: 'Routine & Social Rhythms',
    body: 'Bipolar brains are particularly sensitive to routine disruption. Anchoring a few daily fixed points — wake time, first meal, first social contact, evening wind-down — gives the body clock something to lock onto. Big life events (new job, baby, bereavement, breakups) disrupt rhythms predictably; building extra support around them rather than relying on willpower is the standard advice.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['diet', 'food', 'nutrition', 'omega', 'mediterranean', 'vitamin d'],
    title: 'Diet & Nutrition',
    body: 'No "bipolar diet" exists, but a few patterns matter: blood-sugar swings can amplify mood swings (regular meals, less ultra-processed food), omega-3s have small adjunctive evidence, vitamin D deficiency is common and worth checking, and several mood stabilisers (lithium especially) drive weight gain — early conversations with a dietitian beat trying to claw it back later. Avoid grapefruit on some antipsychotics (it interferes with metabolism).',
    link: 'https://www.nhs.uk/live-well/eat-well/'
  },
  {
    keys: ['cannabis', 'weed', 'marijuana', 'mdma', 'cocaine', 'recreational drugs', 'psychedelics'],
    title: 'Cannabis & Recreational Drugs',
    body: 'Cannabis is the most-used and most-studied: regular use roughly doubles psychosis risk in bipolar and worsens episode length and severity. Stimulants (cocaine, MDMA, amphetamine) can directly trigger manic switches; psychedelics (LSD, psilocybin) carry similar risk and limited evidence in bipolar, despite the depression research in unipolar populations. Talk to your prescriber honestly — they\'ve heard it all and need the full picture to dose your meds.',
    link: 'https://www.talktofrank.com/'
  }
];

const _WARNING_SIGNS = [
  {
    keys: ['mania prodrome', 'early mania', 'manic warning', 'hypomania signs', 'prodrome'],
    title: 'Early Signs of Mania / Hypomania',
    body: 'Common early shifts (often 1–4 weeks before a full episode): sleep dropping by an hour or two with no fatigue; new projects appearing out of nowhere; speech speeding up or thoughts feeling crowded; spending or sexual impulses rising; irritability with people who "don\'t get it"; religious or grandiose ideas creeping in; reduced need for food. If others around you have started asking "are you OK?" — that itself is a warning sign.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/symptoms/'
  },
  {
    keys: ['depression prodrome', 'early depression', 'depressive warning'],
    title: 'Early Signs of Depression',
    body: 'Often: sleep increasing or fragmenting (early morning waking); appetite changes; replies to texts getting shorter or stopping; reduced enjoyment in things you usually like; physical heaviness; concentration dropping; a creeping sense of dread or self-criticism. Some people first notice it as a loss of music — songs that used to move you stop landing.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/symptoms/'
  },
  {
    keys: ['mixed warning', 'mixed prodrome', 'dysphoric early signs'],
    title: 'Early Signs of Mixed States',
    body: 'Mixed states often start with the worst of both poles: tired but unable to sleep, slowed-down body with racing thoughts, hopeless mood with agitated energy, or irritability that swings between tears and rage within hours. Suicide risk is elevated because energy is present even when motivation isn\'t. If this pattern shows up, call your CMHT or crisis team — don\'t wait it out.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/symptoms/'
  },
  {
    keys: ['relapse signature', 'warning signs list', 'personal warning'],
    title: 'Building Your Relapse Signature',
    body: 'A relapse signature is a personalised checklist of your earliest, most reliable warning signs — usually 5–10 items, ordered from "subtle" to "obvious". Build it by reviewing past episodes with a clinician, a family member, or your journal. Share it with one or two trusted people who can flag changes you might miss. Update it after every episode, since the signature can drift over years.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['when to call', 'cmht', 'gp', 'help', 'who to call'],
    title: 'When to Call Your CMHT or GP',
    body: 'Call your CMHT (Community Mental Health Team) or care coordinator if: warning signs are clearly building over more than a few days, you\'ve missed doses or sleep, you\'ve started spending or risk-taking, or family are concerned. Call your GP if you don\'t have a CMHT, or for changes that are uncomfortable but not yet urgent. They can refer or fast-track you. Earlier always beats later — there\'s no "wasting their time".',
    link: 'https://www.nhs.uk/nhs-services/mental-health-services/'
  },
  {
    keys: ['crisis line', 'samaritans', 'shout', 'crisis', '111'],
    title: 'When to Call a Crisis Line',
    body: 'For active distress, suicidal thoughts, or "I don\'t know what to do right now": Samaritans 116 123 (free, 24/7, any reason), Shout text 85258 (text-based, 24/7), NHS 111 option 2 (urgent mental health), or your local CMHT\'s crisis line if you have one. Bipolar UK\'s eCommunity and peer support line are also worth saving in your phone before you need them.',
    link: 'https://www.samaritans.org/'
  },
  {
    keys: ['a&e', 'emergency', '999', 'er', 'urgent'],
    title: 'When to Go to A&E or Call 999',
    body: 'Go to A&E or call 999 if: you are about to act on suicidal thoughts, you\'ve taken an overdose or harmed yourself seriously, you are experiencing psychosis or losing touch with reality, or you cannot keep yourself safe. A&E mental-health liaison teams can assess and refer; if there is risk to life, ambulance or police can help under Section 136 in public or Section 135 with a warrant at home.',
    link: 'https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-go-to-ae/'
  }
];

const _SIDE_EFFECTS = [
  {
    keys: ['weight gain', 'metabolic', 'diabetes', 'olanzapine weight', 'quetiapine weight'],
    title: 'Weight Gain & Metabolic Effects',
    body: 'Common with most antipsychotics (olanzapine and quetiapine in particular), lithium, and valproate. Mechanism is mixed: appetite increase, slower metabolism, fluid retention, sedation cutting exercise. Annual blood tests for HbA1c, lipids, and weight are standard. Mitigations: pre-emptive dietitian referral, weight-neutral alternatives (aripiprazole, lurasidone), metformin add-on, and not assuming "willpower" alone can outpace the drug.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/treatment/'
  },
  {
    keys: ['tremor', 'shaking', 'lithium tremor'],
    title: 'Tremor',
    body: 'Fine hand tremor is common with lithium (especially at higher levels) and valproate. Worsens with caffeine, anxiety, and high doses. Usually mild and stable — if it suddenly worsens, ask for a lithium level (could be toxicity). Mitigations: split the dose, drop caffeine, propranolol 10–40mg as needed, or a small dose reduction with your prescriber.',
    link: 'https://www.nhs.uk/conditions/lithium-medicine/side-effects-of-lithium/'
  },
  {
    keys: ['brain fog', 'cognitive', 'dulling', 'slow thinking', 'word finding'],
    title: 'Cognitive Dulling / Brain Fog',
    body: 'A real and under-acknowledged side effect of lithium, valproate, topiramate (nicknamed "dopamax"), and some antipsychotics. Word-finding lapses, slower recall, less creative momentum. Some of it is the medication, some is residual depression, some is sleep meds carrying over. Worth distinguishing before assuming — and worth raising with your prescriber, as switching agents can help.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['sedation', 'grogginess', 'tired', 'sleepy', 'med hangover'],
    title: 'Sedation & Morning Grogginess',
    body: 'Often the first side effect of antipsychotics, mirtazapine, and some mood stabilisers. Frequently eases over 2–4 weeks. If not: shift the dose to earlier in the evening, split it, or ask about switching. Heavy "med hangover" until midday is not something to push through silently — it\'s usually fixable.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/treatment/'
  },
  {
    keys: ['libido', 'sexual', 'sex drive', 'erectile', 'anorgasmia'],
    title: 'Libido & Sexual Function',
    body: 'SSRIs are the worst offenders (low libido, delayed orgasm, anorgasmia); antipsychotics and mood stabilisers can also reduce desire or contribute to erectile dysfunction. Often under-reported because patients are too embarrassed to mention it. Tell your prescriber — switching agents (bupropion, mirtazapine, aripiprazole), dose tweaks, and short drug holidays under guidance can all help.',
    link: 'https://www.nhs.uk/conditions/ssri-antidepressants/side-effects/'
  },
  {
    keys: ['akathisia', 'restlessness', 'cant sit still', 'inner restlessness'],
    title: 'Akathisia',
    body: 'An inner, agonising restlessness — usually pacing, jiggling legs, unable to stay still — caused by antipsychotics (haloperidol, aripiprazole, risperidone, and others). Easy to mistake for anxiety or agitation. Distressing enough that it can drive suicidal thoughts on its own. Tell your prescriber urgently: a dose reduction, switch, or addition of propranolol or a short-term benzodiazepine usually helps.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['blood test', 'lithium level', 'valproate level', 'monitoring', 'tdm'],
    title: 'Blood Tests (Lithium & Valproate)',
    body: 'Lithium needs 12-hour-post-dose blood levels — weekly when starting, then 3–6 monthly once stable; therapeutic range 0.4–1.0 mmol/L. Plus kidney function (U&Es), thyroid function (TFTs), and calcium annually. Valproate doesn\'t strictly require level monitoring but liver function and platelets are checked at baseline and periodically. Skipping bloods is the single biggest cause of avoidable toxicity.',
    link: 'https://www.nhs.uk/conditions/lithium-medicine/'
  },
  {
    keys: ['dry mouth', 'thirst', 'polydipsia'],
    title: 'Dry Mouth & Thirst',
    body: 'Lithium increases thirst by affecting kidney water handling; antipsychotics and antidepressants cause dry mouth via anticholinergic effects. Heavy thirst (over 3L water/day, frequent night urination) on lithium needs investigating — could be early lithium-induced diabetes insipidus, which is reversible if caught. Sugar-free gum, frequent sips, and humidifiers help dry mouth; bedside water is fine, gallons of fluid is not.',
    link: 'https://www.nhs.uk/conditions/lithium-medicine/side-effects-of-lithium/'
  },
  {
    keys: ['constipation', 'gi', 'gut', 'nausea', 'diarrhoea', 'clozapine bowel'],
    title: 'Constipation & GI Effects',
    body: 'Clozapine famously causes severe constipation (occasionally fatal — take laxatives proactively). Lithium and valproate often cause nausea or loose stools, usually settling within 2 weeks. Take meds with food, split doses, and use enteric-coated or slow-release versions if available. New or severe abdominal pain on clozapine is urgent — go to A&E.',
    link: 'https://www.nhs.uk/mental-health/conditions/bipolar-disorder/treatment/'
  }
];

const _HOSPITAL = [
  {
    keys: ['voluntary', 'informal admission', 'admission'],
    title: 'Voluntary (Informal) Admission',
    body: 'You agree to come in for treatment and can in principle leave whenever you want — though staff may ask you to stay and consider sectioning if they think it\'s needed. Most hospital admissions for bipolar are informal. You keep the same rights as any patient: refusing specific medications, having visitors, leaving the ward for a walk. Bring photo ID, charging cable, basic toiletries — phones are usually allowed.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/mental-health-act-1983/about-the-mha-1983/'
  },
  {
    keys: ['section 2', 's2', 'assessment section'],
    title: 'Section 2 — Assessment (28 days)',
    body: 'Up to 28 days, for assessment with or without treatment. Needs two doctors and one Approved Mental Health Professional (AMHP). You have the right to apply to a tribunal in the first 14 days, free legal representation, and an Independent Mental Health Advocate (IMHA). Cannot be renewed — must be discharged, converted to Section 3, or you stay on informally.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/sectioning/section-2/'
  },
  {
    keys: ['section 3', 's3', 'treatment section'],
    title: 'Section 3 — Treatment (up to 6 months)',
    body: 'Up to 6 months, renewable for another 6, then yearly. Same two-doctor + AMHP requirement; the nearest relative must be consulted and can object. Treatment can be given without consent in the first 3 months (with some exceptions like ECT). Same tribunal and advocate rights. Discharge can also come from the responsible clinician or the hospital managers.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/sectioning/section-3/'
  },
  {
    keys: ['section 5(2)', 's5(2)', '52', 'holding power'],
    title: 'Section 5(2) — Doctor\'s Holding Power (72 hours)',
    body: 'A short-term hold used when you\'ve gone in voluntarily but want to leave and the doctor thinks you need detaining. Lasts up to 72 hours while a full Section 2 or 3 assessment is arranged. Nurses have a similar 6-hour power under Section 5(4). Cannot be used in A&E — only on an inpatient ward.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/sectioning/section-5/'
  },
  {
    keys: ['section 136', 's136', '136', 'police section'],
    title: 'Section 136 — Police Powers in Public',
    body: 'Police can take someone from a public place to a "place of safety" (usually a hospital 136 suite) for up to 24 hours (extendable to 36) when they appear to need urgent mental-health care. You haven\'t been arrested — it\'s a protective power. The clock starts when you arrive at the place of safety. You\'ll be assessed by a doctor and AMHP and either released, kept informally, or moved to Section 2 or 3.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/police-and-mental-health/'
  },
  {
    keys: ['rights', 'imha', 'advocate', 'tribunal', 'patient rights'],
    title: 'Your Rights as a Sectioned Patient',
    body: 'Even when sectioned you keep the right to: free legal aid for tribunals, an Independent Mental Health Advocate (IMHA), have your care plan explained, receive visitors (within reason), correspondence in and out, complain via PALS, refuse most treatments (Section 3 has limits), and have a named nearest relative who can request your discharge. Mind and Rethink both run advocacy services.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/'
  },
  {
    keys: ['what to pack', 'hospital bag', 'admission pack'],
    title: 'What to Pack',
    body: 'Comfortable clothes (drawstring trousers — belts and laces are restricted on some wards), pyjamas, slippers, toiletries (some items may be locked in), phone and charger (cable rules vary), books, ear plugs, eye mask, paper and pens, a written list of your meds and doses, photo ID, glasses if you wear them, and a small amount of cash. Leave valuables and razors at home — the ward will provide alternatives.',
    link: 'https://www.bipolaruk.org/'
  },
  {
    keys: ['discharge', 'section 117', 'aftercare', 's117'],
    title: 'Discharge & Section 117 Aftercare',
    body: 'After Section 3 (and some other sections), you\'re entitled to free aftercare under Section 117 — typically a care coordinator, follow-up appointments, support with housing or benefits, and any community treatment needs. This can\'t legally be charged for. Push for a clear discharge plan in writing before you leave: who your care coordinator is, when the first appointment is, what to do if you start declining again.',
    link: 'https://www.mind.org.uk/information-support/legal-rights/leaving-hospital/'
  }
];

const _WORKPLACE = [
  {
    keys: ['equality act', 'disability', 'discrimination', 'protected characteristic'],
    title: 'Equality Act 2010 & Disability Status',
    body: 'Bipolar disorder (and most long-term mental health conditions) usually counts as a "disability" under the Equality Act 2010 — meaning a substantial and long-term effect on day-to-day life. That triggers protection from discrimination, harassment, and victimisation at work, plus a positive duty on employers to make reasonable adjustments. You don\'t need a formal employer-side diagnosis; documentation from your GP or psychiatrist is enough.',
    link: 'https://www.gov.uk/definition-of-disability-under-equality-act-2010'
  },
  {
    keys: ['reasonable adjustments', 'adjustments', 'workplace accommodations'],
    title: 'Reasonable Adjustments',
    body: 'Adjustments your employer should consider include: phased return after sickness, flexible hours around medication side effects, working from home some days, a quieter workspace, written instructions instead of verbal, regular 1:1s, swapping client-facing tasks during episodes, time off for appointments. Request them in writing; "I am asking for a reasonable adjustment under the Equality Act" makes it clear. Refusal needs a justifiable business reason.',
    link: 'https://www.acas.org.uk/reasonable-adjustments'
  },
  {
    keys: ['access to work', 'atw', 'aw scheme'],
    title: 'Access to Work Scheme',
    body: 'A UK government grant that pays for support to start or stay in work — covering coaching, assistive tech, taxis if you can\'t use transport, or a mental-health support worker. Apply online; an assessor talks through what helps. The employer doesn\'t pay (small employers receive 100% of costs, larger ones pay a share above a threshold). One of the most under-used resources in mental-health employment.',
    link: 'https://www.gov.uk/access-to-work'
  },
  {
    keys: ['sick note', 'fit note', 'med3', 'doctor note'],
    title: 'Sick Notes / Fit Notes',
    body: 'After 7 days off sick you need a "fit note" from your GP (formerly called a sick note). It can say "not fit for work" or "may be fit with adjustments" (phased return, reduced hours, altered duties). You can self-certify for the first 7 days. Fit notes are confidential — your employer doesn\'t need the diagnosis, only the work capacity. They can also be issued by psychiatrists, nurses, OTs, and pharmacists.',
    link: 'https://www.gov.uk/taking-sick-leave'
  },
  {
    keys: ['disclosure', 'telling employer', 'disclose', 'tell work'],
    title: 'Disclosure: To Tell or Not',
    body: 'No legal duty to disclose at application or interview unless asked directly about a relevant condition (and "relevant" is narrow). Pros of disclosing: triggers Equality Act protection, unlocks adjustments, removes the secret. Cons: real-world stigma still exists in some sectors. A common pattern is to disclose later (not at interview) — once probation passes, in a 1:1 with HR, with a written summary of what you need.',
    link: 'https://www.mind.org.uk/workplace/'
  },
  {
    keys: ['pip', 'personal independence', 'disability benefit'],
    title: 'PIP — Personal Independence Payment',
    body: 'A non-means-tested benefit for people with long-term conditions affecting daily living or mobility — including mental health. Two parts (daily living, mobility), two rates (standard, enhanced). The form is long and the descriptors don\'t fit mental health well; charities (Mind, Citizens Advice, Bipolar UK) provide free help with applications and appeals. Many successful claims are won at tribunal, so don\'t take a first refusal as final.',
    link: 'https://www.gov.uk/pip'
  },
  {
    keys: ['universal credit', 'uc', 'limited capability', 'lcw', 'lcwra'],
    title: 'Universal Credit & Limited Capability',
    body: 'If you can\'t work or can only work limited hours, the "limited capability for work" (LCW) or "limited capability for work and work-related activity" (LCWRA) elements of Universal Credit add money and remove the work-search requirement. Triggered by a work capability assessment after sustained fit notes. Plan around the timing — there\'s usually a 3-month wait before payments start.',
    link: 'https://www.gov.uk/universal-credit'
  },
  {
    keys: ['return to work', 'phased return', 'after episode'],
    title: 'Returning to Work After an Episode',
    body: 'A phased return — reduced hours building back over 2–4 weeks — is the standard pattern, agreed between you, your GP, and HR or Occupational Health. Ask for: a return-to-work meeting before day one, an agreed first-day workload, time excluded from on-call rotas, regular check-ins for 4–6 weeks, and a clear plan if things slip. Many people relapse on return because they go too fast — slower is safer.',
    link: 'https://www.acas.org.uk/returning-to-work-after-absence'
  }
];

const _PREGNANCY = [
  {
    keys: ['preconception', 'pre-conception', 'planning pregnancy', 'trying to conceive'],
    title: 'Pre-Conception Planning',
    body: 'Ideally start the conversation 6–12 months before trying to conceive. Topics: which meds are safest to continue (lamotrigine, some antipsychotics, lithium with monitoring), which to taper off (valproate is contraindicated for pregnancy in most circumstances), folic acid 5mg daily, perinatal mental-health team referral, contingency plan for relapse, and partner involvement. Coming off all meds for pregnancy almost always relapses; informed continuation is the usual safer path.',
    link: 'https://www.rcpsych.ac.uk/mental-health/mental-illnesses-and-mental-health-problems/planning-a-pregnancy'
  },
  {
    keys: ['lithium pregnancy', 'lithium baby', 'ebstein'],
    title: 'Lithium in Pregnancy',
    body: 'Once thought catastrophic; current evidence is more nuanced — there\'s a small increase in cardiac malformations (Ebstein\'s anomaly) when used in the first trimester (around 0.6% vs 0.18% background), and risk of neonatal complications around delivery. Levels can shift dramatically because of changing fluid volumes and kidney function — monthly bloods through pregnancy, weekly near delivery, and held briefly around labour. Often a reasonable continuation for high-relapse-risk patients.',
    link: 'https://www.nhs.uk/conditions/lithium-medicine/pregnancy-and-breastfeeding/'
  },
  {
    keys: ['valproate pregnancy', 'sodium valproate', 'epilim', 'pregnancy prevention'],
    title: 'Valproate & the Pregnancy Prevention Programme',
    body: 'Valproate carries roughly a 10% risk of major birth defects and a 30–40% risk of developmental disorder when taken in pregnancy — the highest of any commonly-used psychiatric drug. Since 2018 it\'s banned in pregnancy in the UK except in extreme circumstances, and people of childbearing potential must be on the Pregnancy Prevention Programme (annual specialist review plus reliable contraception). Talk to your prescriber about switching if you might become pregnant.',
    link: 'https://www.gov.uk/government/publications/valproate-use-by-women-and-girls'
  },
  {
    keys: ['medications pregnancy', 'antipsychotic pregnancy', 'lamotrigine pregnancy'],
    title: 'Other Medications in Pregnancy',
    body: 'Lamotrigine has the most reassuring data among mood stabilisers and is generally considered safer. Olanzapine and quetiapine have moderate data; gestational diabetes risk is the main flag. SSRIs are widely used in pregnancy with small absolute risks. Benzodiazepines and z-drugs are avoided where possible. Always weigh against the harm of an untreated episode, which carries real risk to both parent and baby.',
    link: 'https://www.rcpsych.ac.uk/mental-health/mental-illnesses-and-mental-health-problems/mental-health-in-pregnancy'
  },
  {
    keys: ['perinatal team', 'perinatal mental health', 'pmh team'],
    title: 'Perinatal Mental Health Teams',
    body: 'NHS specialist teams that look after pregnant and recently-postpartum people with serious mental illness. Available in most parts of England (less consistent elsewhere in the UK). Referrals from GP, midwife, or self-referral via the trust. They liaise with your obstetric team, monitor mood through pregnancy, plan delivery, and arrange postpartum support. Ask your midwife about local services as soon as pregnancy is confirmed.',
    link: 'https://www.england.nhs.uk/mental-health/perinatal/'
  },
  {
    keys: ['postpartum psychosis', 'puerperal psychosis', 'pp'],
    title: 'Postpartum Psychosis',
    body: 'A psychiatric emergency affecting 1 in 1000 births overall, but 25–50% of births in women with bipolar I. Onset is usually in the first 2 weeks postpartum, often abrupt. Symptoms: confusion, paranoia, mania, hallucinations, severe insomnia. Treatable but always needs immediate admission, ideally to a Mother & Baby Unit. Pre-emptive lithium or antipsychotic prophylaxis is standard for high-risk patients in the week after birth.',
    link: 'https://www.app-network.org/'
  },
  {
    keys: ['breastfeeding', 'nursing', 'lactation', 'breast milk meds'],
    title: 'Breastfeeding & Medication',
    body: 'Many psychiatric meds pass into breast milk but at much lower doses than in pregnancy. Lithium is generally avoided (high transfer, infant blood monitoring needed if used). Lamotrigine and sertraline are commonly considered compatible. Olanzapine and quetiapine carry sedation risk for the baby. The Breastfeeding Network drug factsheets and the LactMed database are the best references; perinatal teams can advise on individual decisions.',
    link: 'https://www.breastfeedingnetwork.org.uk/detailed-information/drugs-factsheets/'
  },
  {
    keys: ['mother and baby unit', 'mbu', 'inpatient mother', 'mother baby'],
    title: 'Mother & Baby Units (MBUs)',
    body: 'Specialist NHS inpatient wards where a mother with severe perinatal mental illness can be admitted with her baby (under 12 months, sometimes older). Outcomes are far better than separating mother and infant. There are around 22 MBUs across the UK — sometimes admission means travelling. Action on Postpartum Psychosis (APP) maintains a current map and a peer-support network for mothers who have been through PP.',
    link: 'https://www.app-network.org/what-is-pp/getting-help/mbus/'
  }
];

const _MEDIA = [
  {
    keys: ['unquiet mind', 'jamison', 'kay redfield', 'kay jamison', 'book'],
    title: 'An Unquiet Mind — Kay Redfield Jamison (book)',
    body: 'The defining memoir of bipolar I, written by a clinical psychologist who has the illness herself. Published 1995 and still the first book most newly-diagnosed people are recommended. Beautifully written, unflinching about the manic highs as well as the costs. Pairs well with her later book Touched with Fire on the link between mood disorders and creativity.',
    link: 'https://en.wikipedia.org/wiki/An_Unquiet_Mind'
  },
  {
    keys: ['madness', 'hornbacher', 'marya', 'book'],
    title: 'Madness: A Bipolar Life — Marya Hornbacher (book)',
    body: 'The younger, rawer, more chaotic counterpoint to Jamison — Hornbacher\'s memoir covers rapid cycling, substance use, eating disorders, and years of misdiagnosis before finding the right meds. Some readers find it triggering; others find it the only book that names what their life has felt like. Honest about how long it can take to find stability.',
    link: 'https://en.wikipedia.org/wiki/Madness:_A_Bipolar_Life'
  },
  {
    keys: ['miklowitz', 'survival guide', 'bipolar survival', 'book'],
    title: 'The Bipolar Disorder Survival Guide — David Miklowitz (book)',
    body: 'The standard "what to actually do" handbook by one of the world\'s leading bipolar researchers (and developer of Family-Focused Therapy). Practical chapters on mood charting, prodrome work, talking to family, choosing therapy, managing meds. Now in its 4th edition. Less literary than the memoirs but the one to give a partner or parent.',
    link: 'https://www.guilford.com/books/The-Bipolar-Disorder-Survival-Guide/David-Miklowitz/9781462553624'
  },
  {
    keys: ['electroboy', 'behrman', 'ect memoir', 'book'],
    title: 'Electroboy — Andy Behrman (book)',
    body: 'A wild memoir of New York art-world mania, fraud, and ultimately ECT (electroconvulsive therapy) — which Behrman credits with saving his life. Unusual for being honest about ECT working when nothing else did. Hard, often uncomfortable, and very funny in places.',
    link: 'https://en.wikipedia.org/wiki/Electroboy'
  },
  {
    keys: ['manic', 'terri cheney', 'cheney', 'book'],
    title: 'Manic — Terri Cheney (book)',
    body: 'A non-chronological memoir of life with treatment-resistant bipolar I, structured as discrete mood-driven episodes rather than a linear story. Cheney is a former entertainment lawyer; the writing is sharp and the structure mirrors the disorder itself. Her New York Times essay later became the Modern Love TV episode below.',
    link: 'https://en.wikipedia.org/wiki/Terri_Cheney'
  },
  {
    keys: ['silver linings', 'silver linings playbook', 'cooper', 'lawrence', 'film'],
    title: 'Silver Linings Playbook (2012) — film',
    body: 'Bradley Cooper plays a recently-discharged bipolar I man trying to rebuild after a manic episode. The first big mainstream film to portray bipolar with sympathy and humour. Slightly oversimplifies the recovery arc, but the depiction of mood swings, family dynamics, and the dance between mania and grief lands well. Based on Matthew Quick\'s novel.',
    link: 'https://en.wikipedia.org/wiki/Silver_Linings_Playbook'
  },
  {
    keys: ['touched with fire', 'paul dalio', 'film 2015'],
    title: 'Touched with Fire (2015) — film',
    body: 'Two poets with bipolar meet in a psychiatric hospital and fall into a relationship that swings between transcendence and disaster. Written and directed by Paul Dalio, who has bipolar himself, with Kay Redfield Jamison consulting. Slow and sometimes uneven, but honest about the seductive pull of mania and the impossible choice between medication and intensity.',
    link: 'https://en.wikipedia.org/wiki/Touched_with_Fire_(film)'
  },
  {
    keys: ['mr jones', 'richard gere', 'figgis', 'film'],
    title: 'Mr Jones (1993) — film',
    body: 'Richard Gere plays a man with untreated bipolar disorder; Lena Olin is the psychiatrist who treats him. Of its era — the diagnostic language is dated, the romance subplot is dubious — but the manic sequences (particularly the conductor scene) remain one of the most accurate depictions of mania on screen.',
    link: 'https://en.wikipedia.org/wiki/Mr._Jones_(1993_film)'
  },
  {
    keys: ['polar bear', 'infinitely polar bear', 'maya forbes', 'mark ruffalo', 'film'],
    title: 'Infinitely Polar Bear (2014) — film',
    body: 'Mark Ruffalo plays a father with bipolar disorder caring for his two young daughters in 1970s Boston while his wife trains in another city. Based on writer/director Maya Forbes\'s own childhood. Gentle, funny, accurate about the texture of living with a parent who has bipolar — without sanitising it.',
    link: 'https://en.wikipedia.org/wiki/Infinitely_Polar_Bear'
  },
  {
    keys: ['modern love', 'anne hathaway', 'whoever i am', 'tv'],
    title: 'Modern Love S1E3 — "Take Me as I Am" (TV)',
    body: 'Anne Hathaway plays a successful lawyer hiding bipolar I — and the swing-of-the-pendulum mid-episode is one of the most accessible portrayals of bipolar on screen. Adapted from Terri Cheney\'s New York Times essay (Cheney also wrote Manic). 30 minutes. Worth showing to family who want to understand.',
    link: 'https://en.wikipedia.org/wiki/Modern_Love_(TV_series)'
  },
  {
    keys: ['stephen fry', 'manic depressive', 'documentary'],
    title: 'Stephen Fry: The Secret Life of the Manic Depressive (2006) — documentary',
    body: 'BBC documentary in which Stephen Fry — who has bipolar I — interviews celebrities, clinicians, and ordinary people about the illness. The language is slightly dated now but it holds up as a humane, intelligent introduction. The 2016 follow-up The Not So Secret Life of the Manic Depressive: 10 Years On picks up where it left off.',
    link: 'https://en.wikipedia.org/wiki/Stephen_Fry:_The_Secret_Life_of_the_Manic_Depressive'
  },
  {
    keys: ['bipolar podcast', 'bipolar uk podcast', 'inside bipolar', 'podcast'],
    title: 'Bipolar Podcasts — Bipolar UK / Inside Bipolar / MIHH',
    body: 'A range of bipolar-focused podcasts exist. The Bipolar UK Podcast is the UK peer-led option; Inside Bipolar (Psych Central) is an honest US-based show co-hosted by people with and treating the condition; Mental Illness Happy Hour by Paul Gilmartin covers a wider mental-health landscape with frequent bipolar episodes. All free on major podcast apps.',
    link: 'https://www.bipolaruk.org/'
  }
];

const _LOVED_ONES = [
  {
    keys: ['spot warning', 'early signs partner', 'noticing change', 'family warning'],
    title: 'Spotting the Early Signs',
    body: 'You\'ll often see prodromal symptoms before your loved one does — they\'re sometimes the last to notice. Common changes: sleep patterns shifting, irritability creeping up, spending or risk-taking rising, withdrawal from texts and plans, or unusual energy and grandiose ideas. Ask in a calm moment to be told what you should look out for, write it down together, and agree how you\'ll raise it when you see it. A pre-agreed phrase ("can we check the warning list?") is less inflammatory in the moment than "I think you\'re manic".',
    link: 'https://www.bipolaruk.org/Pages/Category/family-and-friends'
  },
  {
    keys: ['what to say', 'language', 'how to talk', 'comfort', 'communication'],
    title: 'What to Say (and What Not to Say)',
    body: 'Helpful: "I\'m here, what do you need right now?", "I noticed you haven\'t slept much — how are you doing?", "I love you. This is the illness, not you." Unhelpful: "Just snap out of it", "Cheer up", or "Have you taken your meds?" used as a constant question. Validate first, problem-solve later. Don\'t argue with delusions during mania — neither agreeing nor pushing back works; redirecting to safety usually does.',
    link: 'https://www.mind.org.uk/information-support/helping-someone-else/'
  },
  {
    keys: ['mania help', 'manic episode', 'helping mania', 'partner mania'],
    title: 'Helping During a Manic Episode',
    body: 'Mania can feel like watching someone you love drive at speed with no brakes. Practical anchors: limit credit-card or banking access if agreed in advance, reduce stimulating environments, protect sleep, avoid escalation arguments (the brain isn\'t fully online), and call the CMHT or crisis team before things require A&E. Keep a written record of what you observe and when — clinicians find timestamped notes invaluable. Don\'t try to do it alone; bring in other family or friends in shifts.',
    link: 'https://www.bipolaruk.org/Pages/Category/family-and-friends'
  },
  {
    keys: ['depression help', 'depressive episode', 'helping depression', 'partner depression'],
    title: 'Helping During a Depressive Episode',
    body: 'Depression often steals the ability to ask for help. Small, low-demand acts beat grand gestures: drop off food, sit nearby without expectation, suggest one small walk, handle one piece of admin. Avoid pressuring "you need to get out more" — agency is part of what\'s broken. Watch for hopelessness, giving away possessions, or sudden calm after distress — those can signal active suicide risk. Ask directly about suicidal thoughts; asking does not "plant the idea", and the evidence on this is clear.',
    link: 'https://www.samaritans.org/how-we-can-help/if-youre-worried-about-someone-else/'
  },
  {
    keys: ['hospital partner', 'admission carer', 'visiting hospital', 'inpatient support'],
    title: 'Supporting Through a Hospital Admission',
    body: 'Visit regularly even if conversations are short; bring familiar things (favourite snacks, photos, a familiar jumper) within the ward\'s rules. Ask to be involved in care-planning meetings — as a "nearest relative" under the Mental Health Act you have specific rights, including the right to be consulted about a Section 3 and to apply for discharge. Keep your own life going where you can; visiting is a marathon, not a sprint, and the recovery period after discharge is often harder than the admission itself.',
    link: 'https://www.rethink.org/advice-and-information/carers-hub/'
  },
  {
    keys: ['carer wellbeing', 'caregiver burnout', 'looking after yourself', 'compassion fatigue', 'self care carer'],
    title: 'Looking After Yourself',
    body: 'Carer burnout is real and predictable. The cycle is exhausting — episodes, recovery, fear of the next one — and trying to be the sole safety net is unsustainable. Keep at least one space that\'s just yours (a sport, a friendship, your own therapy), accept help when offered, and don\'t let care duties absorb every relationship. You can\'t pour from an empty cup, and a burned-out carer is no good to anyone. Carers UK runs a free helpline; Bipolar UK has a dedicated peer line for family and friends.',
    link: 'https://www.carersuk.org/help-and-advice/'
  },
  {
    keys: ['carer rights', 'carers assessment', 'carer act', 'nearest relative', 'carers allowance'],
    title: 'Your Rights as a Carer',
    body: 'In the UK, anyone providing unpaid care is entitled to a free Carer\'s Assessment via the local authority — covering practical, financial, and emotional support. Carer\'s Allowance is means-tested but worth checking. Under the Mental Health Act, the "nearest relative" (a specific legal role, not always the closest person) has standing including the right to apply for discharge from Section 2 or 3 and to be consulted about admissions. The Carers Act 2014 places duties on local councils to support carers in their own right.',
    link: 'https://www.gov.uk/carers-assessment'
  },
  {
    keys: ['when to call', 'crisis carer', 'urgent help', 'emergency family', 'calling 999'],
    title: 'When to Call for Help',
    body: 'Call the CMHT or crisis team if warning signs are building, sleep is being lost, or your loved one is talking about harm. Call 999 or take them to A&E if they are about to act on suicidal thoughts, have harmed themselves seriously, are out of touch with reality, or you can\'t keep them safe. As a carer in your own right, Samaritans (116 123), Bipolar UK\'s Family Line, and your own GP are available to you separately — you don\'t need to be the patient to make the call.',
    link: 'https://www.nhs.uk/mental-health/advice-for-life-situations-and-events/help-for-suicidal-thoughts/'
  }
];

function _renderWikiSimpleCards(items, disclaimerKey, defaultLinkLabelKey) {
  const body = document.getElementById('wiki-body');
  if (!body) return;
  const disclaimer = disclaimerKey
    ? `<div class="wiki-disclaimer">${esc(_wt(disclaimerKey))}</div>`
    : '';
  const defaultLabel = _wt(defaultLinkLabelKey || 'anon.wiki.moreInfo');
  body.innerHTML = disclaimer + items.map(c => {
    const search = (c.title + ' ' + c.body + ' ' + (c.keys || []).join(' ')).toLowerCase();
    const link = c.link || c.nhs;
    const linkHtml = link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="wiki-link-btn">${esc(c.linkLabel || defaultLabel)}</a>`
      : '';
    return `
      <details class="wiki-card" data-wiki-search="${esc(search)}">
        <summary>${esc(c.title)}<span class="wiki-chev">▼</span></summary>
        <div class="wiki-card-body">
          <p>${esc(c.body)}</p>
          ${linkHtml}
        </div>
      </details>`;
  }).join('');
  applyWikiFilter();
}

function renderWikiTherapies()     { _renderWikiSimpleCards(_THERAPIES,     'anon.wiki.therapiesDisclaimer'); }
function renderWikiLifestyle()     { _renderWikiSimpleCards(_LIFESTYLE,     'anon.wiki.lifestyleDisclaimer'); }
function renderWikiWarningSigns()  { _renderWikiSimpleCards(_WARNING_SIGNS, 'anon.wiki.warningSignsDisclaimer'); }
function renderWikiSideEffects()   { _renderWikiSimpleCards(_SIDE_EFFECTS,  'anon.wiki.sideEffectsDisclaimer'); }
function renderWikiHospital()      { _renderWikiSimpleCards(_HOSPITAL,      'anon.wiki.hospitalDisclaimer'); }
function renderWikiWorkplace()     { _renderWikiSimpleCards(_WORKPLACE,     'anon.wiki.workplaceDisclaimer'); }
function renderWikiPregnancy()     { _renderWikiSimpleCards(_PREGNANCY,     'anon.wiki.pregnancyDisclaimer'); }
function renderWikiMedia()         { _renderWikiSimpleCards(_MEDIA,         'anon.wiki.mediaDisclaimer'); }
function renderWikiLovedOnes()     { _renderWikiSimpleCards(_LOVED_ONES,    'anon.wiki.lovedOnesDisclaimer'); }

function renderWikiConditions() {
  const body = document.getElementById('wiki-body');
  if (!body) return;
  body.innerHTML = `
    <div class="wiki-disclaimer">${esc(_wt('anon.wiki.conditionsDisclaimer'))}</div>
    ${_CONDITIONS.map(c => {
      const search = (c.title + ' ' + c.body + ' ' + (c.keys || []).join(' ')).toLowerCase();
      return `
        <details class="wiki-card" data-wiki-search="${esc(search)}">
          <summary>${esc(c.title)}<span class="wiki-chev">▼</span></summary>
          <div class="wiki-card-body">
            <p>${esc(c.body)}</p>
            <a href="${esc(c.nhs)}" target="_blank" rel="noopener" class="wiki-link-btn">${esc(_wt('anon.wiki.nhsInfo'))}</a>
          </div>
        </details>`;
    }).join('')}
  `;
  applyWikiFilter();
}

function renderWikiMeds() {
  const body = document.getElementById('wiki-body');
  if (!body) return;
  const meds = (window.BB && window.BB.medications && window.BB.medications.list) || [];
  body.innerHTML = `
    <div class="wiki-disclaimer">${esc(_wt('anon.wiki.medsDisclaimer'))}</div>
    ${meds.map(m => {
      const search = (m.title + ' ' + m.body + ' ' + (m.keys || []).join(' ')).toLowerCase();
      return `
        <details class="wiki-card" data-wiki-search="${esc(search)}">
          <summary>${esc(m.title)}<span class="wiki-chev">▼</span></summary>
          <div class="wiki-card-body">
            <p>${esc(m.body)}</p>
            <a href="${esc(m.nhs)}" target="_blank" rel="noopener" class="wiki-link-btn">${esc(_wt('anon.wiki.nhsInfo'))}</a>
          </div>
        </details>`;
    }).join('')}
  `;
  applyWikiFilter();
}

async function renderWikiGroups() {
  const body = document.getElementById('wiki-body');
  if (!body) return;
  body.innerHTML = `<div class="wiki-loading">${esc(_wt('anon.wiki.loadingGroups'))}</div>`;
  try {
    if (!_wikiCache.groups) {
      const res = await fetch('data/wiki-support-groups.json', { cache: 'no-cache' });
      _wikiCache.groups = await res.json();
    }
    // Drop the placeholder example entry shipped in the seed file.
    const groups = (_wikiCache.groups.groups || []).filter(g => !/Example/i.test(g.name || ''));
    if (groups.length === 0) {
      // emptyGroups contains a link (HTML); render via innerHTML.
      body.innerHTML = `<div class="wiki-empty">${_wt('anon.wiki.emptyGroups')}</div>`;
      return;
    }
    const byRegion = {};
    groups.forEach(g => {
      const r = g.region || 'Other';
      (byRegion[r] = byRegion[r] || []).push(g);
    });
    body.innerHTML = Object.keys(byRegion).sort().map(region => `
      <h3 class="wiki-region-heading" data-wiki-region="${esc(region)}">${esc(region)}</h3>
      ${byRegion[region].map(g => {
        const search = [g.name, g.region, g.format, g.when, g.location,
                        g.contactName, g.contactEmail, g.contactPhone, g.notes]
                        .filter(Boolean).join(' ').toLowerCase();
        return `
          <details class="wiki-card" data-wiki-search="${esc(search)}" data-wiki-region-card="${esc(region)}">
            <summary>${esc(g.name)}<span class="wiki-chev">▼</span></summary>
            <div class="wiki-card-body">
              ${g.format   ? `<div class="wiki-meta"><strong>${esc(_wt('anon.wiki.format'))}</strong> ${esc(g.format)}</div>` : ''}
              ${g.when     ? `<div class="wiki-meta"><strong>${esc(_wt('anon.wiki.when'))}</strong> ${esc(g.when)}</div>` : ''}
              ${g.location ? `<div class="wiki-meta"><strong>${esc(_wt('anon.wiki.where'))}</strong> ${esc(g.location)}</div>` : ''}
              ${(g.contactName || g.contactEmail || g.contactPhone) ? `<div class="wiki-meta"><strong>${esc(_wt('anon.wiki.contact'))}</strong>
                ${g.contactName  ? ' ' + esc(g.contactName) : ''}
                ${g.contactEmail ? ` <a href="mailto:${esc(g.contactEmail)}">${esc(g.contactEmail)}</a>` : ''}
                ${g.contactPhone ? ` <a href="tel:${esc(g.contactPhone)}">${esc(g.contactPhone)}</a>` : ''}
              </div>` : ''}
              ${g.notes ? `<p class="wiki-notes">${esc(g.notes)}</p>` : ''}
              ${g.link  ? `<a href="${esc(g.link)}" target="_blank" rel="noopener" class="wiki-link-btn">${esc(_wt('anon.wiki.moreInfo'))}</a>` : ''}
            </div>
          </details>`;
      }).join('')}
    `).join('');
    applyWikiFilter();
  } catch (err) {
    console.error('[Wiki] support groups fetch failed', err);
    body.innerHTML = `<div class="wiki-empty">${esc(_wt('anon.wiki.errorGroups'))}</div>`;
  }
}

async function renderWikiWisdom() {
  const body = document.getElementById('wiki-body');
  if (!body) return;
  body.innerHTML = `<div class="wiki-loading">${esc(_wt('anon.wiki.loadingGeneric'))}</div>`;
  try {
    if (!_wikiCache.posts) {
      const res = await fetch('data/wiki-posts.json', { cache: 'no-cache' });
      _wikiCache.posts = await res.json();
    }
    const entries = _wikiCache.posts.entries || [];
    if (entries.length === 0) {
      body.innerHTML = `<div class="wiki-empty">${esc(_wt('anon.wiki.emptyWisdom'))}</div>`;
      return;
    }
    body.innerHTML = entries.map(e => {
      const search = [e.text, e.topic, e.monika].filter(Boolean).join(' ').toLowerCase();
      return `
        <div class="wiki-wisdom-card" data-wiki-search="${esc(search)}">
          ${e.topic ? `<div class="wiki-wisdom-topic">${esc(e.topic)}</div>` : ''}
          <p class="wiki-wisdom-text">${esc(e.text)}</p>
          ${e.monika ? `<div class="wiki-wisdom-attr">— ${esc(e.monika)}</div>` : ''}
        </div>`;
    }).join('');
    applyWikiFilter();
  } catch (err) {
    console.error('[Wiki] posts fetch failed', err);
    body.innerHTML = `<div class="wiki-empty">${esc(_wt('anon.wiki.errorWisdom'))}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────
// Posts — Firestore real-time listener
// ─────────────────────────────────────────────────────────────────
function sortPosts(posts) {
  const getTime = p => {
    const la = p.lastActivity?.toMillis?.() ?? (p.lastActivity instanceof Date ? p.lastActivity.getTime() : 0);
    const ts = p.timestamp?.toMillis?.()    ?? (p.timestamp    instanceof Date ? p.timestamp.getTime()    : 0);
    return Math.max(la, ts);
  };
  return [...posts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return getTime(b) - getTime(a);
  });
}

function todaySystemPost() {
  const h = new Date().getHours();
  let icon, text;
  if      (h >= 5  && h < 12) { icon = '☀️';  text = 'Good morning. You are loved. Have a good day. 💛'; }
  else if (h >= 12 && h < 17) { icon = '🌤️'; text = 'Hope your afternoon is going well. You\'re doing great. 💛'; }
  else if (h >= 17 && h < 21) { icon = '🌙';  text = 'Good evening. Be kind to yourself tonight. 💛'; }
  else                         { icon = '⭐';  text = 'Still awake? Take care of yourself — you matter. 💛'; }
  return { id: 'sys_daily', isSystem: true, icon, text };
}

function seedPosts() {
  return [
    { id: 'seed_1', isSeed: true, tab: 'general', name: 'SunnyDaze', streak: 42, text: 'Today was really hard but I made it through. Small wins 💛', timestamp: null, likes: 5, med: 'Lithium', grad1: YELLOW_LT, grad2: YELLOW_DARK, initials: 'SD' },
    { id: 'seed_2', isSeed: true, tab: 'general', name: 'NightOwl',  streak: 7,  text: 'Anyone else struggle with mornings? Takes me until noon to feel human 😅', timestamp: null, likes: 3, med: '', grad1: '#64b5f6', grad2: '#1565c0', initials: 'NO' },
  ];
}

function assembleGeneralPosts(realPosts) {
  return [todaySystemPost(), ...sortPosts(realPosts), ...seedPosts()];
}

function listenPosts() {
  stopAllListeners();
  postsByTab = { announcements: [], general: [] };
  localPosts = [];

  if (!db) {
    renderPosts(currentTab === 'general' ? assembleGeneralPosts([]) : announcementPosts());
    return;
  }

  document.getElementById('post-list').innerHTML =
    '<div class="empty-state">Loading…</div>';

  // Run one listener per tab simultaneously so badge counts stay live
  // even when the user is looking at the other tab.
  ['announcements', 'general'].forEach(tab => {
    unsubTabListeners[tab] = db.collection(BB_BRAND.collections.posts)
      .where('tab', '==', tab)
      .limit(60)
      .onSnapshot(snap => {
        postsByTab[tab] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (tab === currentTab) {
          localPosts = postsByTab[tab];
          renderPosts(tab === 'general'
            ? assembleGeneralPosts(localPosts)
            : sortPosts(localPosts));
        }
        renderTabBadges();
      }, err => {
        console.error('[Anonymous] posts error', tab, err);
        if (tab === currentTab) {
          renderPosts(currentTab === 'general'
            ? assembleGeneralPosts(localPosts)
            : (localPosts.length ? sortPosts(localPosts) : announcementPosts()));
        }
      });
  });
}

function announcementPosts() {
  return [
    { id: 'ann1', isAnnouncement: true, text: '📢 Welcome to BipolarBear Anonymous! Be kind, be you, be safe. 💛', timestamp: null },
    { id: 'ann2', isAnnouncement: true, text: '📢 You can now show your medication on your profile — helping others feel less alone.', timestamp: null },
  ];
}

function demoData() {
  return currentTab === 'announcements' ? announcementPosts() : assembleGeneralPosts([]);
}

// ─────────────────────────────────────────────────────────────────
// Auto-delete posts older than 7 days (skip reported ones)
// ─────────────────────────────────────────────────────────────────
async function cleanOldPosts() {
  if (!db) return;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    // Query posts whose original timestamp is past the cutoff; we then
    // check lastActivity client-side to preserve posts kept alive by comments.
    const snap = await db.collection(BB_BRAND.collections.posts)
      .where('timestamp', '<', cutoff)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.reported || data.pinned) return;
      // Preserve if a comment was added within the 7-day window
      if (data.lastActivity) {
        const laMs = data.lastActivity.toMillis
          ? data.lastActivity.toMillis()
          : (data.lastActivity instanceof Date ? data.lastActivity.getTime() : 0);
        if (laMs >= cutoff.getTime()) return;
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (e) {
    console.warn('[Anonymous] cleanOldPosts:', e);
  }
}

// ─────────────────────────────────────────────────────────────────
// Comment threads
// ─────────────────────────────────────────────────────────────────
function openThread(postId) {
  const post = localPosts.find(p => p.id === postId);
  if (!post || post.isSeed) return;
  commentTargetId = postId;

  document.getElementById('thread-original-post').innerHTML = renderThreadHeader(post);
  document.getElementById('thread-comments-list').innerHTML =
    '<div class="empty-state" style="padding:24px 0;">Loading comments…</div>';

  const ta = document.getElementById('thread-ta');
  ta.value = '';
  document.getElementById('thread-send').disabled = true;

  openOv('ov-thread');
  setTimeout(() => ta.focus(), 220);

  if (currentThreadUnsub) { currentThreadUnsub(); currentThreadUnsub = null; }
  if (!db) {
    document.getElementById('thread-comments-list').innerHTML =
      '<div class="empty-state" style="padding:24px 0 16px;">No comments yet — be the first! 💛</div>';
    return;
  }

  currentThreadUnsub = db.collection(BB_BRAND.collections.posts).doc(postId)
    .collection('comments')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snap => {
      const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const el = document.getElementById('thread-comments-list');
      if (!comments.length) {
        el.innerHTML = '<div class="empty-state" style="padding:24px 0 16px;">No comments yet — be the first! 💛</div>';
        return;
      }
      el.innerHTML = comments.map(renderComment).join('');
    }, err => {
      console.warn('[Thread] comments listener error', err);
      const el = document.getElementById('thread-comments-list');
      if (el) el.innerHTML = '<div class="empty-state" style="padding:24px 0 16px;">No comments yet — be the first! 💛</div>';
    });
}

function closeThread() {
  if (currentThreadUnsub) { currentThreadUnsub(); currentThreadUnsub = null; }
  closeOv('ov-thread');
  commentTargetId = '';
}

function renderThreadHeader(p) {
  const g1 = safeColor(p.grad1, YELLOW_LT);
  const g2 = safeColor(p.grad2, YELLOW_DARK);
  const av = p.initials || initials(p.name);
  const adminBadge = p.isAdmin ? '<span class="admin-badge">ADMIN</span>' : '';
  const showMed    = profile.showMeds && p.med;
  const streakNum  = num(p.streak, 1);
  const stableNum  = num(p.stable, 0);
  const showStable = stableNum > 0;
  return `<div class="thread-orig-post">
    <div class="post-header">
      <div class="post-avatar">
        <div class="post-av-circle" style="background:linear-gradient(135deg,${g1},${g2});">${esc(av)}</div>
        <div>
          <div class="post-name">[${esc(p.name)}]${adminBadge} 🔥 ${streakNum}d${showStable ? ` 🧘 ${stableNum}d` : ''}</div>
          ${showMed ? `<div class="post-med">💊 ${esc(p.med)}</div>` : ''}
        </div>
      </div>
      <span class="post-time">${p.timestamp ? timeAgo(p.timestamp) : 'now'}</span>
    </div>
    <div class="post-text">${esc(p.text)}</div>
  </div>`;
}

function renderComment(c) {
  const g1 = safeColor(c.grad1, YELLOW_LT);
  const g2 = safeColor(c.grad2, YELLOW_DARK);
  const av = c.initials || initials(c.name);
  const adminBadge = c.isAdmin ? '<span class="admin-badge">ADMIN</span>' : '';
  return `<div class="comment-card">
    <div class="comment-header">
      <div class="post-av-circle" style="width:28px;height:28px;font-size:11px;flex-shrink:0;background:linear-gradient(135deg,${g1},${g2});">${esc(av)}</div>
      <div style="flex:1;min-width:0;">
        <span class="post-name" style="font-size:12px;">[${esc(c.name)}]${adminBadge}</span>
        <span style="font-size:11px;color:var(--muted);margin-left:6px;">${c.timestamp ? timeAgo(c.timestamp) : 'now'}</span>
      </div>
    </div>
    <div class="comment-text">${esc(c.text)}</div>
  </div>`;
}

function setupThread() {
  const ta      = document.getElementById('thread-ta');
  const sendBtn = document.getElementById('thread-send');

  ta.addEventListener('input', () => { sendBtn.disabled = !ta.value.trim(); });
  document.getElementById('thread-close').addEventListener('click', closeThread);

  let _sending = false;
  sendBtn.addEventListener('click', async () => {
    if (_sending) return;
    const text = ta.value.trim();
    if (!text || !commentTargetId) return;
    _sending = true;
    sendBtn.disabled = true;
    ta.value = '';

    const comment = {
      name:      profile.monika,
      text,
      streak:    profile.streak,
      initials:  profile.avatarInitials(),
      grad1:     profile.grad1,
      grad2:     profile.grad2,
      isAdmin:   profile.isAdmin,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (db) {
      try {
        const postRef = db.collection(BB_BRAND.collections.posts).doc(commentTargetId);
        await postRef.collection('comments').add(comment);
        // Bump the parent post to the top of the board and update count
        await postRef.update({
          lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
          commentCount: firebase.firestore.FieldValue.increment(1),
        });
      } catch (e) {
        console.error('[Thread] comment failed', e);
      }
    }
    _sending = false;
  });
}

// ─────────────────────────────────────────────────────────────────
// Admin: pin/unpin post
// ─────────────────────────────────────────────────────────────────
async function handlePin(postId, tab) {
  if (!db || !profile.isAdmin) return;
  const post = localPosts.find(p => p.id === postId);
  if (!post) return;
  const isPinned = !!post.pinned;

  try {
    if (!isPinned) {
      // Unpin any existing pinned post in this tab first (one pin per tab)
      const existing = await db.collection(BB_BRAND.collections.posts)
        .where('tab', '==', tab)
        .where('pinned', '==', true)
        .get();
      const batch = db.batch();
      existing.docs.forEach(doc => batch.update(doc.ref, { pinned: false }));
      batch.update(db.collection(BB_BRAND.collections.posts).doc(postId), { pinned: true });
      await batch.commit();
      showHint('Post pinned 📌');
    } else {
      await db.collection(BB_BRAND.collections.posts).doc(postId).update({ pinned: false });
      showHint('Post unpinned');
    }
  } catch (e) {
    console.error('[Admin] pin failed', e);
    showHint('Failed to update pin');
  }
}

// ─────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────
function renderPosts(posts) {
  const list = document.getElementById('post-list');
  if (!posts.length) {
    list.innerHTML = '<div class="empty-state">No posts yet — be the first! 🌱</div>';
    return;
  }
  // Collapse runs of deleted posts: keep only the most recent tombstone, drop the rest.
  // Posts are sorted newest-first (sortPosts), so the first deleted in iteration is
  // the most recent. Prevents a wall of "post was deleted" entries when an admin
  // removes several spam posts in a row.
  let _keptDeletedTombstone = false;
  posts = posts.filter(p => {
    if (!p.deleted) return true;
    if (_keptDeletedTombstone) return false;
    _keptDeletedTombstone = true;
    return true;
  });
  list.innerHTML = posts.map(p => {
    if (p.isSystem)       return renderSystem(p);
    if (p.isAnnouncement) return renderAnnouncement(p);
    return renderPost(p);
  }).join('');

  // Like buttons
  list.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', () => handleLike(btn));
  });
  // SOS buttons
  list.querySelectorAll('[data-sos]').forEach(btn => {
    btn.addEventListener('click', () => {
      sosTargetName = btn.dataset.sos;
      document.getElementById('sos-body').innerHTML =
        `Are you worried about <strong>[${esc(sosTargetName)}]</strong>? A moderator will be notified to check in. Only use this if genuinely concerned.`;
      openOv('ov-sos');
    });
  });
  // Report buttons
  list.querySelectorAll('[data-report]').forEach(btn => {
    btn.addEventListener('click', () => {
      reportTargetId = btn.dataset.report;
      openOv('ov-report');
    });
  });
  // Self-delete buttons
  list.querySelectorAll('[data-selfdelete]').forEach(btn => {
    btn.addEventListener('click', () => {
      selfDeleteId = btn.dataset.selfdelete;
      openOv('ov-self-delete');
    });
  });
  // Admin delete buttons
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      adminDeleteId = btn.dataset.delete;
      openOv('ov-admin-delete');
    });
  });
  // Comment thread buttons
  list.querySelectorAll('[data-comment]').forEach(btn => {
    btn.addEventListener('click', () => openThread(btn.dataset.comment));
  });
  // Admin pin buttons
  list.querySelectorAll('[data-pin]').forEach(btn => {
    btn.addEventListener('click', () => handlePin(btn.dataset.pin, btn.dataset.tab));
  });
}

function renderSystem(p) {
  return `<div class="sys-card">
    <div class="sys-emoji">${esc(p.icon) || '☀️'}</div>
    <div class="sys-text">${esc(p.text)}</div>
    <div class="sys-meta">BipolarBear${p.time ? ' · ' + esc(p.time) : (p.timestamp ? ' · ' + timeAgo(p.timestamp) : '')}</div>
  </div>`;
}

function renderAnnouncement(p) {
  return `<div class="ann-card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${YELLOW_LT},${YELLOW_DARK});display:flex;align-items:center;justify-content:center;font-size:16px;">🐻</div>
      <div style="font-size:13px;font-weight:700;color:var(--dark);">BipolarBear</div>
    </div>
    <div class="post-text">${esc(p.text)}</div>
  </div>`;
}

function renderPost(p) {
  if (p.deleted) {
    return `<div class="post-card"><div class="post-deleted">🛡️ This post was deleted by an admin</div></div>`;
  }
  const liked        = likedPosts.has(p.id);
  const likes        = num(p.likes, 0);
  const commentCount = num(p.commentCount, 0);
  const showMed      = profile.showMeds && p.med;
  const streakNum    = num(p.streak, 1);
  const stableNum    = num(p.stable, 0);
  const showStable   = stableNum > 0;
  const g1           = safeColor(p.grad1, YELLOW_LT);
  const g2           = safeColor(p.grad2, YELLOW_DARK);
  const av           = p.initials || initials(p.name);
  const adminBadge   = p.isAdmin ? '<span class="admin-badge">ADMIN</span>' : '';
  const deleteBtn    = profile.isAdmin && !p.isSeed
    ? `<button class="icon-btn" data-delete="${esc(p.id)}" title="Delete post (admin)">🗑️</button>` : '';
  const pinBtn       = profile.isAdmin && !p.isSeed
    ? `<button class="icon-btn${p.pinned ? ' pin-active' : ''}" data-pin="${esc(p.id)}" data-tab="${esc(p.tab || currentTab)}" title="${p.pinned ? 'Unpin post' : 'Pin to top'}">📌</button>` : '';
  const selfDeleteBtn = !p.isSeed && !profile.isAdmin && p.name === profile.monika && isSelfDeleteEligible(p)
    ? `<button class="icon-btn" data-selfdelete="${esc(p.id)}" title="Remove your post" style="opacity:0.4;">🗑️</button>` : '';
  const commentBtn   = !p.isSeed
    ? `<button class="comment-btn" data-comment="${esc(p.id)}" title="View comments">💬${commentCount > 0 ? ` <span>${commentCount}</span>` : ''}</button>` : '';
  const pinnedBadge  = p.pinned ? '<div class="pinned-badge">📌 Pinned</div>' : '';
  const postBday     = _birthdayCompact(p.joinedAt || '');
  return `<div class="post-card${p.pinned ? ' post-pinned' : ''}">
    ${pinnedBadge}
    <div class="post-header">
      <div class="post-avatar">
        <div class="post-av-circle" style="background:linear-gradient(135deg,${g1},${g2});">${esc(av)}</div>
        <div>
          <div class="post-name">[${esc(p.name)}]${adminBadge} 🔥 ${streakNum}d${showStable ? ` 🧘 ${stableNum}d` : ''}${postBday ? ` 🎂 ${postBday}` : ''}</div>
          ${showMed ? `<div class="post-med">💊 ${esc(p.med)}</div>` : ''}
        </div>
      </div>
      <span class="post-time">${p.timestamp ? timeAgo(p.timestamp) : 'now'}</span>
    </div>
    <div class="post-text">${esc(p.text)}</div>
    <div class="post-actions">
      <button class="like-btn ${liked ? 'liked' : ''}" data-id="${esc(p.id)}" data-likes="${likes}" data-author="${esc(p.name)}"${p.name === profile.monika ? ' data-self="true" style="opacity:0.35;cursor:default;" title="You cannot like your own post"' : ''}>
        💛 <span>${likes}</span>
      </button>
      ${commentBtn}
      <div style="flex:1"></div>
      ${selfDeleteBtn}
      ${pinBtn}
      ${deleteBtn}
      ${p.name !== profile.monika ? `<button class="icon-btn" data-sos="${esc(p.name)}" title="Send SOS flag">🆘</button>` : ''}
      ${p.name !== profile.monika ? `<button class="icon-btn" data-report="${esc(p.id)}" title="Report post">🚨</button>` : ''}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────
// Likes
// ─────────────────────────────────────────────────────────────────
function handleLike(btn) {
  const id     = btn.dataset.id;
  const span   = btn.querySelector('span');
  const liked  = likedPosts.has(id);
  const count  = parseInt(btn.dataset.likes, 10) || 0;

  // Block self-likes (allow un-liking if somehow previously liked, to clean up)
  if (!liked && btn.dataset.author === profile.monika) {
    showHint("You can't like your own post 😊");
    return;
  }

  if (liked) {
    likedPosts.delete(id);
    btn.classList.remove('liked');
    btn.dataset.likes = count - 1;
    span.textContent  = count - 1;
    if (db) db.collection(BB_BRAND.collections.posts).doc(id).update({ likes: firebase.firestore.FieldValue.increment(-1) }).catch(() => {});
  } else {
    likedPosts.add(id);
    btn.classList.add('liked');
    btn.dataset.likes = count + 1;
    span.textContent  = count + 1;
    if (db) db.collection(BB_BRAND.collections.posts).doc(id).update({ likes: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
  }
  saveLiked();
}

// ─────────────────────────────────────────────────────────────────
// Post gate — check if first post has a like yet
// ─────────────────────────────────────────────────────────────────
function pollCanPost() {
  if (profile.canPost || !profile.hasPosted) return;
  const firstId = BB.storage.get('Anon_firstPostId');
  if (!firstId || !db) return;
  db.collection(BB_BRAND.collections.posts).doc(firstId).get().then(doc => {
    if (doc.exists && (doc.data().likes || 0) > 0) {
      BB.storage.set('Anon_canPost', 'true');
    }
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// FAB
// ─────────────────────────────────────────────────────────────────
function setupFAB() {
  document.getElementById('fab-ann').addEventListener('click', () => {
    if (currentTab === 'announcements') { showHint('Announcements already open'); return; }
    setTab('announcements');
  });
  document.getElementById('fab-gen').addEventListener('click', () => {
    if (currentTab === 'general') { showHint('General chat already open'); return; }
    setTab('general');
  });
  document.getElementById('fab-compose').addEventListener('click', () => {
    const latest = getLatestRealPost(currentTab);
    if (!profile.isAdmin && latest && latest.name === profile.monika && (latest.likes || 0) === 0) {
      showHint('Please wait until someone else reacts to your message or posts another one.');
      return;
    }
    document.getElementById('compose-ta').value = '';
    document.getElementById('compose-post').disabled = true;
    openOv('ov-compose');
    setTimeout(() => document.getElementById('compose-ta').focus(), 50);
  });
  document.getElementById('fab-e2ee').addEventListener('click', () => openOv('ov-e2ee'));

  document.getElementById('fab-home').addEventListener('click', openAbout);

  const searchBtn = document.getElementById('fab-search');
  if (searchBtn) searchBtn.addEventListener('click', toggleWikiSearch);
}

// ─────────────────────────────────────────────────────────────────
// Compose
// ─────────────────────────────────────────────────────────────────
function setupCompose() {
  const ta   = document.getElementById('compose-ta');
  const post = document.getElementById('compose-post');

  ta.addEventListener('input', () => { post.disabled = !ta.value.trim(); });

  document.getElementById('compose-cancel').addEventListener('click', () => closeOv('ov-compose'));

  let _posting = false;
  post.addEventListener('click', async () => {
    if (_posting) return; // guard against double-tap / re-entrant clicks
    const text = ta.value.trim();
    if (!text) return;
    _posting = true;
    post.disabled = true;
    closeOv('ov-compose');

    const now = new Date();
    const optimisticId = 'local-' + now.getTime();
    const entry = {
      name:     profile.monika,
      streak:   profile.streak,
      initials: profile.avatarInitials(),
      grad1:    profile.grad1,
      grad2:    profile.grad2,
      isAdmin:  profile.isAdmin,
      text,
      med:      profile.showMeds   ? profile.med          : '',
      stable:   profile.showStable ? profile.stableStreak : 0,
      joinedAt: profile.joinedAt   || null,
      tab:      currentTab,
      likes:    0,
      isSystem: false,
      timestamp: now,
    };

    // Show post immediately (optimistic update)
    localPosts.unshift({ id: optimisticId, ...entry });
    renderPosts(sortPosts(localPosts));

    let docId = null;
    if (db) {
      try {
        const ref = await db.collection(BB_BRAND.collections.posts).add({
          ...entry,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        docId = ref.id;
        // Replace optimistic entry with the real one from the snapshot (happens automatically)
      } catch (e) { console.error('[Anonymous] post failed', e); }
    }

    if (!profile.hasPosted) {
      if (docId) BB.storage.set('Anon_firstPostId', docId);
      BB.storage.set('Anon_hasPosted', 'true');
      openOv('ov-firstpost');
    }
    _posting = false;
  });
}

// ─────────────────────────────────────────────────────────────────
// Stability settings overlay
// ─────────────────────────────────────────────────────────────────
function openStableSettings() {
  closeOv('ov-monika');

  const isBB     = !!_bbUser;
  const streak   = profile.stableStreak;
  let   showStable = profile.showStable;

  // Show/hide the appropriate section
  document.getElementById('stable-ov-bb-section').style.display     = isBB ? '' : 'none';
  document.getElementById('stable-ov-manual-section').style.display  = isBB ? 'none' : '';

  if (isBB) {
    document.getElementById('stable-ov-bb-count').textContent = streak;
  } else {
    // Pre-fill date if already set
    const el = document.getElementById('stable-ov-date');
    el.value = profile.stableSince || '';
    el.max   = new Date().toISOString().slice(0, 10); // can't be future
  }

  function updateToggle() {
    document.getElementById('stable-ov-show').classList.toggle('active', showStable);
    document.getElementById('stable-ov-hide').classList.toggle('active', !showStable);
  }
  updateToggle();

  document.getElementById('stable-ov-show').onclick = () => { showStable = true;  updateToggle(); };
  document.getElementById('stable-ov-hide').onclick = () => { showStable = false; updateToggle(); };

  document.getElementById('stable-ov-cancel').onclick = () => closeOv('ov-stable');

  document.getElementById('stable-ov-save').onclick = () => {
    BB.storage.set('Anon_showStable', showStable ? 'true' : 'false');

    if (!isBB) {
      // Compute days from entered date
      const since = document.getElementById('stable-ov-date').value; // YYYY-MM-DD
      if (since) {
        BB.storage.set('Anon_stableSince', since);
        const days = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
        BB.storage.set('Anon_stableStreak', String(days));
      } else {
        BB.storage.remove('Anon_stableSince');
        BB.storage.set('Anon_stableStreak', '0');
      }
    }

    _anonSaveProfile(); _bbSaveProfile();
    closeOv('ov-stable');
    renderUserPill();
  };

  openOv('ov-stable');
}

// ─────────────────────────────────────────────────────────────────
// Overlay button wiring
// ─────────────────────────────────────────────────────────────────
function setupOverlayActions() {
  // First post
  document.getElementById('fp-yes').addEventListener('click', () => closeOv('ov-firstpost'));
  document.getElementById('fp-no').addEventListener('click',  () => closeOv('ov-firstpost'));

  // SOS
  document.getElementById('sos-cancel').addEventListener('click',  () => closeOv('ov-sos'));
  document.getElementById('sos-confirm').addEventListener('click', () => {
    closeOv('ov-sos');
    // Production: write SOS report to Firestore for moderator review
    if (db && sosTargetName) {
      db.collection(BB_BRAND.collections.reports).add({
        type: 'sos', targetName: sosTargetName,
        reportedBy: profile.monika, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
    showHint('SOS sent to moderators 🆘');
  });

  // Report
  document.querySelectorAll('.report-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      closeOv('ov-report');
      if (db && reportTargetId) {
        const post = localPosts.find(p => p.id === reportTargetId);
        db.collection(BB_BRAND.collections.reports).add({
          type: 'report', postId: reportTargetId, reason: btn.dataset.reason,
          postText: post ? post.text : '',
          postName: post ? post.name : '',
          reportedBy: profile.monika,
          adminEmail: ADMIN_EMAIL,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
        // Flag post so 7-day auto-delete skips it
        db.collection(BB_BRAND.collections.posts).doc(reportTargetId)
          .update({ reported: true }).catch(() => {});
      }
      showHint('Report submitted — thank you 🙏');
    });
  });

  // Self delete
  document.getElementById('sdel-cancel').addEventListener('click', () => closeOv('ov-self-delete'));
  document.getElementById('sdel-confirm').addEventListener('click', () => {
    closeOv('ov-self-delete');
    if (db && selfDeleteId) {
      db.collection(BB_BRAND.collections.posts).doc(selfDeleteId).delete().catch(() => {});
      localPosts = localPosts.filter(p => p.id !== selfDeleteId);
      renderPosts(currentTab === 'general' ? assembleGeneralPosts(localPosts) : sortPosts(localPosts));
    }
    showHint('Post removed ✓');
  });

  // Admin delete
  document.getElementById('adel-cancel').addEventListener('click', () => closeOv('ov-admin-delete'));
  document.getElementById('adel-confirm').addEventListener('click', () => {
    closeOv('ov-admin-delete');
    adminDeletePost(adminDeleteId);
  });
}

// ─────────────────────────────────────────────────────────────────
// Admin: delete post
// ─────────────────────────────────────────────────────────────────
function adminDeletePost(id) {
  if (!db || !id) return;
  db.collection(BB_BRAND.collections.posts).doc(id).update({
    deleted: true,
    deletedByAdmin: true,
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(err => console.error('[Admin] delete failed', err));
  showHint('Post deleted 🛡️');
}

// ─────────────────────────────────────────────────────────────────
// Monika settings
// ─────────────────────────────────────────────────────────────────
function openMonikaSettings() {
  const msMonika   = document.getElementById('ms-monika');
  const msCounter  = document.getElementById('ms-monika-counter');
  const msInitials = document.getElementById('ms-initials');
  const msColors   = document.getElementById('ms-colors');
  const msAv       = document.getElementById('ms-av');
  const msAvName   = document.getElementById('ms-av-name');

  msMonika.value   = profile.monika;
  msCounter.textContent = `${profile.monika.length}/10`;
  msInitials.value = profile.customInit;

  // Medication status row
  const msStatus = document.getElementById('ms-med-status');
  if (msStatus) {
    const list = _anonGetMedList();
    if (!list.length) {
      msStatus.textContent = 'No medications added';
    } else {
      const names = list.map(m => m.name).join(', ');
      msStatus.textContent = profile.showMeds ? `${names} · Visible on posts` : `${names} · Private`;
    }
  }

  // Stability counter is BB-app only — standalone (anon-direct) users
  // don't track journal-driven streaks, so the option is hidden for them.
  const msStableBtn = document.getElementById('ms-stable-btn');
  if (msStableBtn) msStableBtn.style.display = _bbUser ? '' : 'none';

  const msStableStatus = document.getElementById('ms-stable-status');
  if (msStableStatus && _bbUser) {
    const streak = profile.stableStreak;
    if (!streak && !profile.stableSince) {
      msStableStatus.textContent = 'Not set up yet';
    } else {
      msStableStatus.textContent = streak > 0
        ? (profile.showStable ? `${streak}d · Visible on posts` : `${streak}d · Private`)
        : (profile.showStable ? 'Visible on posts' : 'Private');
    }
  }

  // Bipolar Bear birthday — date joined + age. Resolved lazily here so
  // users opening settings before initBoard() still see something.
  const joinedISO = profile.joinedAt || _resolveJoinedAt();
  const msBday    = document.getElementById('ms-birthday');
  if (msBday) {
    const dateLabel = _birthdayDateLabel(joinedISO);
    const ageLabel  = _birthdayVerbose(joinedISO);
    if (dateLabel) {
      document.getElementById('ms-birthday-date').textContent = dateLabel;
      document.getElementById('ms-birthday-age').textContent  = ageLabel;
      msBday.style.display = '';
    } else {
      msBday.style.display = 'none';
    }
  }

  // Build colour swatches
  msColors.innerHTML = COLOR_PRESETS.map(c =>
    `<div class="color-swatch ${c.key === profile.colorKey ? 'selected' : ''}"
       data-key="${c.key}"
       style="background:linear-gradient(135deg,${c.g1},${c.g2});"
       title="${c.key}"></div>`
  ).join('');

  function updatePreview() {
    const name = msMonika.value || profile.monika;
    const init = msInitials.value.toUpperCase() || initials(name);
    const key  = msColors.querySelector('.color-swatch.selected')?.dataset.key || profile.colorKey;
    const col  = COLOR_PRESETS.find(c => c.key === key) || COLOR_PRESETS[0];
    msAv.textContent = init;
    msAv.style.background = `linear-gradient(135deg,${col.g1},${col.g2})`;
    msAvName.textContent = `[${name}] 🔥 ${profile.streak}d`;
  }
  updatePreview();

  msMonika.oninput = () => {
    msCounter.textContent = `${msMonika.value.length}/10`;
    updatePreview();
  };
  msInitials.oninput = () => {
    msInitials.value = msInitials.value.toUpperCase().slice(0, 2);
    updatePreview();
  };
  msColors.onclick = e => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    msColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    updatePreview();
  };

  // Sign Out is only meaningful for standalone (email-code) users; BB-app
  // users sign out from the main app. _bbUser is null on the standalone path.
  const msSignOut = document.getElementById('ms-signout');
  if (msSignOut) msSignOut.style.display = _bbUser ? 'none' : 'block';

  openOv('ov-monika');
}

document.getElementById('ms-cancel').addEventListener('click', () => closeOv('ov-monika'));

document.getElementById('ms-signout').addEventListener('click', () => {
  // Standalone sign-out: clear all bbAnon_* identity/session state. Profile
  // data persists in anonProfiles/{sha256email} so the same email re-verifies
  // back into the same identity.
  Object.keys(localStorage)
    .filter(k => k === 'bbAnonLastVisit' || k === 'bbAnonVisitDate' || k.startsWith('bbAnon_'))
    .forEach(k => localStorage.removeItem(k));
  stopAllListeners();
  closeOv('ov-monika');
  boot(null);
});
const _msHomeBtn = document.getElementById('ms-home');
if (_isAnonymousApp) {
  // "Discover BipolarBear" is already in the info popup — don't duplicate it here.
  _msHomeBtn.style.display = 'none';
} else {
  _msHomeBtn.textContent = '← Back to Bipolar Bear';
  _msHomeBtn.addEventListener('click', () => { location.href = 'index.html'; });
}
document.getElementById('ms-med-btn').addEventListener('click', openMedSettings);
document.getElementById('ms-stable-btn').addEventListener('click', openStableSettings);

document.getElementById('ms-save').addEventListener('click', async () => {
  const newMonika = document.getElementById('ms-monika').value.trim();
  if (newMonika.length < 2) { showHint('Monika must be at least 2 characters'); return; }

  const oldMonika = profile.monika;
  try {
    if (await isMonikaInUse(newMonika, oldMonika)) {
      showHint('That name is already taken');
      return;
    }
  } catch (e) { /* network error — allow through */ }

  const newInit  = document.getElementById('ms-initials').value.toUpperCase().slice(0, 2);
  const selKey   = document.querySelector('#ms-colors .color-swatch.selected')?.dataset.key || profile.colorKey;

  BB.storage.set('Anon_monika',   newMonika);
  BB.storage.set('Anon_initials', newInit);
  BB.storage.set('Anon_colorKey', selKey);

  closeOv('ov-monika');
  renderUserPill();
  showHint('Monika updated ✓');

  // Update past Firestore posts authored by this user
  if (db && oldMonika) {
    const col = COLOR_PRESETS.find(c => c.key === selKey) || COLOR_PRESETS[0];
    try {
      const snap  = await db.collection(BB_BRAND.collections.posts).where('name', '==', oldMonika).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, {
        name:     newMonika,
        initials: newInit || initials(newMonika),
        grad1:    col.g1,
        grad2:    col.g2,
      }));
      if (oldMonika.toLowerCase() !== newMonika.toLowerCase()) {
        batch.delete(db.collection(BB_BRAND.collections.monikas).doc(oldMonika.toLowerCase()));
        batch.set(db.collection(BB_BRAND.collections.monikas).doc(newMonika.toLowerCase()), { monika: newMonika, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      await batch.commit();
    } catch (e) { console.warn('[Monika] update posts failed', e); }
  }
  _anonSaveProfile(); _bbSaveProfile();
});

// ─────────────────────────────────────────────────────────────────
// Boot — driven by onAuthStateChanged; fallback if Firebase blocked
// ─────────────────────────────────────────────────────────────────
setTimeout(() => { if (!_anonInitialBoot) boot(null); }, 2500);
