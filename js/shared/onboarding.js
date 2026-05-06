/**
 * Shared onboarding helpers used by index.html and journal.html.
 *
 * The two pages had verbatim copies of:
 *   - _getOnboardingStep()       step lookup with first-run / migration handling
 *   - _resolvePointerPosition()  geometry helper for the round hint pointer
 *
 * They differ in:
 *   - _advanceOnboardingStep — different post-advance hook (page-specific
 *                              gating callback) and journal omits the "tutorial
 *                              complete" modal. Each page keeps its own copy.
 *   - hint pointer rendering — different element ids and target lookups.
 *                              Each page keeps its own pointer renderer.
 *
 * What this file exports (on window.BB.onboarding):
 *   - getStep()                  → number, current onboarding step
 *   - resolvePointerPosition()   → places a fixed-position element at the
 *                                  least-occluded screen anchor
 *
 * Loading order: load this file in `<head>` after platform.js / debug.js but
 * before any inline script that calls getStep(). It has no external runtime
 * dependencies.
 *
 * @file js/shared/onboarding.js
 */
(function () {
  /** Module-level latch so the migration block in getStep() runs once per page load. */
  var _hintMigrationDone = false;

  /**
   * Returns the user's current onboarding step (0–12). Step 12 = tutorial
   * complete. Performs two side effects on the way:
   *
   *   1. Migration for legacy users — anyone who already has journal entries
   *      but no recorded step is treated as fully onboarded (step 12).
   *   2. Once the user is at step 12, marks every focused-mode hint flag as
   *      seen so newly-added hints don't suddenly appear for veterans.
   *
   * @returns {number} Onboarding step in the range 0..12.
   */
  function getStep() {
    if (
      !localStorage.getItem('bbOnboardingStep') &&
      localStorage.getItem('bbHasEntries') === '1'
    ) {
      localStorage.setItem('bbOnboardingStep', '12');
    }

    var step = parseInt(localStorage.getItem('bbOnboardingStep') || '0', 10);

    if (step >= 12 && !_hintMigrationDone) {
      _hintMigrationDone = true;
      [
        'bb_fmChooseMoodHintDone',
        'bb_fmMoodInfoCloseHintDone',
        'bbSettingsHintDone',
        'bbCustomiseFormHintDone',
        'bbCustomiseAdditionalHintDone',
        'bbCloseSettingsHintDone',
        'bb_fmMoodTipShown',
      ].forEach(function (f) {
        if (!localStorage.getItem(f)) localStorage.setItem(f, '1');
      });
      localStorage.removeItem('bb_fmTapHoldHintPending');
      localStorage.removeItem('bb_fmTapHoldHintReady');
      localStorage.removeItem('bbAdvancedBadgePending');
      localStorage.removeItem('bbAdvancedBadgeVisible');
    }
    return step;
  }

  /**
   * Two rectangles overlap iff they overlap on both axes.
   * @returns {boolean}
   */
  function _overlaps(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
  }

  /**
   * Position a hint-pointer element (typically a 72×72 floating circle) at
   * the first of five candidate anchors that doesn't collide with any of the
   * supplied "elevated" hint elements. If every anchor collides, the pointer
   * is hidden (display:none) so we never draw on top of the thing the pointer
   * is meant to be drawing attention to.
   *
   * Mutates `ptr.style.left/top/transform/display` directly.
   *
   * @param {HTMLElement} ptr      The pointer element to position.
   * @param {HTMLElement[]} hintEls Elements the pointer must not overlap.
   * @returns {boolean} true if a free position was found, false if hidden.
   */
  function resolvePointerPosition(ptr, hintEls) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var sz = 72;
    var pad = 16;
    var candidates = [
      { left: vw / 2,    top: vh / 2 },
      { left: vw / 2,    top: vh * 0.25 },
      { left: vw / 2,    top: vh * 0.75 },
      { left: vw * 0.25, top: vh / 2 },
      { left: vw * 0.75, top: vh / 2 },
    ];

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var px1 = c.left - sz / 2 - pad;
      var py1 = c.top  - sz / 2 - pad;
      var px2 = c.left + sz / 2 + pad;
      var py2 = c.top  + sz / 2 + pad;

      var hit = hintEls.some(function (el) {
        if (!el) return false;
        var r = el.getBoundingClientRect();
        return _overlaps(px1, py1, px2, py2, r.left, r.top, r.right, r.bottom);
      });

      if (!hit) {
        ptr.style.left = c.left + 'px';
        ptr.style.top = c.top + 'px';
        ptr.style.transform = 'translate(-50%,-50%)';
        return true;
      }
    }

    ptr.style.display = 'none';
    return false;
  }

  window.BB = window.BB || {};
  window.BB.onboarding = {
    getStep: getStep,
    resolvePointerPosition: resolvePointerPosition,
  };
})();
