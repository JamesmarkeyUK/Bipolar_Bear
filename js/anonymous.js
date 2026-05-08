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
if (!window.Capacitor && location.protocol !== 'file:' && localStorage.getItem('bbWebUnlocked') !== 'true') {
  location.replace('beta.html');
}

// ─────────────────────────────────────────────────────────────────
// Constants & state
// ─────────────────────────────────────────────────────────────────
const YELLOW      = '#f5c800';
const YELLOW_DARK = '#c49e00';
const YELLOW_LT   = '#ffe566';
const ADMIN_EMAIL = 'inbox@jamesmarkey.co.uk';
const _isAnonDomain = ['bipolaranonymous.app','www.bipolaranonymous.app'].includes(location.hostname);

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
let unsubPosts      = null;
let localPosts      = [];
let sosTargetName   = '';
let reportTargetId  = '';
let adminDeleteId   = '';
let selfDeleteId    = '';
let _bbUser         = null; // Firebase-auth verified user (BB App path)

// Persisted user profile (localStorage)
const profile = {
  get monika()      { return localStorage.getItem('bbAnon_monika')    || ''; },
  get verified()    { return localStorage.getItem('bbAnon_verified')  === 'true'; },
  get showMeds()    { return localStorage.getItem('bbAnon_showMeds')    === 'true'; },
  get showStable()  { return localStorage.getItem('bbAnon_showStable') === 'true'; },
  get stableStreak(){ return parseInt(localStorage.getItem('bbAnon_stableStreak') || '0', 10); },
  get stableSince() { return localStorage.getItem('bbAnon_stableSince') || ''; }, // standalone: YYYY-MM-DD
  get med()         { return localStorage.getItem('bbAnon_med')       || ''; },
  get medList()     {
    try {
      const s = localStorage.getItem('bbAnon_medList');
      if (s) return JSON.parse(s);
      const m = localStorage.getItem('bbAnon_med');
      return m ? [{ name: m, dosage: '' }] : [];
    } catch(e) { return []; }
  },
  get hasPosted()   { return localStorage.getItem('bbAnon_hasPosted') === 'true'; },
  get isAdmin()     { return localStorage.getItem('bbAnon_isAdmin')   === 'true'; },
  get colorKey()    { return localStorage.getItem('bbAnon_colorKey')  || 'orange'; },
  get grad1()       { const p = COLOR_PRESETS.find(c => c.key === this.colorKey); return p ? p.g1 : YELLOW_LT; },
  get grad2()       { const p = COLOR_PRESETS.find(c => c.key === this.colorKey); return p ? p.g2 : YELLOW_DARK; },
  get customInit()  { return localStorage.getItem('bbAnon_initials')  || ''; },
  avatarInitials()  { return this.customInit || initials(this.monika); },
  // Pull streak from journal if available, else default to 1
  get streak()      { return parseInt(localStorage.getItem('bbAnon_streak') || '1', 10); },
};

// Liked posts set (persisted)
const likedPosts = new Set(
  JSON.parse(localStorage.getItem('bbAnon_liked') || '[]')
);
function saveLiked() {
  localStorage.setItem('bbAnon_liked', JSON.stringify([...likedPosts]));
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
      if (!isReal && localStorage.getItem('bbAnon_verified') === 'true' && !localStorage.getItem('bbAnon_email')) {
        localStorage.removeItem('bbAnon_verified');
        localStorage.removeItem('bbAnon_isAdmin');
        if (unsubPosts) { unsubPosts(); unsubPosts = null; }
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
      localStorage.setItem('bbAnon_isAdmin', 'true');
    } else {
      localStorage.removeItem('bbAnon_isAdmin');
    }
    // Mark as verified for the synchronous pre-activation hint on next visit.
    // Cleared on sign-out by the auth-change handler above.
    localStorage.setItem('bbAnon_verified', 'true');
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

// _goHome() is called from inline onclick attributes on onboarding screens
// and the board logo. Navigates appropriately for the current domain.
function _goHome() {
  if (_bbUser) {
    // In the native app navigate within the app; on the web go to the public homepage
    if (window.Capacitor || location.protocol === 'file:') { location.replace('index.html'); }
    else { location.href = 'https://bipolarbear.app'; }
  } else if (!_isAnonDomain) { location.replace('index.html'); }
  // standalone users on anon domain: do nothing
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

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────
function initials(name) { return (name || '??').slice(0, 2).toUpperCase(); }

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
      verifyBtn.disabled = getCode().length < 4;
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
    // Paste 4 digits at once
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, 4);
      if (!digits) return;
      boxes.forEach((b, j) => {
        b.value = digits[j] || '';
        b.classList.toggle('filled', !!b.value);
      });
      const nextIdx = Math.min(digits.length, boxes.length - 1);
      boxes[nextIdx].focus();
      verifyBtn.disabled = getCode().length < 4;
    });
  });

  verifyBtn.addEventListener('click', async () => {
    const code = getCode();
    if (code.length < 4 || !_sessionId) return;
    clearError();
    verifyBtn.disabled  = true;
    const origText = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying…';
    try {
      await window._anonVerifyCode({ sessionId: _sessionId, code });
      // ✅ Verified
      if (_pendingEmail.toLowerCase() === ADMIN_EMAIL) {
        localStorage.setItem('bbAnon_isAdmin', 'true');
      }
      localStorage.setItem('bbAnon_verified', 'true');
      localStorage.setItem('bbAnon_email', _pendingEmail);

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
  const doc = await db.collection('bbAnonMonikas').doc(monika.toLowerCase()).get();
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
    localStorage.setItem('bbAnon_monika', monika);
    if (db) db.collection('bbAnonMonikas').doc(monika.toLowerCase()).set({ monika, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
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
    localStorage.setItem('bbAnon_showMeds', 'true');
    // For BB App users, pre-populate med list from their Firestore data
    if (_bbUser && db) {
      try {
        const snap = await db.collection('userSettings').doc(_bbUser.uid).get();
        if (snap.exists) {
          const list = snap.data().currentMedList || [];
          if (list.length > 0) {
            localStorage.setItem('bbAnon_medList', JSON.stringify(list));
            localStorage.setItem('bbAnon_med', list.map(m => m.name).filter(Boolean).join(', '));
          }
        }
      } catch(e) { /* silently fail — user can add manually */ }
    }
    showScreen('med-define');
    setupMedDefine(() => { showScreen('board'); initBoard(); });
  };
  document.getElementById('meds-no').onclick = () => {
    localStorage.setItem('bbAnon_showMeds', 'false');
    showScreen('board');
    initBoard();
  };
}

// ─────────────────────────────────────────────────────────────────
// Med helpers
// ─────────────────────────────────────────────────────────────────
function _anonGetMedList() {
  try {
    const s = localStorage.getItem('bbAnon_medList');
    if (s) return JSON.parse(s);
    const m = localStorage.getItem('bbAnon_med');
    return m ? [{ name: m, dosage: '' }] : [];
  } catch(e) { return []; }
}

async function _anonSaveMedList(list) {
  localStorage.setItem('bbAnon_medList', JSON.stringify(list));
  const medStr = list.map(m => m.name).filter(Boolean).join(', ');
  localStorage.setItem('bbAnon_med', medStr);
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
  const email = localStorage.getItem('bbAnon_email');
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
      visitStreak:  parseInt(localStorage.getItem('bbAnon_streak') || '0', 10),
      visitDate:    localStorage.getItem('bbAnonVisitDate') || null,
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
    if (d.monika)              localStorage.setItem('bbAnon_monika',   d.monika);
    if (d.colorKey)            localStorage.setItem('bbAnon_colorKey', d.colorKey);
    if (d.customInit !== undefined) localStorage.setItem('bbAnon_initials', d.customInit || '');
    if (d.showMeds   !== undefined) localStorage.setItem('bbAnon_showMeds', d.showMeds ? 'true' : 'false');
    if (d.medList && d.medList.length > 0) {
      localStorage.setItem('bbAnon_medList', JSON.stringify(d.medList));
      localStorage.setItem('bbAnon_med', d.medList.map(m => m.name).filter(Boolean).join(', '));
    }
    if (d.showStable !== undefined) localStorage.setItem('bbAnon_showStable', d.showStable ? 'true' : 'false');
    if (d.stableSince) {
      localStorage.setItem('bbAnon_stableSince', d.stableSince);
      // Recompute days since (it grows each day automatically)
      const days = Math.max(0, Math.floor((Date.now() - new Date(d.stableSince).getTime()) / 86400000));
      localStorage.setItem('bbAnon_stableStreak', String(days));
    }
    if (typeof d.visitStreak === 'number') localStorage.setItem('bbAnon_streak',  String(d.visitStreak));
    if (d.visitDate)                       localStorage.setItem('bbAnonVisitDate', d.visitDate);
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
    if (!doc.exists) return;
    const d = doc.data();
    // Stable streak is computed by journal.html and stored flat
    if (typeof d.stableStreak === 'number') {
      localStorage.setItem('bbAnon_stableStreak', String(d.stableStreak));
    }
    // Anon board profile is nested under anonProfile
    const ap = d.anonProfile || {};
    if (ap.monika)                   localStorage.setItem('bbAnon_monika',      ap.monika);
    if (ap.colorKey)                 localStorage.setItem('bbAnon_colorKey',    ap.colorKey);
    if (ap.customInit !== undefined) localStorage.setItem('bbAnon_initials',    ap.customInit || '');
    if (ap.showMeds   !== undefined) localStorage.setItem('bbAnon_showMeds',    ap.showMeds   ? 'true' : 'false');
    if (ap.showStable !== undefined) localStorage.setItem('bbAnon_showStable',  ap.showStable ? 'true' : 'false');
    if (ap.stableSince)              localStorage.setItem('bbAnon_stableSince', ap.stableSince);
    const medList = ap.medList && ap.medList.length ? ap.medList : (d.currentMedList || []);
    if (medList.length) {
      localStorage.setItem('bbAnon_medList', JSON.stringify(medList));
      localStorage.setItem('bbAnon_med', medList.map(m => m.name).filter(Boolean).join(', '));
    }
    if (typeof ap.visitStreak === 'number') localStorage.setItem('bbAnon_streak',     String(ap.visitStreak));
    if (ap.visitDate)                       localStorage.setItem('bbAnonVisitDate',    ap.visitDate);
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
          stableSince: ap.stableSince || null,
          visitStreak: ap.visitStreak || 0,
          visitDate:   ap.visitDate   || null,
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
    visitStreak: parseInt(localStorage.getItem('bbAnon_streak') || '0', 10),
    visitDate:   localStorage.getItem('bbAnonVisitDate') || null,
    verified:    localStorage.getItem('bbAnon_verified') === 'true',
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
    localStorage.setItem('bbAnon_showMeds', showMeds ? 'true' : 'false');
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
  const lastDate  = localStorage.getItem('bbAnonVisitDate') || '';
  if (lastDate === today) return; // already counted today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const prev      = parseInt(localStorage.getItem('bbAnon_streak') || '0', 10);
  const streak    = lastDate === yesterday ? prev + 1 : 1;
  localStorage.setItem('bbAnon_streak',  String(streak));
  localStorage.setItem('bbAnonVisitDate', today);
}

function initBoard() {
  localStorage.setItem('bbAnonLastVisit', Date.now());
  _updateAnonStreak();
  renderUserPill();
  setupTabs();
  setupFAB();
  setupCompose();
  setupOverlayActions();
  setTab('general');
  cleanOldPosts();
  _anonSaveProfile(); _bbSaveProfile(); // persist profile to Firestore
}

function renderUserPill() {
  const m  = profile.monika;
  const s  = profile.streak;
  const g1 = profile.grad1;
  const g2 = profile.grad2;
  const av = profile.avatarInitials();
  document.getElementById('board-user-pill').innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;">
      <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${g1},${g2});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;flex-shrink:0;">${esc(av)}</div>
      <span style="font-size:12px;color:rgba(255,255,255,0.9);font-weight:600;">[${esc(m)}]</span>
      ${profile.isAdmin ? '<span style="background:rgba(0,0,0,0.55);color:#fff;font-size:9px;font-weight:800;border-radius:4px;padding:1px 5px;">ADMIN</span>' : ''}
      <span>🔥</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.8);">${s}d</span>
      ${profile.showStable && profile.stableStreak > 0 ? `<span>🧘</span><span style="font-size:11px;color:rgba(255,255,255,0.8);">${profile.stableStreak}d</span>` : ''}
    </div>`;
}

function setupTabs() {
  document.querySelectorAll('.board-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.board-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('fab-ann').classList.toggle('active', tab === 'announcements');
  document.getElementById('fab-gen').classList.toggle('active', tab === 'general');
  listenPosts();
}

// ─────────────────────────────────────────────────────────────────
// Posts — Firestore real-time listener
// ─────────────────────────────────────────────────────────────────
function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
    const tb = b.timestamp?.toMillis?.() ?? (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
    return tb - ta;
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
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  localPosts = [];

  if (!db) {
    renderPosts(currentTab === 'general' ? assembleGeneralPosts([]) : announcementPosts());
    return;
  }

  document.getElementById('post-list').innerHTML =
    '<div class="empty-state">Loading…</div>';

  unsubPosts = db.collection('bbAnonPosts')
    .where('tab', '==', currentTab)
    .limit(60)
    .onSnapshot(snap => {
      localPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPosts(currentTab === 'general'
        ? assembleGeneralPosts(localPosts)
        : sortPosts(localPosts));
    }, err => {
      console.error('[Anonymous] posts error', err);
      // Keep whatever we had; only reset if truly empty
      renderPosts(currentTab === 'general'
        ? assembleGeneralPosts(localPosts)
        : (localPosts.length ? sortPosts(localPosts) : announcementPosts()));
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
    const snap = await db.collection('bbAnonPosts')
      .where('timestamp', '<', cutoff)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(doc => {
      if (!doc.data().reported) batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (e) {
    console.warn('[Anonymous] cleanOldPosts:', e);
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
}

function renderSystem(p) {
  return `<div class="sys-card">
    <div class="sys-emoji">${p.icon || '☀️'}</div>
    <div class="sys-text">${esc(p.text)}</div>
    <div class="sys-meta">BipolarBear${p.time ? ' · ' + p.time : (p.timestamp ? ' · ' + timeAgo(p.timestamp) : '')}</div>
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
  const liked      = likedPosts.has(p.id);
  const likes      = p.likes || 0;
  const showMed    = profile.showMeds && p.med;
  const showStable = (p.stable || 0) > 0;
  const g1      = p.grad1 || YELLOW_LT;
  const g2      = p.grad2 || YELLOW_DARK;
  const av      = p.initials || initials(p.name);
  const adminBadge   = p.isAdmin ? '<span class="admin-badge">ADMIN</span>' : '';
  const deleteBtn    = profile.isAdmin && !p.isSeed
    ? `<button class="icon-btn" data-delete="${esc(p.id)}" title="Delete post (admin)">🗑️</button>` : '';
  const selfDeleteBtn = !p.isSeed && !profile.isAdmin && p.name === profile.monika && isSelfDeleteEligible(p)
    ? `<button class="icon-btn" data-selfdelete="${esc(p.id)}" title="Remove your post" style="opacity:0.4;">🗑️</button>` : '';
  return `<div class="post-card">
    <div class="post-header">
      <div class="post-avatar">
        <div class="post-av-circle" style="background:linear-gradient(135deg,${g1},${g2});">${esc(av)}</div>
        <div>
          <div class="post-name">[${esc(p.name)}]${adminBadge} 🔥 ${p.streak || 1}d${showStable ? ` 🧘 ${p.stable}d` : ''}</div>
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
      <div style="flex:1"></div>
      ${selfDeleteBtn}
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
    if (db) db.collection('bbAnonPosts').doc(id).update({ likes: firebase.firestore.FieldValue.increment(-1) }).catch(() => {});
  } else {
    likedPosts.add(id);
    btn.classList.add('liked');
    btn.dataset.likes = count + 1;
    span.textContent  = count + 1;
    if (db) db.collection('bbAnonPosts').doc(id).update({ likes: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
  }
  saveLiked();
}

// ─────────────────────────────────────────────────────────────────
// Post gate — check if first post has a like yet
// ─────────────────────────────────────────────────────────────────
function pollCanPost() {
  if (profile.canPost || !profile.hasPosted) return;
  const firstId = localStorage.getItem('bbAnon_firstPostId');
  if (!firstId || !db) return;
  db.collection('bbAnonPosts').doc(firstId).get().then(doc => {
    if (doc.exists && (doc.data().likes || 0) > 0) {
      localStorage.setItem('bbAnon_canPost', 'true');
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
}

// ─────────────────────────────────────────────────────────────────
// Compose
// ─────────────────────────────────────────────────────────────────
function setupCompose() {
  const ta   = document.getElementById('compose-ta');
  const post = document.getElementById('compose-post');

  ta.addEventListener('input', () => { post.disabled = !ta.value.trim(); });

  document.getElementById('compose-cancel').addEventListener('click', () => closeOv('ov-compose'));

  post.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) return;
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
        const ref = await db.collection('bbAnonPosts').add({
          ...entry,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        docId = ref.id;
        // Replace optimistic entry with the real one from the snapshot (happens automatically)
      } catch (e) { console.error('[Anonymous] post failed', e); }
    }

    if (!profile.hasPosted) {
      if (docId) localStorage.setItem('bbAnon_firstPostId', docId);
      localStorage.setItem('bbAnon_hasPosted', 'true');
      openOv('ov-firstpost');
    }
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
    localStorage.setItem('bbAnon_showStable', showStable ? 'true' : 'false');

    if (!isBB) {
      // Compute days from entered date
      const since = document.getElementById('stable-ov-date').value; // YYYY-MM-DD
      if (since) {
        localStorage.setItem('bbAnon_stableSince', since);
        const days = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
        localStorage.setItem('bbAnon_stableStreak', String(days));
      } else {
        localStorage.removeItem('bbAnon_stableSince');
        localStorage.setItem('bbAnon_stableStreak', '0');
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
      db.collection('bbAnonReports').add({
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
        db.collection('bbAnonReports').add({
          type: 'report', postId: reportTargetId, reason: btn.dataset.reason,
          postText: post ? post.text : '',
          postName: post ? post.name : '',
          reportedBy: profile.monika,
          adminEmail: ADMIN_EMAIL,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
        // Flag post so 7-day auto-delete skips it
        db.collection('bbAnonPosts').doc(reportTargetId)
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
      db.collection('bbAnonPosts').doc(selfDeleteId).delete().catch(() => {});
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
  db.collection('bbAnonPosts').doc(id).update({
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
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  closeOv('ov-monika');
  boot(null);
});
const _msHomeBtn = document.getElementById('ms-home');
if (_isAnonDomain) {
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

  localStorage.setItem('bbAnon_monika',   newMonika);
  localStorage.setItem('bbAnon_initials', newInit);
  localStorage.setItem('bbAnon_colorKey', selKey);

  closeOv('ov-monika');
  renderUserPill();
  showHint('Monika updated ✓');

  // Update past Firestore posts authored by this user
  if (db && oldMonika) {
    const col = COLOR_PRESETS.find(c => c.key === selKey) || COLOR_PRESETS[0];
    try {
      const snap  = await db.collection('bbAnonPosts').where('name', '==', oldMonika).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, {
        name:     newMonika,
        initials: newInit || initials(newMonika),
        grad1:    col.g1,
        grad2:    col.g2,
      }));
      if (oldMonika.toLowerCase() !== newMonika.toLowerCase()) {
        batch.delete(db.collection('bbAnonMonikas').doc(oldMonika.toLowerCase()));
        batch.set(db.collection('bbAnonMonikas').doc(newMonika.toLowerCase()), { monika: newMonika, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
