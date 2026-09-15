# Localised store screenshots

Real-app screenshots of Bipolar Bear captured in every supported UI language,
at the exact App Store 6.9" iPhone size (**1290×2796**). Generated from the live
app — not mockups — so they always reflect the shipping UI and the translations
in `js/shared/i18n.js`.

```
out/localized/
  en/  es/  fr/  de/  it/  pt/  nl/  pl/  sv/  zh/
    01-home.png       Home dashboard
    02-journal.png    Focused-mode mood entry ("How was yesterday?")
    03-survival.png   Survival Kit (moods, definitions, strategies)
```

## Regenerating

```bash
# from the repo root
python3 -m http.server 8765          # serve the site locally
cd store-assets
node capture-localized.mjs           # all 10 locales → out/localized/<lang>/
# subset / custom Chrome:
LANGS=en,fr,de node capture-localized.mjs
CHROME=/path/to/chrome node capture-localized.mjs
```

`capture-localized.mjs` drives the app headless over the Chrome DevTools
Protocol, seeding demo content + the chosen language through
`_ipadseed.html?lang=…` (so no Firebase login is needed), and auto-detects
Chrome/Chromium on macOS, Windows and Linux.

## Notes

- These are the **raw app screenshots**. The branded marketing frames (headline
  overlays, tilted-phone heroes) in `out/iphone/` are a separate, currently
  English-only layer — see `build-all.mjs` / `build-hero.mjs`.
- To add a screen, extend the `PAGES` array in `capture-localized.mjs` with a
  page file, an output name, and a JS predicate that turns true once the screen
  has rendered.
- The Survival Kit "People helped" counter reads a live Firebase total, so it
  shows a spinner in the seeded/offline capture — harmless, or hide it before
  shooting if you want it clean.
