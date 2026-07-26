// Build the social-share (Open Graph) cards — 1200×630, used as `og:image` /
// `twitter:image` on every page of both sites.
//
//   ../images/og-card.png            Bipolar Bear      (orange)
//   ../images/og-card-anonymous.png  Bipolar Anonymous (yellow)
//
// Both cards share one composition, echoing the App Store heroes: a white left
// half carrying the brand lockup + headline, the brand gradient on the right,
// two device-framed phones bridging the seam, and the mood spectrum / community
// voices wrapped around a circular arc bowing out to the right.
//
// Inputs:
//   • out/og-src/*.png — app screens recovered from the rendered heroes by
//     recover-hero-screens.py. Run that first if the heroes have changed.
//   • the anon welcome screen, captured live from ../anonymous.html below.
//
// Output is committed to the repo so Cloudflare Pages serves it statically —
// social crawlers can't run this. Supersedes scripts/build-og-cards.py.
//
//     cd store-assets && node build-og-cards.mjs
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const REPO = path.resolve('..');
const W = 1200, H = 630;
const SPLIT = 556;                      // white | brand-gradient seam

const url = p => pathToFileURL(path.resolve(p)).href;
const shot = f => url(path.join('out/og-src', f));

const render = (src, out, w, h, dsf = 1) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--allow-file-access-from-files', `--force-device-scale-factor=${dsf}`,
   '--virtual-time-budget=9000', `--window-size=${w},${h}`,
   `--screenshot=${path.resolve(out)}`, url(src)], { stdio: 'ignore' });

// ── Step 1: capture the anon welcome/verify gate straight from the page ──
//
// A temp copy of anonymous.html is rendered from the REPO ROOT (so its relative
// css/ js/ icons/ paths still resolve) with three things pre-seeded:
//   • bbLanguage      — otherwise i18n opens its language picker over the page
//   • BB_BRAND.bundle — 'anonymous' switches the page to the yellow theme, the
//                       job location.hostname does on the live domain
//   • html.is-native  — makes the ≥520px desktop device-frame mockup a no-op,
//                       so the capture is the bare screen
//
// Captured at 521 CSS px: it is the narrowest width where the is-native
// override applies. Below 520px headless Chrome leaves a black gutter down the
// left edge, and the frame mockup takes over instead.
const CAP_W = 521, CAP_H = Math.round(CAP_W * 2.1679);
const capture = path.join(REPO, '_og-capture-welcome.html');
try {
  const page = readFileSync(path.join(REPO, 'anonymous.html'), 'utf8')
    .replace('  <script src="js/shared/brand-config.js"></script>\n',
      '  <script>try { localStorage.setItem(\'bbLanguage\', \'en\'); } catch (_) {}</script>\n' +
      '  <script src="js/shared/brand-config.js"></script>\n' +
      '  <script>window.BB_BRAND && (window.BB_BRAND.bundle = \'anonymous\');</script>\n')
    .replace('<html lang="en">', '<html lang="en" class="is-native">');
  writeFileSync(capture, page);
  mkdirSync('out/og-src', { recursive: true });
  render(capture, 'out/og-src/screen-anon-welcome.png', CAP_W, CAP_H, 3);
  console.log(`og-src/screen-anon-welcome.png  ${CAP_W * 3}x${CAP_H * 3}`);
} finally {
  rmSync(capture, { force: true });
}

// ── Shared card chrome ───────────────────────────────────────────────
//
// `island: true` draws the dynamic island. Screens recovered from the store
// heroes already have one baked in; a live page capture does not.
const phone = (img, w, extra, island) => `
  <div class="phone" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt="">${island ? '<div class="isl"></div>' : ''}</div>
  </div>`;

// The mood faces / community avatars ride a circle bowing out to the right, so
// the spectrum wraps around the devices instead of running down the edge.
// i = 0 sits at the bottom of the arc (+spread) and sweeps up to -spread.
const onArc = (arc, items) => items.map((it, i) => {
  const deg = arc.spread - (i / (items.length - 1)) * 2 * arc.spread;
  const rad = deg * Math.PI / 180;
  return { ...it,
    left: Math.round(arc.cx + arc.r * Math.cos(rad) - it.size / 2),
    top:  Math.round(arc.cy + arc.r * Math.sin(rad) - it.size / 2) };
});

const SHELL = ({ gradient, seamTint, ringAlpha, arc, lockup, phones, cast }) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<link rel="stylesheet" href="${url('fonts.css')}">
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:100%; height:100%; }
  .card{ position:relative; width:${W}px; height:${H}px; overflow:hidden;
    font-family:'Nunito','Segoe UI',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }

  .white{ position:absolute; inset:0 auto 0 0; width:${SPLIT}px; background:#fff; }
  .brandbg{ position:absolute; inset:0 0 0 ${SPLIT}px; background:${gradient}; }
  /* warm spotlight softening the seam, as on hero 1 */
  .seam{ position:absolute; left:${SPLIT - 180}px; top:0; bottom:0; width:200px;
    background:radial-gradient(closest-side, ${seamTint}, rgba(255,255,255,0)); }

  /* faint guide ring, sitting just OUTSIDE the arc so it frames the cast
     rather than threading through it. Clipped to the brand half. */
  .arcclip{ position:absolute; inset:0 0 0 ${SPLIT}px; overflow:hidden; }
  .arcring{ position:absolute; border-radius:50%;
    border:2px solid rgba(255,255,255,${ringAlpha});
    left:${arc.cx - (arc.r + 66) - SPLIT}px; top:${arc.cy - (arc.r + 66)}px;
    width:${(arc.r + 66) * 2}px; height:${(arc.r + 66) * 2}px; }

  /* brand lockup — icon + wordmark, in the brand accent above the headline */
  .lock{ position:absolute; z-index:6; left:62px; top:152px; width:${lockup.width}px; }
  .brand{ display:flex; align-items:center; gap:15px; }
  .brand img{ width:58px; height:58px; display:block; border-radius:14px;
    filter:drop-shadow(0 6px 12px rgba(140,55,0,.28)); }
  .brand span{ font-weight:900; font-size:${lockup.nameSize}px; letter-spacing:-.015em;
    color:${lockup.accent}; }
  .head{ font-weight:900; font-size:62px; letter-spacing:-.025em; line-height:1.02;
    color:#26201a; margin-top:22px; }
  .tag{ font-weight:800; font-size:${lockup.tagSize}px; line-height:1.36;
    color:#8a7d6b; margin-top:20px; }

  /* iPhone frame — screens/shared.css .device, scaled to the card */
  .phone{ position:absolute; padding:9px; border-radius:38px; background:#0b0b0d;
    box-shadow:
      0 1px 0 1px rgba(255,255,255,.09) inset,
      0 40px 70px -20px rgba(40,16,0,.5),
      0 14px 28px -12px rgba(0,0,0,.45); }
  .phone .scr{ position:relative; width:100%; border-radius:30px; overflow:hidden;
    line-height:0; }
  .phone .scr img{ width:calc(100% + 10px); margin:-5px; display:block; }
  .phone .isl{ position:absolute; top:7px; left:50%; transform:translateX(-50%);
    width:47px; height:13px; border-radius:8px; background:#08080a; z-index:5; }

  /* mood faces (Bipolar Bear) */
  .face{ position:absolute; }
  .face img{ width:100%; display:block;
    filter:drop-shadow(0 14px 20px rgba(110,45,0,.34)); }

  /* anonymous community avatar — initials in a coloured disc */
  .cav{ position:absolute; }
  .cav .disc{ width:100%; height:100%; border-radius:50%; display:flex;
    align-items:center; justify-content:center; color:#fff; font-weight:800;
    font-family:'Segoe UI',system-ui,sans-serif; border:3px solid rgba(255,255,255,.92);
    box-shadow:0 14px 22px -8px rgba(90,60,0,.45); }
</style></head>
<body><div class="card">
  <div class="white"></div>
  <div class="brandbg"></div>
  <div class="seam"></div>
  <div class="arcclip"><div class="arcring"></div></div>

  <div class="lock">
    <div class="brand"><img src="${lockup.icon}" alt=""><span>${lockup.name}</span></div>
    <div class="head">${lockup.head}</div>
    <div class="tag">${lockup.tag}</div>
  </div>

  ${phones}
  ${cast}
</div></body></html>`;

// ── Bipolar Bear — orange, the six moods rising depressed → manic ─────
const BEAR_ARC = { cx: 690, cy: 315, r: 396, spread: 35 };
const bearCast = onArc(BEAR_ARC, [
  // ordered bottom → top; sizes grow outward toward manic, as on hero 2
  { file: 'depressed.png', size: 66, rot: 7,  z: 1 },
  { file: 'low.png',       size: 70, rot: -6, z: 1 },
  { file: 'stable.png',    size: 74, rot: 5,  z: 4 },
  { file: 'good.png',      size: 78, rot: -4, z: 4 },
  { file: 'elevated.png',  size: 82, rot: 6,  z: 4 },
  { file: 'manic.png',     size: 88, rot: -8, z: 4 },
]).map(f => `<div class="face" style="left:${f.left}px; top:${f.top}px; width:${f.size}px; transform:rotate(${f.rot}deg); z-index:${f.z};"><img src="${url(path.join(REPO, 'images/moods', f.file))}"></div>`).join('\n  ');

const bear = SHELL({
  gradient: `radial-gradient(120% 90% at 40% -20%, #ffc266 0%, rgba(255,194,102,0) 60%),
    linear-gradient(160deg, #ffaa33 0%, #ff8833 42%, #ff6b00 100%)`,
  seamTint: 'rgba(255,240,219,.95)',
  ringAlpha: '.13',
  arc: BEAR_ARC,
  lockup: {
    icon: url(path.join(REPO, 'icons/favicons/android-chrome-512x512.png')),
    name: 'Bipolar Bear', accent: '#ff7a1a', nameSize: 37,
    head: 'Every high.<br>Every low.',
    tag: 'A private, encrypted mood journal —<br>track the patterns, build your<br>survival kit.',
    tagSize: 22, width: 440,
  },
  phones: [
    phone(shot('screen-mood.png'), 292, 'left:472px; top:126px; transform:rotate(6deg); z-index:3;'),
    phone(shot('screen-home.png'), 248, 'left:736px; top:196px; transform:rotate(-6deg); z-index:2;'),
  ].join('\n  '),
  cast: bearCast,
});

// ── Bipolar Anonymous — yellow, the community voices ──────────────────
//
// Slightly tighter sweep than the main card: the avatar discs are solid, so a
// half-occluded one reads as clipped rather than as "spilling from behind".
const ANON_ARC = { cx: 700, cy: 315, r: 396, spread: 33 };
const anonCast = onArc(ANON_ARC, [
  // gradients match the avatars on the anon store screens (build-anon-hero.mjs)
  { txt: 'NW', grad: 'linear-gradient(135deg,#ce93d8,#7b1fa2)', size: 64, rot: 7,  z: 1 },
  { txt: 'JR', grad: 'linear-gradient(135deg,#f48fb1,#c2185b)', size: 70, rot: -6, z: 1 },
  { txt: 'BB', grad: 'linear-gradient(135deg,#64b5f6,#1565c0)', size: 76, rot: 5,  z: 4 },
  { txt: 'SS', grad: 'linear-gradient(135deg,#81c784,#2e7d32)', size: 82, rot: -4, z: 4 },
  { txt: 'QO', grad: 'linear-gradient(135deg,#ffb340,#e07800)', size: 90, rot: 6,  z: 4 },
]).map(v => `<div class="cav" style="left:${v.left}px; top:${v.top}px; width:${v.size}px; height:${v.size}px; transform:rotate(${v.rot}deg); z-index:${v.z};">
      <div class="disc" style="background:${v.grad}; font-size:${Math.round(v.size * 0.4)}px;">${v.txt}</div>
    </div>`).join('\n  ');

const anon = SHELL({
  gradient: `radial-gradient(120% 90% at 40% -20%, #ffe680 0%, rgba(255,230,128,0) 60%),
    linear-gradient(160deg, #ffd84d 0%, #f5c800 50%, #e0b400 100%)`,
  seamTint: 'rgba(255,246,214,.95)',
  // white carries far further on yellow than on orange
  ringAlpha: '.32',
  arc: ANON_ARC,
  lockup: {
    icon: url(path.join(REPO, 'icons/AppIcon_anonymous.png')),
    name: 'Bipolar Anonymous', accent: '#d19b00', nameSize: 33,
    head: 'You\'re not<br>alone.',
    tag: 'An anonymous peer community for<br>people living with bipolar.<br>No names, no judgement.',
    tagSize: 21, width: 426,
  },
  phones: [
    phone(shot('screen-anon-welcome.png'), 292, 'left:472px; top:126px; transform:rotate(6deg); z-index:3;', true),
    phone(shot('screen-anon-feed.png'), 248, 'left:736px; top:196px; transform:rotate(-6deg); z-index:2;'),
  ].join('\n  '),
  cast: anonCast,
});

// ── Step 2: render both cards ────────────────────────────────────────
for (const [name, html] of [['og-card', bear], ['og-card-anonymous', anon]]) {
  const built = `screens/_${name}.built.html`;
  writeFileSync(built, html);
  render(built, path.join(REPO, `images/${name}.png`), W, H);
  console.log(`images/${name}.png  ${W}x${H}`);
}
