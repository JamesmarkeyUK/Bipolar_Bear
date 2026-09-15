# Bipolar Anonymous — localised store screenshots

The Bipolar Anonymous listing set in all 10 UI languages, for both stores.
`<lang>` ∈ en, es, fr, de, it, pt, nl, pl, sv, zh.

```
out/localized-frames-anon/<lang>/          iPhone 6.9"  1290×2796
  01-hero.png        White — "You're not alone." (feed phone + thread phone)
  02-hero.png        Yellow — "Real people who get it" (community avatars)
                     ↑ 01 + 02 are ONE scene: the thread phone bridges the seam
  02-monika.png      Pick an anonymous name
  03-ask.png         Comment thread (dark cover)
  04-wiki.png        Community wiki (light cover)
  05-report.png      Report sheet / moderation

out/localized-frames-anon-android/<lang>/  Android  1080×1920, RGB
  01b-hero-light.png  Single light hero (as the English Android set)
  02-monika.png · 03-ask.png · 04-wiki.png · 05-report.png
```

Same filenames as the English sets in `out/anonymous/{iphone,android}/`.

## How it's built

Everything in this set is an HTML mockup (no real-app captures, no user
posts), so every screen — including the board screens framed inside the hero
phones (`screens/_board-feed.html`, `_board-thread.html`) — is localised by the
same whole-node text substitution as the main app's kit.

- `screens-i18n/anon_<lang>.json` — one flat English → translation map per
  language, shared by all the anon templates (so a string like "Comments" or
  "3h ago" is translated identically everywhere).
- `screens-i18n/anon_hero_strings.json` — the two stitched heroes' headlines and
  subtitles (HTML allowed, e.g. the highlighted `<span class="hl">`).

```bash
cd store-assets
node build-anon-localized.mjs
node build-anon-localized.mjs --android
python3 build-post-localized-android.py out/localized-frames-anon-android2x out/localized-frames-anon-android
```

One language: pass it after the flag (`node build-anon-localized.mjs --android de`),
then the post step. Render on macOS (Apple Color Emoji + the system font); needs
Pillow for the post step (`/usr/bin/python3` on macOS has it). No server needed.

## Wording choices

- **Inside the phone** the text is the app's own UI copy, taken from
  `js/shared/i18n.js` where it exists (report sheet + reasons, thread title /
  placeholder / Send, monika preview + button, board tabs, wiki pills). The app
  addresses users formally in de / fr / nl / zh (Sie / vous / u / 您), so the
  other in-phone strings on those screens follow suit.
- **Around the phone** (headlines, decks, chips, footnotes) the marketing copy
  uses the informal voice of the main app's localised set (du / tu / je / 你).
- **Portuguese:** the app's own UI is Brazilian Portuguese ("Suas publicações",
  "você"), while the store listing and all marketing copy are European
  Portuguese (pt-PT). The in-phone strings follow the app as it ships.
- "Monika" (the anonymous name) is kept as a brand term in every language;
  Polish declines it ("Monikę") where the sentence needs the accusative.
- Translations are machine-generated — a native-speaker skim is worth it
  before submission.
