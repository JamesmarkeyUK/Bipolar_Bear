/**
 * Bipolar Bear home-page logic, extracted from inline <script> blocks in
 * index.html. Loads after the Firebase compat SDK and after the shared
 * helpers in <head> (platform.js, debug.js, firebase-config.js,
 * onboarding.js).
 *
 * The original inline scripts ran at different positions in the document.
 * They're concatenated here in source order — each block is wrapped in its
 * own scope (most are IIFEs already), and each block's top-level code runs
 * at the same point: when this file finishes loading, after the Firebase
 * SDK has loaded and the entire page DOM has been parsed.
 *
 * Block index (lookup by `// ── BLOCK N ──` markers below):
 *   1. Static feature copy (journalFeatures, survivalFeatures arrays).
 *   2. Firebase init + onAuthStateChanged callback (auth state, settings
 *      restore on sign-in, FAB sync, anon profile mirror, streak recompute,
 *      tutorial advance helpers, hint pointer logic, logo easter egg).
 *   3. Today entry tick — does the user already have an entry for today?
 *   4. Survival-kit completion tick.
 *   5. Celebration confetti + toast (streak / stable / both).
 *   6. WhatsApp button bootstrap on native shell.
 *   7. Navigation handlers + onboarding-step advance helpers.
 *   8. PIN lock overlay (guest encryption PIN or native logged-in PIN).
 *
 * @file js/index.js
 */

/**
 * Escape HTML-significant characters in user-controlled strings before
 * injecting them into innerHTML. Use for any value that came from
 * localStorage.bbAnon_* or another user-supplied source.
 *
 * @param {string} s
 * @returns {string}
 */
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── BLOCK 1: feature copy used by other blocks for hover cards ──
const journalFeatures = [
      { icon: '📈', title: 'Visual Insights', desc: 'See your mood patterns over time with charts' },
      { icon: '🔒', title: 'Private & Secure', desc: 'Your data stays safe with you' },
      { icon: '🎯', title: 'Stay On Track', desc: 'Build healthy habits with streaks' }
    ];

    const survivalFeatures = [
      { icon: '⭐', title: 'Celebrities', desc: 'Stories from famous people living with bipolar' },
      { icon: '🔬', title: 'Research', desc: 'Latest studies and evidence-based information' },
      { icon: '🤝', title: 'Support', desc: 'Resources and tools for crisis moments' }
    ];

// ── BLOCK 2: Firebase init + auth listener + onboarding helpers ──
// ── Beta gate (web only) ──
    if (!window.Capacitor && location.protocol !== 'file:' && localStorage.getItem('bbWebUnlocked') !== 'true') {
      location.replace('beta.html');
    }

    // ── Firebase init ──
    // Config lives in js/shared/firebase-config.js so every page reads the
    // same source of truth.
    const firebaseConfig = window.BB_FIREBASE_CONFIG;
    let auth, db, currentUser = null;
    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      // Expose to window so other <script> blocks (and shared modules like
      // fab.js) can access them. `let` declarations don't attach to window,
      // and a number of call sites — including fab.js's _syncFabsToFirestore
      // and the journal toggle handlers — gate on window.db / window.currentUser.
      window.auth = auth;
      window.db = db;
      auth.onAuthStateChanged(user => {
        currentUser = user && !user.isAnonymous ? user : null;
        window.currentUser = currentUser;

        // Clear stale guest PIN if it was set by a different account.
        // Guest PINs (bbGuestPinSalt) are only valid for the account that created them.
        if (user && !user.isAnonymous) {
          const _hasGuestPin = !!localStorage.getItem('bbGuestPinSalt');
          const _pinUID      = localStorage.getItem('bbPinLinkedUID');
          if (_hasGuestPin && _pinUID !== user.uid) {
            localStorage.removeItem('bbGuestPinSalt');
            localStorage.removeItem('bbPinCode');
            localStorage.removeItem('bbPinEnabled');
            localStorage.removeItem('bbPinLinkedUID');
            sessionStorage.setItem('bbPinUnlocked', '1');
            const _pinOv = document.getElementById('guestPinOverlay');
            if (_pinOv && _pinOv.style.display !== 'none') _pinOv.style.display = 'none';
          }
        }

        // Bipolar Anonymous button — unlocked only when signed in
        const anonBtn  = document.getElementById('anonymousBtn');
        const anonNote = document.getElementById('anonymousSignInNote');
        if (anonBtn) {
          if (currentUser) {
            anonBtn.classList.remove('locked');
            if (anonNote) anonNote.style.display = 'none';
            // New messages badge — only if they've verified for Anonymous
            if (localStorage.getItem('bbAnon_verified') === 'true') {
              const _badge     = document.getElementById('anonMessagesBadge');
              const _lastVisit = parseInt(localStorage.getItem('bbAnonLastVisit') || '0', 10);
              if (_badge) {
                if (!_lastVisit) {
                  _badge.textContent  = '💬 Tap to join the community';
                  _badge.style.display = 'block';
                } else {
                  db.collection('bbAnonPosts')
                    .where('timestamp', '>', firebase.firestore.Timestamp.fromMillis(_lastVisit))
                    .limit(5)
                    .get()
                    .then(snap => {
                      const _myMonika  = localStorage.getItem('bbAnon_monika') || '';
                  const _newCount = snap.docs.filter(d => !d.data().deleted && (_myMonika ? d.data().name !== _myMonika : true)).length;
                      _badge.textContent   = _newCount > 0
                        ? '💬 ' + _newCount + ' new message' + (_newCount === 1 ? '' : 's')
                        : '✓ No new messages';
                      _badge.style.display = 'block';
                    })
                    .catch(() => {});
                }
              }
            }
          } else {
            anonBtn.classList.add('locked');
            if (anonNote) anonNote.style.display = 'block';
          }
        }

        const signinBtn = document.getElementById('signinBtn');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');
        if (user && !user.isAnonymous) {
          if (signinBtn) signinBtn.style.display = 'none';
          if (userInfo) { userInfo.style.display = 'flex'; }
          if (userEmail) userEmail.textContent = user.email;
          window._fabOpenAuth = window.showAccountModal;
          // Email verification is now handled on the Bipolar Anonymous board
          // (anonymous.html) — no need to nag here. If a stale banner from an
          // older client version is still in the DOM, clear it.
          const _vBanner = document.getElementById('bbEmailVerifyBanner');
          if (_vBanner) _vBanner.remove();
          // Load user settings from Firestore (logo variant + survival kit data for ticks)
          db.collection('userSettings').doc(user.uid).get().then(doc => {
            if (!doc.exists) return;
            const d = doc.data();
            if (d.logoVariant !== undefined) {
              localStorage.setItem('logoVariant', d.logoVariant);
              applyLogoVariant(d.logoVariant);
            }
            // Sync onboarding step from Firestore FIRST (needed to set completion flags before tick update)
            const _serverStep = d.onboardingStep || 0;
            const _localStep = _getOnboardingStep();
            let _finalStep = Math.max(_serverStep, _localStep);
            // Step 9 (WA hint) removed from tutorial — skip on all platforms
            if (_finalStep === 9) _finalStep = 10;
            if (_finalStep !== _localStep) {
              localStorage.setItem('bbOnboardingStep', String(_finalStep));
              db.collection('userSettings').doc(user.uid).set({ onboardingStep: _finalStep }, { merge: true }).catch(() => {});
            } else if (_localStep > _serverStep) {
              db.collection('userSettings').doc(user.uid).set({ onboardingStep: _localStep }, { merge: true }).catch(() => {});
            }
            // Restore hint flags from Firestore
            if (d.personalHintDone) localStorage.setItem('bbPersonalHintDone', '1');
            if (d.tutorialToastShown) localStorage.setItem('bbTutorialToastShown', '1');
            // If tutorial is complete, silently ensure all completion flags are set on login.
            // Never show the tutorial-complete popup here — it only fires via _advanceOnboardingStep.
            if (_finalStep >= 12) {
              localStorage.setItem('bbTutorialToastShown', '1');
              localStorage.setItem('bbFabsUnlocked', '1');
              // Prevent survival-kit celebration toast from re-firing on a new device/browser
              localStorage.setItem('bbSurvivalCelebDone', '1');
              ['bbWelcomeShown','bbSurvivalKitVisited','bbMedHintDone','bbMoodDefHintDone',
               'bb_fmChooseMoodHintDone','bb_fmMoodInfoCloseHintDone','bbSettingsHintDone',
               'bbCustomiseFormHintDone','bbCustomiseAdditionalHintDone','bbCloseSettingsHintDone',
               'bb_fmMoodTipShown'].forEach(f => { if (!localStorage.getItem(f)) localStorage.setItem(f, '1'); });
              if (!d.tutorialToastShown) {
                db.collection('userSettings').doc(user.uid).set({ tutorialToastShown: true }, { merge: true }).catch(() => {});
              }
            }
            // Populate survival kit keys so the tick check works without visiting the page first.
            // Must happen AFTER completion flags are set so MutationObserver doesn't fire celebration toast.
            if (d.moodDefinitions !== undefined) localStorage.setItem('moodDefinitions', JSON.stringify(d.moodDefinitions));
            if (d.copingStrategies !== undefined) localStorage.setItem('copingStrategies', JSON.stringify(d.copingStrategies));
            if (d.currentMedList  !== undefined) localStorage.setItem('currentMedList',  JSON.stringify(d.currentMedList));
            if (d.dailyGoals      !== undefined) localStorage.setItem('dailyGoals',      JSON.stringify(d.dailyGoals));
            if (d.stableStreak    !== undefined) {
              localStorage.setItem('bbStableStreak', String(d.stableStreak || 0));
            }
            if (typeof d.currentStreak === 'number') {
              localStorage.setItem('bbCurrentStreak', String(d.currentStreak));
            }
            // Restore unlocked achievements so journal.html doesn't re-toast already-earned ones
            if (Array.isArray(d.unlockedAchievements)) {
              localStorage.setItem('unlockedAchievements', JSON.stringify(d.unlockedAchievements));
            }
            // Restore FAB customisation (slot assignments + hidden flags)
            if (d.fabState && typeof d.fabState === 'object') {
              const _fs = d.fabState;
              for (let s = 1; s <= 4; s++) {
                if (_fs['slot' + s]) localStorage.setItem('bbFabSlot_' + s, _fs['slot' + s]);
              }
              ['bbWaFabHidden','bbQuickNoteFabHidden','bbCoffeeFabHidden','bbFeedbackFabHidden','bbFooterHidden'].forEach(k => {
                if (_fs[k] === '1') localStorage.setItem(k, '1');
              });
              if (typeof window._applyFabDock === 'function') window._applyFabDock();
            }
            const _ap = d.anonProfile || {};
            if (typeof _ap.visitStreak === 'number') {
              localStorage.setItem('bbAnon_streak', String(_ap.visitStreak));
            }
            if (_ap.monika) localStorage.setItem('bbAnon_monika', _ap.monika);
            if (_ap.verified) localStorage.setItem('bbAnon_verified', 'true');
            _updateStreakBadge(); // refresh badge from the values we just wrote
            // Then recompute from entries to fix the stale-currentStreak case
            // (Firestore field only updates when journal.html opens). Best-effort.
            _recomputeStreakFromEntries(user);
            // Refresh anonymous "new messages" badge now that monika/verified are in place
            if (currentUser && localStorage.getItem('bbAnon_verified') === 'true') {
              const _badge2 = document.getElementById('anonMessagesBadge');
              const _lastVisit2 = parseInt(localStorage.getItem('bbAnonLastVisit') || '0', 10);
              if (_badge2 && _lastVisit2) {
                db.collection('bbAnonPosts')
                  .where('timestamp', '>', firebase.firestore.Timestamp.fromMillis(_lastVisit2))
                  .limit(5).get().then(snap => {
                    const _myMonika = localStorage.getItem('bbAnon_monika') || '';
                    const _newCount = snap.docs.filter(dd => !dd.data().deleted && (_myMonika ? dd.data().name !== _myMonika : true)).length;
                    _badge2.textContent = _newCount > 0
                      ? '💬 ' + _newCount + ' new message' + (_newCount === 1 ? '' : 's')
                      : '✓ No new messages';
                    _badge2.style.display = 'block';
                  }).catch(() => {});
              } else if (_badge2 && !_lastVisit2) {
                _badge2.textContent = '💬 Tap to join the community';
                _badge2.style.display = 'block';
              }
            }
            // Re-run the survival tick check now that localStorage is populated
            const sTick = document.getElementById('survivalTick');
            if (sTick) {
              try {
                const defs  = JSON.parse(localStorage.getItem('moodDefinitions') || '{}');
                const strats = JSON.parse(localStorage.getItem('copingStrategies') || '{}');
                const meds  = JSON.parse(localStorage.getItem('currentMedList') || '[]');
                const goals = JSON.parse(localStorage.getItem('dailyGoals') || '[]');
                const done  = Object.values(defs).some(v => v && String(v).trim()) &&
                              Object.values(strats).some(arr => Array.isArray(arr) && arr.length > 0) &&
                              Array.isArray(meds) && meds.length > 0 &&
                              Array.isArray(goals) && goals.length > 0;
                sTick.setAttribute('data-done', done ? 'true' : 'false');
              } catch(e) {}
            }
            _applyOnboardingGating();
          }).catch(() => {});
          // Check Firestore for the current entry if the local cache is missing or stale
          (function() {
            const useToday = localStorage.getItem('journalDefaultToday') === 'true';
            const target = new Date(); target.setHours(0, 0, 0, 0);
            if (!useToday) target.setDate(target.getDate() - 1);
            const toKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const targetKey = toKey(target);
            // If cache confidently says done, trust it immediately — no need to hit server
            try {
              const _cached = JSON.parse(localStorage.getItem('bb_entryStatus') || 'null');
              if (_cached && _cached.key === targetKey && _cached.done === true) return;
            } catch(e) {}
            // Single-field query only (compound queries need a Firestore index which may not exist)
            db.collection('entries')
              .where('userId', '==', user.uid)
              .get()
              .then(snap => {
                const done = snap.docs.some(doc => {
                  const d = doc.data().date;
                  if (!d) return false;
                  if (typeof d === 'string') return d.slice(0, 10) === targetKey;
                  try { const dt = d.toDate ? d.toDate() : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` === targetKey; } catch(_) { return false; }
                });
                const tick = document.getElementById('journalEntryTick');
                if (tick) tick.setAttribute('data-done', done ? 'true' : 'false');
                try { localStorage.setItem('bb_entryStatus', JSON.stringify({ key: targetKey, done })); } catch(e) {}
              }).catch(() => {});
          })();
        } else {
          if (signinBtn) signinBtn.style.display = '';
          if (userInfo) userInfo.style.display = 'none';
          const _pdHint = document.getElementById('personalDetailsHint');
          if (_pdHint) _pdHint.style.display = 'none';
          window._fabOpenAuth = window.showAuthModal;
          if (typeof window._applyFabDock === 'function') window._applyFabDock();
        }
      });
    } catch(e) { console.warn('Firebase init failed on index.html', e); }

    // ── Onboarding step helpers ──
    // _getOnboardingStep() is provided by js/shared/onboarding.js — the
    // implementation here delegates to it. The local function name is kept
    // because inline event handlers (e.g. onclick="…_advanceOnboardingStep(12)")
    // resolve against the script's lexical scope.
    /**
     * @returns {number} Current onboarding step (0–12).
     */
    function _getOnboardingStep() {
      return window.BB.onboarding.getStep();
    }
    /**
     * Advance the user's onboarding step. No-op if `to` is not strictly
     * greater than the current step. Persists to localStorage and to
     * Firestore (`userSettings/{uid}.onboardingStep`) when signed in.
     * Triggers the tutorial-complete modal the first time step ≥ 12.
     *
     * @param {number} to Target step.
     */
    function _advanceOnboardingStep(to) {
      const cur = _getOnboardingStep();
      if (to <= cur) return;
      if (to === 9) to = 10; // step 9 (WA hint) removed from tutorial on all platforms
      localStorage.setItem('bbOnboardingStep', String(to));
      if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
        db.collection('userSettings').doc(currentUser.uid).set({ onboardingStep: to }, { merge: true }).catch(() => {});
      }
      _applyOnboardingGating();
      // Show tutorial complete popup the first time step reaches 12
      if (to >= 12 && localStorage.getItem('bbTutorialToastShown') !== '1') {
        localStorage.setItem('bbTutorialToastShown', '1');
        setTimeout(_showTutorialCompleteModal, 400);
      }
    }
    window._getOnboardingStep = _getOnboardingStep;
    window._advanceOnboardingStep = _advanceOnboardingStep;

    // _resolvePointerPosition is provided by js/shared/onboarding.js.
    // Local alias kept so existing call sites in this script work unchanged.
    const _resolvePointerPosition = window.BB.onboarding.resolvePointerPosition;
    function _showIndexHintPointer(targetEl) {
      document.getElementById('_bbIdxHintPointer')?.remove();
      const rect = targetEl.getBoundingClientRect();
      const tx = rect.left + rect.width / 2;
      const ty = rect.top + rect.height / 2;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const angle = Math.atan2(ty - cy, tx - cx) * 180 / Math.PI + 90;
      const ptr = document.createElement('div');
      ptr.id = '_bbIdxHintPointer';
      ptr.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:510;pointer-events:none;animation:hintFade 1.8s ease-in-out infinite;';
      ptr.innerHTML = `<div style="position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center;"><svg width="72" height="72" viewBox="0 0 72 72" fill="none" style="position:absolute;inset:0;"><circle cx="36" cy="36" r="34" stroke="rgba(255,255,255,0.55)" stroke-width="2"/></svg><svg width="52" height="52" viewBox="0 0 52 52" fill="none" style="transform:rotate(${angle}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));"><line x1="26" y1="44" x2="26" y2="10" stroke="white" stroke-width="4" stroke-linecap="round"/><polyline points="14,22 26,10 38,22" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>`;
      document.body.appendChild(ptr);
      _resolvePointerPosition(ptr, Array.from(document.querySelectorAll('.bb-hint-elevated')));
    }
    function _hideIndexHintPointer() {
      document.getElementById('_bbIdxHintPointer')?.remove();
    }

    function _showTutorialCompleteModal() {
      if (document.getElementById('tutorialCompleteModal')) return;
      const overlay = document.createElement('div');
      overlay.id = 'tutorialCompleteModal';
      overlay.innerHTML = `<div style="background:linear-gradient(135deg,var(--brand-primary-mid),var(--brand-primary-light));border-radius:20px;padding:28px 32px;text-align:center;max-width:300px;width:calc(100vw - 64px);box-shadow:0 12px 48px rgba(255,107,0,0.55);">
        <div style="font-size:2.6em;margin-bottom:10px;">🎓</div>
        <div style="font-weight:800;font-size:1.1em;color:white;margin-bottom:6px;">Tutorial Complete!</div>
        <div style="font-size:0.88em;color:rgba(255,255,255,0.9);line-height:1.5;margin-bottom:16px;">Done for now! There will be a few more hints as you progress.</div>
        <div style="font-size:0.78em;color:rgba(255,255,255,0.65);">Tap to dismiss</div>
      </div>`;
      Object.assign(overlay.style, {
        position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(0,0,0,0.55)', zIndex:'9999', cursor:'pointer',
      });
      overlay.addEventListener('click', () => {
        overlay.remove();
        // Unlock FABs now that tutorial popup is dismissed
        localStorage.setItem('bbFabsUnlocked', '1');
        _applyOnboardingGating();
      });
      document.body.appendChild(overlay);
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    }

    function _applyOnboardingGating() {
      const step = _getOnboardingStep();

      // Auto-set bbFabsUnlocked when tutorial completes
      if (localStorage.getItem('bbFabsUnlocked') !== '1' &&
          step >= 12 && localStorage.getItem('bbTutorialToastShown') === '1' &&
          !document.getElementById('tutorialCompleteModal')) {
        localStorage.setItem('bbFabsUnlocked', '1');
      }
      const _fabsUnlocked = localStorage.getItem('bbFabsUnlocked') === '1';

      // Step 4 was the "save your progress" sign-in blocking step. Auth FAB and
      // Anonymous button are now hidden until tutorial completes, so step 4 is
      // skipped automatically — advance straight to 5 (logo hint).
      if (step === 4) {
        _advanceOnboardingStep(5);
        return;
      }

      // Auth FAB + Anonymous button: hidden until tutorial complete
      const _authWrap = document.getElementById('authFabWrapper');
      if (_authWrap) _authWrap.style.display = _fabsUnlocked ? '' : 'none';
      const _anonContainer = document.getElementById('anonymousContainer');
      if (_anonContainer) _anonContainer.style.display = _fabsUnlocked ? '' : 'none';

      // Survival kit: visible from step 6
      const _survival = document.getElementById('survivalContainer');
      if (_survival) _survival.style.display = step < 6 ? 'none' : '';

      // Footer link: visible from step 12
      const _footerLink = document.querySelector('.footer-link');
      if (_footerLink && _footerLink.parentElement) _footerLink.parentElement.style.display = step >= 12 ? '' : 'none';

      // is-new-user class: steps 0-3 only
      if (step < 4) document.body.classList.add('is-new-user');
      else document.body.classList.remove('is-new-user');

      // Privacy note: shown until first journal button click
      const _pn = document.getElementById('privacyNote');
      if (_pn) _pn.style.display = localStorage.getItem('bbPrivacyNoteDismissed') === '1' ? 'none' : '';

      // ── Hints ──
      // Hint 1 (journalStartHint): step 0 only
      const _h1 = document.getElementById('journalStartHint');
      if (_h1) _h1.style.display = step === 0 ? 'flex' : 'none';

      // Logo hint: step 5 only
      const _logoHint = document.getElementById('logoHint');
      if (_logoHint) _logoHint.style.display = step === 5 ? '' : 'none';

      // Survival kit hint removed — user finds it freely
      const _h6 = document.getElementById('survivalKitHint');
      if (_h6) _h6.style.display = 'none';

      // WA hint: permanently hidden (native-only, post-tutorial)
      const _waLbl = document.getElementById('waFabLabel');
      if (_waLbl) _waLbl.style.display = 'none';
      // Feedback hint: don't force-hide at step 12 — popup dismiss handler shows it

      // Sign-in hint permanently hidden (step 4 removed from tutorial flow)
      const _siHint = document.getElementById('signinHint');
      if (_siHint) _siHint.style.display = 'none';

      // ── Hint overlay ──
      const _blockingSteps = new Set([5]);
      const _isBlocking = _blockingSteps.has(step);
      const _overlay = document.getElementById('bbHintOverlay');
      if (_overlay) _overlay.style.display = _isBlocking ? '' : 'none';

      // Elevate hint + target above overlay when blocking
      document.querySelectorAll('.bb-hint-elevated').forEach(el => {
        el.classList.remove('bb-hint-elevated');
        el.style.zIndex = el.dataset.prevZIndex !== undefined ? el.dataset.prevZIndex : '';
        delete el.dataset.prevZIndex;
      });
      if (_isBlocking) {
        const _elevMap = {
          5:  [document.getElementById('logoHint'),   document.querySelector('.logo-bounce-wrapper')],
        };
        (_elevMap[step] || []).filter(Boolean).forEach(el => {
          el.dataset.prevZIndex = el.style.zIndex;
          el.style.zIndex = '601';
          if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
          el.classList.add('bb-hint-elevated');
        });
        _hideIndexHintPointer();
      } else {
        _hideIndexHintPointer();
      }

      // Journal tutorial progress: X/3 entries needed (hidden once advanced tutorial complete)
      const _prog = document.getElementById('journalTutorialProgress');
      if (_prog) {
        // Count completed tutorial milestones directly from flags — not from step number,
        // since step can reach 10+ via logo/survival/feedback flow without multiple entries.
        const _e1 = localStorage.getItem('bbHasEntries') === '1';                     // Entry 1: first real entry
        const _e2 = localStorage.getItem('bbSettingsHintDone') === '1';               // Entry 2: settings hint seen
        const _e3 = localStorage.getItem('bbCloseSettingsHintDone') === '1';          // Entry 3: settings tutorial done
        const _e4 = localStorage.getItem('bb_fmMoodTipShown') === '1';               // Entry 4: tap & hold hint done
        if (_e4) {
          _prog.style.display = 'none';
        } else {
          const _done = [_e1, _e2, _e3].filter(Boolean).length;
          const _remaining = 4 - _done;
          _prog.textContent = _remaining + ' more ' + (_remaining === 1 ? 'entry' : 'entries') + ' needed to complete tutorial';
          _prog.style.display = '';
        }
      }

      if (typeof window._applyFabDock === 'function') window._applyFabDock();
    }
    window._applyOnboardingGating = _applyOnboardingGating;

    // ── Onboarding page lock ──
    (function() {
      // step → [targetId, hintId]
      const _isNatLock = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      const _map = {
        5:  ['.logo-img',       'logoHint'],
      };
      function _getTarget(s) { const e = _map[s]; if (!e) return null; const id = e[0]; return id.startsWith('.') ? document.querySelector(id) : document.getElementById(id); }
      function _getHint(s)   { const e = _map[s]; if (!e) return null; return document.getElementById(e[1]); }
      function _nudge() {
        const s = _getOnboardingStep();
        let tgt = _getTarget(s);
        [_getHint(s), tgt].forEach(el => {
          if (!el) return;
          const _prev = el.style.animation;
          el.style.animation = 'none';
          el.offsetHeight;
          el.style.animation = 'bbHintNudge 0.5s ease';
          setTimeout(() => { el.style.animation = _prev; }, 520);
        });
      }
      function _isModalOpen() {
        return !!(document.querySelector('.overlay-modal.active, .wa-modal.active, .feedback-modal.active, .bb-auth-overlay.active, .bb-account-overlay.active'));
      }
      document.addEventListener('click', function(e) {
        const s = _getOnboardingStep();
        if (!_map[s]) return;
        if (_isModalOpen()) return;
        const t = _getTarget(s);
        if (!t || t === e.target || t.contains(e.target)) return;
        e.stopPropagation(); e.preventDefault();
        _nudge();
      }, true);
    })();

    // Show "Offline" instead of Sign In when there's no network
    function updateOnlineStatus() {
      const btn = document.getElementById('signinBtn');
      if (!btn || btn.style.display === 'none') return; // signed in — don't touch
      if (!navigator.onLine) {
        btn.disabled = true;
        btn.style.opacity = '0.35';
        btn.onclick = null;
      } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.onclick = () => window.showAuthModal();
      }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Streak badges under journal + anonymous buttons
    /**
     * Render the journal + anonymous streak badges from current localStorage values.
     * Cheap synchronous read — call after any mutation to bbCurrentStreak,
     * bbStableStreak, bbAnon_streak, bbAnon_monika.
     */
    function _updateStreakBadge() {
      const streak = parseInt(localStorage.getItem('bbCurrentStreak') || '0', 10);
      const stable = parseInt(localStorage.getItem('bbStableStreak')  || '0', 10);
      const anon   = parseInt(localStorage.getItem('bbAnon_streak')   || '0', 10);
      const hasAnon = !!localStorage.getItem('bbAnon_monika');

      // Journal badge: 🔥 + 🧘
      const badge = document.getElementById('journalStreakBadge');
      if (badge && streak > 0) {
        const stablePart = stable > 0 ? ` &nbsp;🧘 ${stable}d` : '';
        badge.innerHTML     = `🔥 ${streak} day${streak === 1 ? '' : 's'}` + stablePart;
        badge.style.display = 'block';
        badge.style.cursor  = 'pointer';
      }

      // Anonymous badge: 👋 monika + 💬 streak
      const anonBadge = document.getElementById('anonStreakBadge');
      if (anonBadge) {
        if (hasAnon && anon > 0) {
          // _monika is user-supplied (Bipolar Anonymous nickname) — escape it
          // before splicing into innerHTML so a tampered localStorage value
          // can't inject markup. The rest of the template is static.
          const _monika = _escHtml(localStorage.getItem('bbAnon_monika') || '');
          const _monikaStr = _monika ? `👋 ${_monika} &nbsp;·&nbsp; ` : '';
          anonBadge.innerHTML     = `${_monikaStr}💬 ${anon} day${anon === 1 ? '' : 's'} streak`;
          anonBadge.style.display = 'block';
        } else if (hasAnon) {
          const _monika = _escHtml(localStorage.getItem('bbAnon_monika') || '');
          if (_monika) {
            anonBadge.innerHTML     = `👋 ${_monika}`;
            anonBadge.style.display = 'block';
          } else {
            anonBadge.style.display = 'none';
          }
        } else {
          anonBadge.style.display = 'none';
        }
      }
    }
    _updateStreakBadge();

    /**
     * Recompute the journal streak by reading the user's entries collection
     * directly. Used on sign-in to fix the stale-streak bug: the
     * userSettings.currentStreak field is only refreshed by journal.html when
     * the user opens the journal page, so on a fresh device login the cached
     * value can lag well behind the truth (e.g. 1 day shown when reality is 600).
     *
     * Mirrors the streak algorithm in journal.html (see displayStats around
     * the entryDates Set). If the two ever drift, factor into js/shared/streak.js.
     *
     * Reads only the plaintext `timestamp` field — entry payloads are E2E
     * encrypted, but timestamp + userId are stored alongside in cleartext.
     *
     * @param {firebase.User} user The signed-in Firebase user.
     */
    async function _recomputeStreakFromEntries(user) {
      if (!db || !user) return;
      const _fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      try {
        const snap = await db.collection('entries')
          .where('userId', '==', user.uid)
          .get();
        const entryDates = new Set();
        snap.forEach(doc => {
          const ts = doc.data().timestamp;
          if (typeof ts !== 'number') return;
          entryDates.add(_fmt(new Date(ts)));
        });
        if (entryDates.size === 0) return; // never overwrite a real value with 0

        const useToday = localStorage.getItem('journalDefaultToday') === 'true';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let checkDate = new Date(today);
        if (!useToday) checkDate.setDate(checkDate.getDate() - 1);
        // If the anchor day has no entry, slide one day back so streaks don't
        // break the moment the user hasn't logged today (or yesterday) yet.
        if (!entryDates.has(_fmt(checkDate))) {
          checkDate.setDate(checkDate.getDate() - 1);
        }
        let streak = 0;
        while (entryDates.has(_fmt(checkDate))) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        }

        localStorage.setItem('bbCurrentStreak', String(streak));
        db.collection('userSettings').doc(user.uid)
          .set({ currentStreak: streak }, { merge: true }).catch(() => {});
        _updateStreakBadge();
      } catch (e) {
        if (window.BB && window.BB.warn) window.BB.warn('[index] streak recompute failed:', e);
      }
    }
    window._recomputeStreakFromEntries = _recomputeStreakFromEntries;

    // Tap badge → explain both counters
    (function() {
      const badge = document.getElementById('journalStreakBadge');
      if (!badge) return;

      // Build tooltip card once
      const tip = document.createElement('div');
      tip.id = 'streakTooltip';
      Object.assign(tip.style, {
        display: 'none', position: 'absolute', zIndex: '999',
        background: '#fff', borderRadius: '14px', padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', fontSize: '13px',
        lineHeight: '1.6', color: '#1C1004', maxWidth: '260px',
        left: '50%', transform: 'translateX(-50%)', marginTop: '8px',
        textAlign: 'left',
      });
      tip.innerHTML =
        '<div style="font-weight:800;margin-bottom:8px;">Your counters</div>' +
        '<div style="margin-bottom:8px;">🔥 <strong>Streak</strong> — consecutive days you\'ve logged your mood. Resets if you miss a day.</div>' +
        '<div>🧘 <strong>Stability</strong> — consecutive days you\'ve logged your mood as <em>Stable</em>, counted back from your most recent entry. Resets when any other mood is logged.</div>';

      // Insert after badge
      badge.style.position = 'relative';
      badge.parentNode.insertBefore(tip, badge.nextSibling);

      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        const show = tip.style.display === 'none';
        tip.style.display = show ? 'block' : 'none';
      });
      document.addEventListener('click', function() { tip.style.display = 'none'; });
    })();

    function logout() {
      // Clear all user-specific cached data before signing out.
      // bbOnboardingStep is intentionally NOT cleared here — Firestore preserves it
      // so the user resumes at the same onboarding step on re-login on any device.
      const keysToRemove = [
        'bb_entryStatus',
        'moodDefinitions', 'copingStrategies',
        'currentMedList', 'dailyGoals',
        'unlockedAchievements',
        'bbHasEntries',
        'bbOnboardingStep',
        // Streaks & stats — must clear so they don't leak between accounts
        'bbCurrentStreak', 'bbStableStreak',
        // Anonymous board state
        'bbAnon_streak', 'bbAnon_monika', 'bbAnon_verified', 'bbAnonLastVisit',
        // Mood step tutorial hints
        'bb_moodTipShown', 'bb_fmMoodTipShown',
        'bb_fmChooseMoodHintDone', 'bb_fmMoodInfoCloseHintDone',
        // Settings / customise tutorial hints
        'bbSettingsHintDone',
        'bbCustomiseFormHintDone', 'bbCustomiseAdditionalHintDone', 'bbCloseSettingsHintDone',
        'bbAdvancedTutorialToastShown',
        // Advanced settings badge + tap-hold hint pending
        'bbAdvancedBadgePending', 'bbAdvancedBadgeVisible',
        'bb_fmTapHoldHintPending', 'bb_fmTapHoldHintReady',
        // Misc hints
        'bbPersonalHintDone',
        'bbFavouriteHintSeen', 'bbPrivateHintSeen', 'bbFavAnniShown',
        'bbFeedbackFabHidden', 'bbWaFabHidden', 'bbCoffeeFabHidden', 'bbQuickNoteFabHidden', 'bbFooterHidden', 'bbFabsUnlocked',
        'bbFabSlot_1', 'bbFabSlot_2', 'bbFabSlot_3', 'bbFabSlot_4',
        'bbLogoEasterEggFound',
        'bbPinEnabled', 'bbPinCode',
        'bbWelcomeShown',
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem('bbPinUnlocked');

      // Reset both ticks to inactive
      const jTick = document.getElementById('journalEntryTick');
      if (jTick) jTick.setAttribute('data-done', 'false');
      const sTick = document.getElementById('survivalTick');
      if (sTick) sTick.setAttribute('data-done', 'false');

      // Hide streak / anon badges so old account's stats don't linger on the home page
      const _jBadge = document.getElementById('journalStreakBadge');
      if (_jBadge) _jBadge.style.display = 'none';
      const _aBadge = document.getElementById('anonStreakBadge');
      if (_aBadge) _aBadge.style.display = 'none';
      const _amBadge = document.getElementById('anonMessagesBadge');
      if (_amBadge) _amBadge.style.display = 'none';
      // Reset survival kit progress count to default (4 always-complete sections + 1 anon = 5/13)
      const _sp = document.getElementById('survivalProgress');
      if (_sp) _sp.textContent = '5 / 13 sections complete';

      if (auth) auth.signOut();
    }

    // ── Auth hooks (modals now live in fab.js) ──
    window._fabOnShowAuth = function () {
      const _step = _getOnboardingStep();
      if (_step === 4) _advanceOnboardingStep(5);
    };
    window._fabOnCloseAuth = function () {
      // Briefly block pointer events to prevent tap-through after modal close
      const _container = document.querySelector('.container');
      if (_container) {
        _container.style.pointerEvents = 'none';
        setTimeout(() => { _container.style.pointerEvents = ''; }, 400);
      }
    };
    window._fabOnSignOut = logout;
    window._fabOpenPersonalInfo = function () {
      window.closeAccountModal();
      showPersonalDetailsModal();
    };

    const _pdFields = [
      ['pdName','personalName'], ['pdDOB','personalDOB'], ['pdMedNum','personalMedicalNum'],
      ['pdDiagnosis','personalDiagnosis'], ['pdDiagDate','personalDiagnosisDate'],
      ['pdAddress','personalAddress'], ['pdMobile','personalMobile'],
      ['pdEmail','personalEmail'], ['pdEmergency','personalEmergencyContact'], ['pdNotes','personalNotes']
    ];

    async function showPersonalDetailsModal() {
      // Load from localStorage immediately so the modal opens without delay
      _pdFields.forEach(([elId, lsKey]) => {
        const el = document.getElementById(elId);
        if (el) el.value = localStorage.getItem(lsKey) || '';
      });
      document.getElementById('personalDetailsModal').classList.add('active');
      // Then try to freshen from Firestore in the background
      if (currentUser && db) {
        try {
          const doc = await db.collection('personalDetails').doc(currentUser.uid).get();
          if (doc.exists) {
            const d = doc.data();
            _pdFields.forEach(([elId, lsKey]) => {
              if (d[lsKey] !== undefined) {
                localStorage.setItem(lsKey, d[lsKey]);
                const el = document.getElementById(elId);
                if (el) el.value = d[lsKey];
              }
            });
          }
        } catch(e) {}
      }
    }
    function closePersonalDetailsModal() {
      document.getElementById('personalDetailsModal').classList.remove('active');
    }
    async function savePersonalDetails() {
      const data = {};
      _pdFields.forEach(([elId, lsKey]) => {
        const val = (document.getElementById(elId) || {}).value || '';
        localStorage.setItem(lsKey, val);
        data[lsKey] = val;
      });
      if (currentUser && db) {
        try { await db.collection('personalDetails').doc(currentUser.uid).set(data, { merge: true }); } catch(e) {}
      }
      closePersonalDetailsModal();
    }
    // ── Logo easter egg with persistence ──
    const logoImg = document.querySelector('.logo-img');
    const srcs = ['images/logos/good_logo.png', 'images/logos/elevated_logo.png', 'images/logos/sad_logo.png'];
    let currentIndex = parseInt(localStorage.getItem('logoVariant') || '0');
    let clickCount = 0;
    let resetTimer = null;

    function applyLogoVariant(idx) {
      currentIndex = idx;
      logoImg.src = srcs[idx];
    }

    function saveLogoVariant(idx) {
      localStorage.setItem('logoVariant', idx);
      if (currentUser && db) {
        db.collection('userSettings').doc(currentUser.uid).set({ logoVariant: idx }, { merge: true }).catch(() => {});
      }
      if (window.webkit?.messageHandlers?.setSharedData) {
        window.webkit.messageHandlers.setSharedData.postMessage({ logoVariant: idx });
      } else if (window.Capacitor?.getPlatform?.() === 'android') {
        window.Capacitor?.Plugins?.BipolarBearWidget?.setSharedData({ logoVariant: idx });
      }
    }

    // Restore on load
    applyLogoVariant(currentIndex);
    logoImg.style.cursor = 'pointer';

    // Logo hint — visibility controlled by _applyOnboardingGating (shown at step 4 only)
    const _logoHintText = document.getElementById('logoHintText');

    logoImg.addEventListener('click', () => {
      clearTimeout(resetTimer);
      clickCount++;

      // Update hint text during step 4 (logo hint active)
      const _logoHintEl = document.getElementById('logoHint');
      if (_logoHintEl && _logoHintEl.style.display !== 'none') {
        _logoHintEl.style.animation = 'none';
        _logoHintEl.style.opacity = '1';
        if (clickCount === 1 && _logoHintText) _logoHintText.textContent = 'Click me again!';
        else if (clickCount === 2 && _logoHintText) _logoHintText.textContent = 'and again…';
        else if (clickCount >= 3 && _logoHintText) _logoHintText.textContent = 'tap quicker…';
      }

      logoImg.style.transition = 'transform 0.1s ease';
      logoImg.style.transform = 'scale(1.15) rotate(5deg)';
      setTimeout(() => { logoImg.style.transform = ''; logoImg.style.transition = ''; }, 120);

      if (clickCount === 5) {
        clickCount = 0;
        // Advance to step 6 (survival kit revealed) then trigger easter egg
        _advanceOnboardingStep(6);
        _doLogoCycle();
      } else {
        resetTimer = setTimeout(() => { clickCount = 0; }, 1500);
      }
    });

    // ── Logo 5-second tap+hold: skip or restart tutorial ──
    (function() {
      let _lpHoldTimer = null;
      let _lpProgress = null;

      function _cancelLogoHold() {
        clearTimeout(_lpHoldTimer);
        _lpHoldTimer = null;
        if (_lpProgress) { _lpProgress.remove(); _lpProgress = null; }
      }

      function _startLogoHold(e) {
        _cancelLogoHold();

        _lpHoldTimer = setTimeout(() => {
          _cancelLogoHold();
          const _step = _getOnboardingStep();
          if (_step >= 12) {
            // Confirm dock reset
            const _confirmOverlay = document.createElement('div');
            _confirmOverlay.innerHTML = `<div style="background:white;border-radius:20px;padding:24px 24px 20px;text-align:center;max-width:290px;width:calc(100vw - 64px);box-shadow:0 12px 48px rgba(0,0,0,0.25);">
              <div style="font-weight:800;font-size:1em;color:#333;margin-bottom:10px;">Reset Dock?</div>
              <div style="font-size:0.88em;color:#666;line-height:1.55;margin-bottom:18px;">This will restore all hidden dock buttons back to their default positions.</div>
              <div style="display:flex;gap:10px;">
                <button id="_dockCancelBtn" style="flex:1;padding:11px;background:#f8f9fa;color:#495057;border:2px solid #e9ecef;border-radius:10px;font-weight:600;font-size:0.9em;cursor:pointer;">Cancel</button>
                <button id="_dockConfirmBtn" style="flex:1;padding:11px;background:var(--brand-primary);color:white;border:none;border-radius:10px;font-weight:600;font-size:0.9em;cursor:pointer;">Reset</button>
              </div>
            </div>`;
            Object.assign(_confirmOverlay.style, {
              position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,0.55)', zIndex:'9999',
            });
            document.body.appendChild(_confirmOverlay);
            document.getElementById('_dockCancelBtn').addEventListener('click', () => _confirmOverlay.remove());
            document.getElementById('_dockConfirmBtn').addEventListener('click', () => {
              _confirmOverlay.remove();
              ['bbWaFabHidden','bbQuickNoteFabHidden','bbCoffeeFabHidden','bbFeedbackFabHidden','bbFabSlot_1','bbFabSlot_2','bbFabSlot_3','bbFabSlot_4'].forEach(k => localStorage.removeItem(k));
              _applyOnboardingGating();
              const _t = document.createElement('div');
              Object.assign(_t.style, { position:'fixed', top:'calc(env(safe-area-inset-top,0px) + 12px)', left:'50%', transform:'translateX(-50%)', background:'var(--brand-primary)', color:'white', padding:'10px 20px', borderRadius:'20px', fontWeight:'700', fontSize:'0.9em', zIndex:'9999', whiteSpace:'nowrap', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', pointerEvents:'none' });
              _t.textContent = '✅ Dock reset';
              document.body.appendChild(_t);
              setTimeout(() => _t.remove(), 2000);
            });
          } else {
            // Skip tutorial — jump to step 12 and mark all tutorial flags as done
            localStorage.removeItem('bbOnboardingStep');
            // Pre-set flags so _advanceOnboardingStep doesn't show the popup
            localStorage.setItem('bbTutorialToastShown', '1');
            localStorage.setItem('bbFabsUnlocked', '1');
            _advanceOnboardingStep(12);
            [
              'bbTutorialToastShown', 'bbWelcomeShown', 'bbSurvivalKitVisited',
              'bb_fmChooseMoodHintDone', 'bb_fmMoodInfoCloseHintDone', 'bb_fmMoodTipShown',
              'bbSettingsHintDone', 'bbCustomiseFormHintDone', 'bbCustomiseAdditionalHintDone',
              'bbCloseSettingsHintDone', 'bbAdvancedTutorialToastShown', 'bbMedHintDone',
              'bbMoodDefHintDone', 'bbPersonalHintDone',
            ].forEach(k => localStorage.setItem(k, '1'));
            _applyOnboardingGating();
            const _t = document.createElement('div');
            Object.assign(_t.style, { position:'fixed', top:'calc(env(safe-area-inset-top,0px) + 12px)', left:'50%', transform:'translateX(-50%)', background:'var(--brand-primary)', color:'white', padding:'10px 20px', borderRadius:'20px', fontWeight:'700', fontSize:'0.9em', zIndex:'9999', whiteSpace:'nowrap', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', pointerEvents:'none' });
            _t.textContent = '✅ Tutorial skipped — enjoy the app!';
            document.body.appendChild(_t);
            setTimeout(() => _t.remove(), 2800);
          }
        }, 5000);
      }

      logoImg.addEventListener('touchstart', _startLogoHold, { passive: true });
      logoImg.addEventListener('touchend', _cancelLogoHold);
      logoImg.addEventListener('touchcancel', _cancelLogoHold);
      logoImg.addEventListener('mousedown', _startLogoHold);
      logoImg.addEventListener('mouseup', _cancelLogoHold);
      logoImg.addEventListener('mouseleave', _cancelLogoHold);
    })();

// ── BLOCK 3: today entry tick (does the user already have an entry today?) ──
// ── Entry status tick ──
    (function() {
      const useToday = localStorage.getItem('journalDefaultToday') === 'true';
      const target = new Date(); target.setHours(0, 0, 0, 0);
      if (!useToday) target.setDate(target.getDate() - 1);
      const toKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const targetKey = toKey(target);

      function setTickDone(done) {
        const tick = document.getElementById('journalEntryTick');
        if (tick) tick.setAttribute('data-done', done ? 'true' : 'false');
      }

      // 1. Check cached status written by journal.html on load
      try {
        const cached = JSON.parse(localStorage.getItem('bb_entryStatus') || 'null');
        if (cached && cached.key === targetKey) { setTickDone(cached.done); return; }
      } catch(e) {}

      // 2. Fallback: scan guest entry:* localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('entry:')) continue;
        try {
          const e = JSON.parse(localStorage.getItem(k) || '{}');
          if (e.date && toKey(new Date(e.date)) === targetKey) { setTickDone(true); return; }
        } catch(e) {}
      }
    })();

// ── BLOCK 4: survival-kit completion tick ──
// ── Survival Kit setup tick ──
    (function() {
      const tick = document.getElementById('survivalTick');
      if (!tick) return;

      function check() {
        try {
          const defs = JSON.parse(localStorage.getItem('moodDefinitions') || '{}');
          if (!Object.values(defs).some(v => v && String(v).trim())) return false;
        } catch(e) { return false; }
        try {
          const strats = JSON.parse(localStorage.getItem('copingStrategies') || '{}');
          if (!Object.values(strats).some(arr => Array.isArray(arr) && arr.length > 0)) return false;
        } catch(e) { return false; }
        try {
          const meds = JSON.parse(localStorage.getItem('currentMedList') || '[]');
          if (!Array.isArray(meds) || meds.length === 0) return false;
        } catch(e) { return false; }
        try {
          const goals = JSON.parse(localStorage.getItem('dailyGoals') || '[]');
          if (!Array.isArray(goals) || goals.length === 0) return false;
        } catch(e) { return false; }
        return true;
      }

      tick.setAttribute('data-done', check() ? 'true' : 'false');

      // Survival kit progress counter
      const _prog = document.getElementById('survivalProgress');
      if (_prog) {
        const _arr = k => { try { const v = JSON.parse(localStorage.getItem(k)||'[]'); return Array.isArray(v) && v.length > 0; } catch(e){ return false; } };
        const _obj = k => { try { const v = JSON.parse(localStorage.getItem(k)||'{}'); return Object.values(v).some(a => Array.isArray(a) && a.length > 0); } catch(e){ return false; } };
        let _c = 4; // mood-scale, books, media, spiritual — always complete
        if (_arr('currentMedList')) _c++;
        if (_arr('dailyGoals')) _c++;
        if (_arr('survivalGratitude')) _c++;
        const _rt = localStorage.getItem('rememberThis'); if (_rt && _rt.trim()) _c++;
        if (_obj('copingStrategies')) _c++;
        if (_obj('moodMemories')) _c++;
        if (_arr('myCommitments')) _c++;
        if (_arr('customReminders')) _c++;
        _c++; // bipolar-anon section is always complete (info section)
        if (_c >= 13) {
          _prog.textContent = '✓ All sections completed';
          _prog.style.display = 'block';
        } else {
          _prog.textContent = _c + ' / 13 sections complete';
          _prog.style.display = 'block';
        }
      }
    })();

// ── BLOCK 5: celebration confetti + toast ──
// ── Celebration confetti + toast (three states) ──
    (function() {
      const journalTick  = document.getElementById('journalEntryTick');
      const survivalTick = document.getElementById('survivalTick');

      function isDone(el) { return el && el.getAttribute('data-done') === 'true'; }

      // Inject confetti keyframe once
      const _cfStyle = document.createElement('style');
      _cfStyle.textContent = `@keyframes bbConfettiFall {
        0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        80%  { opacity: 1; }
        100% { transform: translateY(105vh) rotate(720deg) scale(0.8); opacity: 0; }
      }`;
      document.head.appendChild(_cfStyle);

      function launchConfetti(count, colors) {
        for (let i = 0; i < count; i++) {
          const el = document.createElement('div');
          const color = colors[Math.floor(Math.random() * colors.length)];
          const w = 6 + Math.random() * 8;
          const h = Math.random() > 0.5 ? w : w * 0.45;
          const x = Math.random() * 100;
          const delay = Math.random() * 1.4;
          const dur = 2.2 + Math.random() * 1.8;
          Object.assign(el.style, {
            position: 'fixed', top: '-12px', left: `${x}vw`,
            width: `${w}px`, height: `${h}px`, background: color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            zIndex: '9998', pointerEvents: 'none',
            animation: `bbConfettiFall ${dur}s ${delay}s ease-in forwards`,
          });
          document.body.appendChild(el);
          setTimeout(() => el.remove(), (dur + delay + 0.5) * 1000);
        }
      }

      function showToast(msg, bg) {
        const t = document.createElement('div');
        Object.assign(t.style, {
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: '50%',
          transform: 'translateX(-50%) translateY(-12px)',
          background: bg, color: 'white',
          padding: '10px 20px', borderRadius: '20px',
          fontWeight: '700', fontSize: '0.95em',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          whiteSpace: 'nowrap', zIndex: '9999', pointerEvents: 'none',
          animation: 'bbCelebToast 3.2s ease forwards',
        });
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3400);
      }

      function _doLogoCycle() {
        currentIndex = (currentIndex + 1) % srcs.length;
        saveLogoVariant(currentIndex);
        // Mark easter egg found on first discovery
        const _firstFind = !localStorage.getItem('bbLogoEasterEggFound');
        if (_firstFind) localStorage.setItem('bbLogoEasterEggFound', '1');
        // Sync app icon (native only)
        try {
          if (window.webkit?.messageHandlers?.setAppIcon) {
            const _iconNames = [null, 'AppIcon_Happy', 'AppIcon_Sad'];
            window.webkit.messageHandlers.setAppIcon.postMessage({ name: _iconNames[currentIndex] || null });
          }
        } catch(e) {}
        // Animate logo swap
        logoImg.style.transition = 'transform 0.4s ease, opacity 0.3s ease';
        logoImg.style.transform = 'scale(0) rotate(180deg)';
        logoImg.style.opacity = '0';
        setTimeout(() => {
          logoImg.src = srcs[currentIndex];
          logoImg.style.transform = 'scale(1.2) rotate(-5deg)';
          logoImg.style.opacity = '1';
          setTimeout(() => {
            logoImg.style.transition = '';
            logoImg.style.transform = '';
            // Celebration
            launchConfetti(18, ['var(--brand-primary)', 'var(--brand-primary-dark)', '#ffd43b', '#ffffff', '#ff8c42']);
            if (_firstFind) showToast('🎨 Easter egg found!', 'var(--brand-primary)');
          }, 200);
        }, 300);
      }

      const _journalColors  = ['var(--brand-primary)','var(--brand-primary-dark)','#ffd43b','#ffec99','#ff8c42','#fab005'];
      const _survivalColors = ['#51cf66','#339af0','#20c997','#74c0fc','#63e6be','#4dabf7'];
      const _bothColors     = ['var(--brand-primary)','var(--brand-primary-dark)','#51cf66','#339af0','#f06595','#ffd43b','#a9e34b','#cc5de8'];

      // Survival toast fires only once ever (localStorage); journal + combined fire every launch
      let _bothFired = false;

      function _fire(type) {
        if (type === 'both') {
          if (_bothFired) return;
          _bothFired = true;
          launchConfetti(90, _bothColors);
          showToast('🎉 All done today — great work!', 'linear-gradient(135deg,var(--brand-primary-light),var(--brand-primary-mid))');
        } else if (type === 'journal') {
          if (_bothFired) return; // combined already fired, skip individual
          launchConfetti(45, _journalColors);
          showToast('📔 Journal up to date!', 'linear-gradient(135deg,var(--brand-primary-light),var(--brand-primary-mid))');
        } else if (type === 'survival') {
          if (localStorage.getItem('bbSurvivalCelebDone') === '1') return;
          localStorage.setItem('bbSurvivalCelebDone', '1');
          launchConfetti(45, _survivalColors);
          showToast('🆘 Survival kit filled in!', 'linear-gradient(135deg,var(--brand-primary-light),var(--brand-primary-mid))');
        }
      }

      function celebrate(changed) {
        const jDone = isDone(journalTick);
        const sDone = isDone(survivalTick);
        if (jDone && sDone) { _fire('both'); }
        else if (jDone && (changed === journalTick || changed === null)) { _fire('journal'); }
        else if (sDone && (changed === survivalTick || changed === null)) { _fire('survival'); }
      }

      // Check sync state immediately (ticks already set by earlier scripts)
      celebrate(null);

      // Also watch for async tick updates (Firestore path)
      const obs = new MutationObserver(mutations => {
        mutations.forEach(m => { if (m.attributeName === 'data-done') celebrate(m.target); });
      });
      if (journalTick)  obs.observe(journalTick,  { attributes: true, attributeFilter: ['data-done'] });
      if (survivalTick) obs.observe(survivalTick, { attributes: true, attributeFilter: ['data-done'] });
      setTimeout(() => obs.disconnect(), 10000);

      // Expose logo cycle globally so click handler (in earlier script block) can call it
      window._doLogoCycle = _doLogoCycle;
    })();

// ── BLOCK 6: WhatsApp button bootstrap on native shell ──
// Show WhatsApp button only in native app
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      document.body.classList.add('is-native');
    }

    // Handle widget deep link — bipolarbear://journal opens journal page directly
    (function() {
      const App = window.Capacitor?.Plugins?.App;
      if (!App) return;
      App.addListener('appUrlOpen', function(data) {
        if (data && data.url && data.url.includes('journal')) {
          location.replace('journal.html');
        }
      });
    })();

// ── BLOCK 7: navigation handlers + onboarding-step advance helpers ──
function _handleIndexJournalNav() {
      _advanceOnboardingStep(8);
      location.replace('journal.html');
    }
    window._handleIndexJournalNav = _handleIndexJournalNav;

    function _getFbPlatform() {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        return /android/i.test(navigator.userAgent) ? 'Android' : 'iOS';
      }
      return 'Web';
    }

    function openWhatsAppModal() {
      document.getElementById('waModal').classList.add('active');
      const _ov = document.getElementById('bbHintOverlay');
      if (_ov) _ov.style.display = 'none';
    }
    function _closeWaModal() {
      document.getElementById('waModal').classList.remove('active');
      _advanceOnboardingStep(10);
    }
    window.openWhatsAppModal = openWhatsAppModal;

    // Hook called by fab.js closeFabFeedback — advance onboarding and enable focus mode
    window._onFabFeedbackClose = function () {
      localStorage.setItem('focusedModeEnabled', '1');
      _advanceOnboardingStep(12);
    };

    // Auto-open feedback modal if navigated here with #feedback hash
    if (window.location.hash === '#feedback') {
      history.replaceState(null, '', window.location.pathname);
      window.addEventListener('load', () => setTimeout(openFabFeedback, 300));
    }

    // ── Apply onboarding gating on page load ──
    _applyOnboardingGating();

    // ── Welcome popup (first-ever launch) ──
    function _showWelcomePopup() {
      if (document.getElementById('bbWelcomeModal')) return;
      const overlay = document.createElement('div');
      overlay.id = 'bbWelcomeModal';
      overlay.innerHTML = `<div style="background:linear-gradient(135deg,var(--brand-primary-mid),var(--brand-primary-light));border-radius:20px;padding:28px 28px 24px;text-align:center;max-width:300px;width:calc(100vw - 64px);box-shadow:0 12px 48px rgba(255,107,0,0.55);">
        <div style="font-size:2.4em;margin-bottom:10px;">🐻</div>
        <div style="font-weight:800;font-size:1.05em;color:white;margin-bottom:10px;line-height:1.4;">Welcome to your BipolarBear.app!</div>
        <div style="font-size:0.88em;color:rgba(255,255,255,0.92);line-height:1.55;margin-bottom:18px;">This will be your mood journal and personalised survival kit going forward.<br><br>I'm here to help you get started. Let's go!</div>
        <div style="font-size:0.78em;color:rgba(255,255,255,0.65);">Tap to dismiss</div>
      </div>`;
      Object.assign(overlay.style, {
        position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(0,0,0,0.6)', zIndex:'9999', cursor:'pointer',
      });
      overlay.addEventListener('click', () => {
        overlay.remove();
        localStorage.setItem('bbWelcomeShown', '1');
      });
      document.body.appendChild(overlay);
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    }

    // Show welcome popup only on first launch AND only for new users (step 0, no entries)
    if (!localStorage.getItem('bbWelcomeShown') && _getOnboardingStep() === 0 && !localStorage.getItem('bbHasEntries')) {
      setTimeout(_showWelcomePopup, 600);
    }

    // Steps 9 and 10 (WA/feedback hints) removed from tutorial — auto-advance to 12 on all platforms.
    // Also: complete tutorial automatically once the user has saved their first journal entry.
    (function() {
      const _s = _getOnboardingStep();
      if (_s === 10) {
        _advanceOnboardingStep(12);
        if (localStorage.getItem('bbTutorialToastShown') !== '1') {
          localStorage.setItem('bbTutorialToastShown', '1');
          setTimeout(_showTutorialCompleteModal, 400);
        }
      } else if (_s >= 4 && _s < 12 && localStorage.getItem('bbHasEntries') === '1') {
        // User has logged their first entry and returned to home — mark tutorial complete
        _advanceOnboardingStep(12);
      }
    })();

    // ── What's New popup ──
    const _APP_VERSION = '0.98';
    window._APP_VERSION = _APP_VERSION;
    const _WHATS_NEW_HEADLINES = {
      '0.98': 'Streaks, achievements & FAB dock now sync across your devices when you sign in',
      '0.97': 'Reminders & weekly summary now save instantly and sync across your devices',
      '0.89': 'Sign in & account management now shared across all pages — one place for everything',
      '0.88': 'FAB dock buttons updated to a softer look',
      '0.87': "What's new popup — see new features at a glance every update",
      '0.86': 'Dock buttons can now be hidden and re-added — tap + to customise your dock',
      '0.85': 'Full dock synced across all pages — same buttons everywhere',
      '0.84': 'Survival kit compass removed from tutorial for a smoother experience',
    };
    function _checkWhatsNew() {
      const lastSeen = localStorage.getItem('bbLastSeenVersion');
      if (lastSeen === _APP_VERSION) return;
      const step = _getOnboardingStep();
      if (step < 12 || localStorage.getItem('bbTutorialToastShown') !== '1') return;
      // Don't show if tutorial complete popup is still on screen
      if (document.getElementById('tutorialCompleteModal')) return;
      const headline = _WHATS_NEW_HEADLINES[_APP_VERSION];
      if (!headline) return;
      const popup = document.getElementById('whatsNewPopup');
      const vEl = document.getElementById('whatsNewVersion');
      const hEl = document.getElementById('whatsNewHeadline');
      if (!popup) return;
      if (vEl) vEl.textContent = "What's new · v" + _APP_VERSION;
      if (hEl) hEl.textContent = headline;
      popup.style.display = 'block';
      // Mark as seen immediately so navigating away doesn't re-show it
      localStorage.setItem('bbLastSeenVersion', _APP_VERSION);
    }
    function _dismissWhatsNew() {
      localStorage.setItem('bbLastSeenVersion', _APP_VERSION);
      const popup = document.getElementById('whatsNewPopup');
      if (popup) popup.style.display = 'none';
    }
    function _openFullChangelog() {
      _dismissWhatsNew();
      window.location.href = 'journal.html?openChangelog=1';
    }
    window._dismissWhatsNew = _dismissWhatsNew;
    window._openFullChangelog = _openFullChangelog;
    // Fire after a short delay so the page renders first
    setTimeout(_checkWhatsNew, 800);

// ── BLOCK 8: PIN lock overlay (guest encryption PIN or native logged-in PIN) ──
// ── App-wide PIN lock (guest encryption PIN or native logged-in PIN) ──
    (function() {
      const _isNat = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      const hasGuestPin = !!localStorage.getItem('bbGuestPinSalt');
      const hasNativePin = _isNat && localStorage.getItem('bbNativePinEnabled') === '1';
      if (!hasGuestPin && !hasNativePin) return;

      const unlocked = sessionStorage.getItem('bbPinUnlocked') === '1';
      if (!unlocked) {
        document.getElementById('guestPinOverlay').style.display = 'flex';
      }

      // Inactivity relock after 5 minutes
      let _idleTimer;
      function _resetIdleTimer() {
        clearTimeout(_idleTimer);
        _idleTimer = setTimeout(() => {
          sessionStorage.removeItem('bbPinUnlocked');
          sessionStorage.removeItem('bb_guest_key');
          _idxPinBuf = '';
          _idxRenderDots(0);
          document.getElementById('idxPinError').textContent = '';
          document.getElementById('guestPinOverlay').style.display = 'flex';
        }, 5 * 60 * 1000);
      }
      ['touchstart', 'mousedown', 'keydown', 'scroll'].forEach(ev =>
        document.addEventListener(ev, _resetIdleTimer, { passive: true })
      );
      if (unlocked) _resetIdleTimer(); // only start timer if currently unlocked
    })();

    let _idxPinBuf = '';

    function _idxRenderDots(filled) {
      document.querySelectorAll('.idx-pin-dot').forEach((d, i) => {
        d.style.background = i < filled ? 'white' : 'rgba(255,255,255,0.4)';
      });
    }

    async function idxPinKey(digit) {
      if (_idxPinBuf.length >= 4) return;
      _idxPinBuf += digit;
      _idxRenderDots(_idxPinBuf.length);
      if (_idxPinBuf.length < 4) return;

      // Native logged-in PIN: verify against Keychain
      const _isNat = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (_isNat && localStorage.getItem('bbNativePinEnabled') === '1') {
        try {
          const _ss = window.Capacitor?.Plugins?.SecureStorage;
          const stored = _ss ? await Promise.race([
            _ss.getItem('bb_native_pin'),
            new Promise(r => setTimeout(() => r(null), 3000)),
          ]) : null;
          if (_idxPinBuf !== stored) {
            document.getElementById('idxPinError').textContent = 'Incorrect PIN. Try again.';
            setTimeout(() => { _idxPinBuf = ''; _idxRenderDots(0); document.getElementById('idxPinError').textContent = ''; }, 800);
            return;
          }
          sessionStorage.setItem('bbPinUnlocked', '1');
          document.getElementById('guestPinOverlay').style.display = 'none';
          return;
        } catch(e) {
          document.getElementById('idxPinError').textContent = 'Verification failed. Try again.';
          setTimeout(() => { _idxPinBuf = ''; _idxRenderDots(0); document.getElementById('idxPinError').textContent = ''; }, 1200);
          return;
        }
      }

      // Guest PIN: verify against localStorage
      const saved = localStorage.getItem('bbPinCode');
      if (_idxPinBuf !== saved) {
        document.getElementById('idxPinError').textContent = 'Incorrect PIN. Try again.';
        setTimeout(() => {
          _idxPinBuf = '';
          _idxRenderDots(0);
          document.getElementById('idxPinError').textContent = '';
        }, 800);
        return;
      }

      // Correct — derive key and store in session
      const salt = localStorage.getItem('bbGuestPinSalt');
      if (salt) {
        try {
          const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
          const keyMaterial = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(_idxPinBuf), { name: 'PBKDF2' }, false, ['deriveKey']
          );
          const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
          );
          const raw = await crypto.subtle.exportKey('raw', key);
          sessionStorage.setItem('bb_guest_key', btoa(String.fromCharCode(...new Uint8Array(raw))));
        } catch(e) { console.error('PIN derive failed', e); }
      }
      sessionStorage.setItem('bbPinUnlocked', '1');
      document.getElementById('guestPinOverlay').style.display = 'none';
    }

    function idxPinDel() {
      if (_idxPinBuf.length === 0) return;
      _idxPinBuf = _idxPinBuf.slice(0, -1);
      _idxRenderDots(_idxPinBuf.length);
    }

    // ── PIN screen dimmer — saves battery when device left on lock screen ──
    (function() {
      const SLEEP_MS = 3 * 60 * 1000; // 3 minutes
      let _dimTimer = null;
      let _sleeping = false;

      function _startDimTimer() {
        clearTimeout(_dimTimer);
        const ov = document.getElementById('guestPinOverlay');
        if (!ov || ov.style.display === 'none') return;
        _dimTimer = setTimeout(_sleep, SLEEP_MS);
      }

      function _sleep() {
        if (_sleeping) return;
        _sleeping = true;
        const el = document.getElementById('pinSleepOverlay');
        if (!el) return;
        el.style.opacity = '0';
        el.style.transition = 'opacity 1.5s';
        el.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      }

      window._wakePinDimmer = function() {
        clearTimeout(_dimTimer);
        if (_sleeping) {
          _sleeping = false;
          const el = document.getElementById('pinSleepOverlay');
          if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; }, 1500);
          }
        }
        _startDimTimer();
      };

      // Watch the PIN overlay for show/hide to start/stop the timer
      const _ov = document.getElementById('guestPinOverlay');
      if (_ov) {
        new MutationObserver(() => {
          if (_ov.style.display !== 'none') {
            _startDimTimer();
          } else {
            clearTimeout(_dimTimer);
            if (_sleeping) window._wakePinDimmer();
          }
        }).observe(_ov, { attributes: true, attributeFilter: ['style'] });
        // Start immediately if overlay is already visible on page load
        if (_ov.style.display === 'flex') _startDimTimer();
      }

      // Any tap/key while PIN overlay is active resets the sleep timer
      ['touchstart', 'mousedown', 'keydown'].forEach(ev =>
        document.addEventListener(ev, () => {
          if (!_ov || _ov.style.display === 'none') return;
          window._wakePinDimmer();
        }, { passive: true })
      );
    })();

    function _nukeGuestData() {
      // Preserve web beta unlock so user isn't redirected to beta.html after wipe
      const _webUnlocked = localStorage.getItem('bbWebUnlocked');
      localStorage.clear();
      if (_webUnlocked) localStorage.setItem('bbWebUnlocked', _webUnlocked);
      sessionStorage.clear();
      location.replace(location.pathname);
    }

    function _confirmDeleteGuestData() {
      if (!confirm('This will permanently delete all your guest data — journal entries, settings, and preferences. There is no way to recover them.\n\nAre you absolutely sure?')) return;
      if (!confirm('Last chance — everything will be deleted and you will start fresh. Continue?')) return;
      _nukeGuestData();
    }
    window._confirmDeleteGuestData = _confirmDeleteGuestData;

    async function idxPinForgot() {
      const _isNat = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (_isNat && localStorage.getItem('bbNativePinEnabled') === '1') {
        if (!confirm('This will disable the app PIN. Your journal data stays safe.\n\nContinue?')) return;
        localStorage.removeItem('bbNativePinEnabled');
        await (window.Capacitor?.Plugins?.SecureStorage?.removeItem('bb_native_pin') ?? Promise.resolve()).catch(() => {});
        sessionStorage.setItem('bbPinUnlocked', '1');
        document.getElementById('guestPinOverlay').style.display = 'none';
        return;
      }
      // Guest PIN: full wipe (PIN is the encryption key — no recovery possible)
      if (!confirm('Your PIN is the encryption key for your journal. Without it, your entries cannot be recovered.\n\nThis will permanently delete all your data and start fresh.\n\nAre you absolutely sure?')) return;
      if (!confirm('Last chance — all entries and data will be deleted. Continue?')) return;
      _nukeGuestData();
    }
