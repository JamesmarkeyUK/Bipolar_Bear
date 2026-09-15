# Localised branded store screenshots (finished set)

The full App Store / Play Store screenshot set — the two signature heroes plus
six feature screens — rendered in all 10 UI languages at the exact 6.9" iPhone
size (**1290×2796**).

```
out/localized-frames/<lang>/
  01-hero.png        White opener — "Every high. / Every low." (slanted phones)
  02-hero.png        Orange — "Track every mood in seconds" (mood faces)
                     ↑ 01 + 02 are ONE scene: the mood phone bridges the seam
  03-steps.png       Step / energy tracking
  04-sleep.png       Sleep sync
  05-anonymous.png   Anonymous peer board
  06-patterns.png    Personalised insights
  07-survivalkit.png Survival Kit
  08-pin.png         Full-privacy PIN + E2E encryption
```
`<lang>` ∈ en, es, fr, de, it, pt, nl, pl, sv, zh.

**Render on macOS.** The screens use emoji (👟 😴 🍺 …); macOS Chrome draws them
with Apple Color Emoji, as on an iPhone. Linux Chromium substitutes Noto /
monochrome glyphs — the first localised set went out like that and was re-rendered.

## How it's built (the reusable UniSim kit)

Two design layers, both regenerable from source:

1. **Heroes** (`build-hero-localized.mjs`) — the slanted-phone + crossover
   composition. Text comes from `screens-i18n/hero_strings.json`; the phones are
   the localised captures in `out/localized/<lang>/` (from `capture-localized.mjs`).
2. **Feature screens** (`build-localized.mjs`) — renders the hand-built
   `screens/*.html` mockups, substituting each English text node with its
   translation from `screens-i18n/screens_<lang>.json` (whole-node match, so
   attributes and partial words are never touched), then screenshots headless.

```bash
python3 -m http.server 8765          # from repo root (feature screens need it)
cd store-assets
node build-hero-localized.mjs        # → out/localized-frames/<lang>/01-,02-hero
node build-localized.mjs             # → out/localized-frames/<lang>/03-..08-
# one language:  node build-localized.mjs de
```

Chrome/Chromium is auto-detected (macOS / Windows / Linux). Translation data
lives in `screens-i18n/` — edit a string there and re-run to regenerate.

## Reusing for another UniSim app

The layout (`build-hero-localized.mjs` SHELL + the feature scaffold in
`screens/shared.css`) is app-neutral. For a new app: swap the brand gradient +
wordmark, point the capture tool at that app, supply its `screens_*.json` +
`hero_strings.json`, and run the same two build steps.

## To do / notes

- **Android**: same templates; add the `.android` class + render at 2160×3840
  and downscale (see `build-all.mjs` / `build-post.py`) — not yet generated per
  locale.
- **iPad + the Bipolar Anonymous app**: separate sets, same method.
- Translations are machine-generated; a native-speaker skim of the headlines is
  worth it before store submission (spot-checked de/fr/zh here — no overflow).
