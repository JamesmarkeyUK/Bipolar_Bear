# Android Feature Backlog

Features that exist on iOS but are not yet implemented on Android.
Check this list when doing an Android-specific dev sprint.

## Logo tap easter egg (onboarding step 5)

**What it does on iOS:**
- The bear logo on the home screen responds to taps.
- 5 quick taps → plays a logo cycle animation and advances the tutorial from step 5 to step 6.
- 5-second press-and-hold → skips the entire tutorial (steps < 12) or opens the "Reset Dock?" confirmation (step 12).
- Hint text "🐻 psst… click me!" appears at step 5 pointing at the logo.

**Current Android behaviour:**
- The logo tap handler runs (file: `js/index.js`, logo click handler ~line 892).
- The 5-click counter increments and the text hint updates ("Click me again!" etc.).
- However the logo cycle animation (`_doLogoCycle()`) and the visual feedback may not feel the same on Android.
- The 5-second hold timer fires correctly, but the UX has not been validated on Android.

**Workaround (in place):**
`_applyOnboardingGating()` in `js/index.js` detects `BB.platform.isAndroid()` and auto-advances from step 5 to step 6, skipping the logo easter egg step entirely. The hint is also hidden.

**To implement properly on Android:**
1. Verify `_doLogoCycle()` logo swap works (image paths, timing).
2. Validate the 5-second hold "skip tutorial" haptic/UX on Android.
3. Remove the Android skip block in `_applyOnboardingGating()` once it's working.
4. Test on a physical Android device — emulator touch events differ.
