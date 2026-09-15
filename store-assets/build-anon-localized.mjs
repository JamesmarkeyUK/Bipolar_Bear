// Localised Bipolar Anonymous store screenshots (iPhone 6.9" + Android).
//
// The anon set is all HTML mockups — no real-app captures — so every screen,
// including the board screens framed inside the hero phones, is localised by the
// same whole-node substitution as build-localized.mjs. One flat EN→translation
// map per language (screens-i18n/anon_<lang>.json) serves every anon template;
// the stitched heroes' headlines come from screens-i18n/anon_hero_strings.json.
// In-phone UI strings use the app's own translations (js/shared/i18n.js).
//
//   iPhone  → out/localized-frames-anon/<lang>/
//             01-hero + 02-hero (the stitched pair — same geometry as
//             build-anon-hero.mjs) + 02-monika 03-ask 04-wiki 05-report
//   Android → out/localized-frames-anon-android2x/<lang>/ at 2× with the .android
//             class: 01b-hero-light (the English Android set's single hero) + the
//             same four; then  python3 build-post-localized-android.py \
//               out/localized-frames-anon-android2x out/localized-frames-anon-android
//
// Usage:  node build-anon-localized.mjs [--android] [lang ...]   (default: all 10)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of readdirSync(pw)) if (d.startsWith('chromium-')) {
    const p = path.join(pw, d, 'chrome-linux', 'chrome'); if (existsSync(p)) c.unshift(p); } } catch (_) {}
  for (const x of c) { try { if (existsSync(x)) return x; } catch (_) {} }
  throw new Error('No Chrome/Chromium found — set CHROME');
}
const CHROME = findChrome();
const REPO = pathToFileURL(path.resolve('..')).href + '/';
const TRDIR = process.env.TRDIR || 'screens-i18n';
const HERO = JSON.parse(readFileSync(path.join(TRDIR, 'anon_hero_strings.json'), 'utf8'));
const ALL = ['en','es','fr','de','it','pt','nl','pl','sv','zh'];
const ARGS = process.argv.slice(2);
const ANDROID = ARGS.includes('--android');
const LANG_ARGS = ARGS.filter(a => !a.startsWith('--'));
const LANGS = LANG_ARGS.length ? LANG_ARGS : ALL;

// output name -> template (feature screens; the Android set opens with the light hero)
const FEATURES = {
  ...(ANDROID ? { '01b-hero-light': 'screens/screen-anon1-hero-light.html' } : {}),
  '02-monika': 'screens/screen-anon2-monika.html',
  '03-ask':    'screens/screen-anon3-ask-dark.html',
  '04-wiki':   'screens/screen-anon4-wiki-light.html',
  '05-report': 'screens/screen-anon5-report.html',
};
// target: render W, H, extra canvas class, output root
const [W, H, CLS, OUT] = ANDROID
  ? [2160, 3840, 'android', 'out/localized-frames-anon-android2x']
  : [1290, 2796, '', 'out/localized-frames-anon'];
const fit = Math.min(W / 1290, H / 2796);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-node substitution (same as build-localized.mjs): > <ws> token <ws> <
function substitute(html, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const en of keys) {
    const tr = map[en];
    if (tr == null || tr === en) continue;
    const body = esc(en).replace(/\\ /g, ' ').replace(/ /g, '\\s+');
    html = html.replace(new RegExp('>(\\s*)' + body + '(\\s*)<', 'g'), (_, a, b) => '>' + a + tr + b + '<');
  }
  return html;
}
const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${path.resolve(out)}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });
// write the HTML next to the templates (for ../fonts.css + shared.css), shoot, clean up
function shoot(html, out, w, h) {
  const built = `screens/_anonl_${path.basename(path.dirname(out))}_${path.basename(out, '.png')}.built.html`;
  writeFileSync(built, html);
  render(built, out, w, h);
  rmSync(built);
}
const trMap = lang => {
  const f = path.join(TRDIR, `anon_${lang}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
};

// ── Stitched iPhone heroes — layout copied from build-anon-hero.mjs ──────────
const phone = (img, w, extra) => `
  <div class="phone" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
    <div class="isl"></div>
  </div>`;
const av = (txt, grad, size, pos) => `
  <div class="cav" style="${pos} width:${size}px; height:${size}px;">
    <div class="disc2" style="background:${grad}; font-size:${Math.round(size * 0.42)}px;">${txt}</div>
  </div>`;
const SHELL = (inner, bg, tone) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><link rel="stylesheet" href="../fonts.css">
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:100%; height:100%; }
  .canvas{ position:relative; width:1290px; height:2796px; overflow:hidden;
    font-family:'Nunito','Segoe UI',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
  .bg-white{ background:#ffffff; }
  .bg-yellow{ background:
    radial-gradient(120% 80% at 50% -10%, #ffe680 0%, rgba(255,230,128,0) 55%),
    linear-gradient(160deg, #ffd84d 0%, #f5c800 50%, #e0b400 100%); }
  .disc{ position:absolute; border-radius:50%;
    background:radial-gradient(closest-side, #fff6d6 0%, rgba(255,246,214,0) 72%); }
  .floor{ position:absolute; border-radius:50%; }
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,90,20,.16), rgba(120,90,20,0)); }
  .on-yellow .floor{ background:radial-gradient(closest-side, rgba(90,60,0,.28), rgba(90,60,0,0)); }
  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-yellow .head{ color:#3d2c00; }
  .head .hl{ color:#e0a800; }
  .on-yellow .head .hl{ color:#7a5a00; }
  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-yellow .sub{ color:#5c4500; }
  .phone{ position:absolute; padding:18px; border-radius:74px; background:#0b0b0d;
    box-shadow: 0 2px 0 2px rgba(255,255,255,.08) inset,
      0 60px 120px -30px rgba(60,40,0,.55), 0 24px 50px -20px rgba(0,0,0,.45); }
  .phone .scr{ position:relative; width:100%; border-radius:58px; overflow:hidden; background:#FFFBF5; line-height:0; }
  .phone .scr img{ width:100%; display:block; }
  .phone .isl{ position:absolute; top:20px; left:50%; transform:translateX(-50%);
    width:118px; height:34px; border-radius:20px; background:#08080a; z-index:5; }
  .cav{ position:absolute; }
  .disc2{ width:100%; height:100%; border-radius:50%; display:flex; align-items:center;
    justify-content:center; color:#fff; font-weight:800;
    font-family:'Segoe UI',system-ui,sans-serif; border:8px solid rgba(255,255,255,.9);
    box-shadow:0 22px 34px -12px rgba(90,60,0,.45); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

const BOARD_W = 740, BOARD_TOP = 712, BOARD_ROT = 6, SEAM_SHOW = 250;
const H1_LEFT = 1290 - SEAM_SHOW, H2_LEFT = H1_LEFT - 1290;

const hero1 = (s, shot) => SHELL(`
  <div class="disc" style="left:-200px; top:740px; width:1960px; height:1960px;"></div>
  <div class="head" style="top:300px; left:96px; right:96px; text-align:left; font-size:130px;">${s.head1}</div>
  <div class="floor" style="left:120px; top:2330px; width:760px; height:150px;"></div>
  <div class="floor" style="left:980px; top:2120px; width:560px; height:150px;"></div>
  ${phone(shot('thread.png'), BOARD_W, `left:${H1_LEFT}px; top:${BOARD_TOP}px; transform:rotate(${BOARD_ROT}deg); z-index:1;`)}
  ${phone(shot('feed.png'), 700, 'left:150px; top:900px; transform:rotate(-7deg); z-index:2;')}
  <div class="sub" style="bottom:156px; left:120px; right:120px; text-align:center; font-size:39px; line-height:1.34;">${s.sub1}</div>
`, 'bg-white', 'on-light');

const hero2 = (s, shot) => SHELL(`
  <div class="head" style="top:300px; left:80px; right:80px; text-align:center; font-size:120px;">${s.head2}</div>
  <div class="sub" style="bottom:150px; left:130px; right:130px; text-align:center; font-size:40px; line-height:1.32;">${s.sub2}</div>
  <div class="floor" style="left:-220px; top:2230px; width:760px; height:150px;"></div>
  ${av('QO', 'linear-gradient(135deg,#ffb340,#e07800)', 236, 'left:957px; top:617px;  transform:rotate(-8deg);')}
  ${av('SS', 'linear-gradient(135deg,#81c784,#2e7d32)', 222, 'left:838px; top:900px;  transform:rotate(6deg);')}
  ${av('BB', 'linear-gradient(135deg,#64b5f6,#1565c0)', 210, 'left:712px; top:1178px; transform:rotate(-4deg);')}
  ${av('JR', 'linear-gradient(135deg,#f48fb1,#c2185b)', 200, 'left:586px; top:1452px; transform:rotate(5deg);')}
  ${av('NW', 'linear-gradient(135deg,#ce93d8,#7b1fa2)', 190, 'left:452px; top:1724px; transform:rotate(-7deg);')}
  ${phone(shot('thread.png'), BOARD_W, `left:${H2_LEFT}px; top:${BOARD_TOP}px; transform:rotate(${BOARD_ROT}deg); z-index:2;`)}
`, 'bg-yellow', 'on-yellow');

let n = 0;
for (const lang of LANGS) {
  const map = trMap(lang), outDir = `${OUT}/${lang}`;
  mkdirSync(outDir, { recursive: true });

  if (!ANDROID) {
    // localised board screens to frame inside the hero phones
    const src = `${OUT}/_hero-src/${lang}`;
    mkdirSync(src, { recursive: true });
    for (const [tpl, name] of [['screens/_board-feed.html', 'feed'], ['screens/_board-thread.html', 'thread']])
      shoot(substitute(readFileSync(tpl, 'utf8'), map), `${src}/${name}.png`, 1290, 2796);
    const shot = f => pathToFileURL(path.resolve(src, f)).href;
    for (const [name, html] of [['01-hero', hero1(HERO[lang], shot)], ['02-hero', hero2(HERO[lang], shot)]]) {
      shoot(html, `${outDir}/${name}.png`, 1290, 2796);
      n++; console.log(`${lang}/${name}.png`);
    }
  }

  for (const [name, tpl] of Object.entries(FEATURES)) {
    let html = readFileSync(tpl, 'utf8').replaceAll('REPO/', REPO)
      .replace('</head>', `<style>.canvas{--fit:${fit}}</style></head>`);
    if (CLS) html = html.replace('class="canvas ', `class="canvas ${CLS} `);
    shoot(substitute(html, map), `${outDir}/${name}.png`, W, H);
    n++; console.log(`${lang}/${name}.png`);
  }
}
if (!ANDROID) rmSync(`${OUT}/_hero-src`, { recursive: true, force: true });
console.log(`rendered ${n} frames across ${LANGS.length} locale(s)`);
