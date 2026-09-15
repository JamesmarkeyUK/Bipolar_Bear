// Localised editorial heroes (the UniSim "slanted phone + crossover" opener).
// Same layout as build-hero.mjs, but per locale: the two headline/subtitle
// pairs come from hero_strings.json and the phones come from the localised
// captures in out/localized/<lang>/ (01-home.png + 02-journal.png).
//
// Usage:  node build-hero-localized.mjs [lang ...]   (default: all)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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
const TRDIR = process.env.TRDIR || 'screens-i18n';
const STR = JSON.parse(readFileSync(path.join(TRDIR, 'hero_strings.json'), 'utf8'));
const ALL = ['es','fr','de','it','pt','nl','pl','sv','zh'];
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const W = 1290, H = 2796;
const face = f => pathToFileURL(path.resolve('../images/moods/' + f)).href;
const phone = (img, w, extra) => `
  <div class="phone" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
    <div class="isl"></div>
  </div>`;

const SHELL = (inner, bg, tone) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><link rel="stylesheet" href="../fonts.css">
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:100%; height:100%; }
  .canvas{ position:relative; width:${W}px; height:${H}px; overflow:hidden;
    font-family:'Nunito','Segoe UI',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
  .bg-white{ background:#ffffff; }
  .bg-orange{ background:
    radial-gradient(120% 80% at 50% -10%, #ffc266 0%, rgba(255,194,102,0) 55%),
    linear-gradient(160deg, #ffaa33 0%, #ff8833 42%, #ff6b00 100%); }
  .disc{ position:absolute; border-radius:50%;
    background:radial-gradient(closest-side, #fff0db 0%, rgba(255,240,219,0) 72%); }
  .floor{ position:absolute; border-radius:50%; }
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,70,20,.16), rgba(120,70,20,0)); }
  .on-orange .floor{ background:radial-gradient(closest-side, rgba(80,35,0,.30), rgba(80,35,0,0)); }
  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-orange .head{ color:#ffffff; }
  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-orange .sub{ color:#fff6ea; }
  .phone{ position:absolute; padding:18px; border-radius:74px; background:#0b0b0d;
    box-shadow: 0 2px 0 2px rgba(255,255,255,.08) inset,
      0 60px 120px -30px rgba(40,16,0,.55), 0 24px 50px -20px rgba(0,0,0,.45); }
  .phone .scr{ position:relative; width:100%; border-radius:58px; overflow:hidden; background:#f4a63f; line-height:0; }
  .phone .scr img{ width:100%; display:block; }
  .phone .isl{ position:absolute; top:20px; left:50%; transform:translateX(-50%);
    width:118px; height:34px; border-radius:20px; background:#08080a; z-index:5; }
  .face{ position:absolute; }
  .face img{ width:100%; display:block; filter:drop-shadow(0 22px 30px rgba(110,45,0,.34)); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

const MOOD_W = 740, MOOD_TOP = 712, MOOD_ROT = 6, SEAM_SHOW = 250;
const H1_MOOD_LEFT = W - SEAM_SHOW, H2_MOOD_LEFT = H1_MOOD_LEFT - W;

const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${out}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });

for (const lang of LANGS) {
  const s = STR[lang];
  const dir = path.resolve(`out/localized/${lang}`);
  const shot = f => pathToFileURL(path.join(dir, f)).href;
  const home = shot('01-home.png'), mood = shot('02-journal.png');

  const hero1 = SHELL(`
    <div class="disc" style="left:-200px; top:740px; width:1960px; height:1960px;"></div>
    <div class="head" style="top:300px; left:96px; right:96px; text-align:left; font-size:122px;">${s.head1}</div>
    <div class="floor" style="left:120px; top:2330px; width:760px; height:150px;"></div>
    <div class="floor" style="left:980px; top:2120px; width:560px; height:150px;"></div>
    ${phone(mood, MOOD_W, `left:${H1_MOOD_LEFT}px; top:${MOOD_TOP}px; transform:rotate(${MOOD_ROT}deg); z-index:1;`)}
    ${phone(home, 700, 'left:150px; top:900px; transform:rotate(-7deg); z-index:2;')}
    <div class="sub" style="bottom:156px; left:120px; right:120px; text-align:center; font-size:39px; line-height:1.34;">${s.sub1}</div>
  `, 'bg-white', 'on-light');

  const hero2 = SHELL(`
    <div class="head" style="top:300px; left:80px; right:80px; text-align:center; font-size:112px;">${s.head2}</div>
    <div class="sub" style="bottom:150px; left:140px; right:140px; text-align:center; font-size:40px; line-height:1.32;">${s.sub2}</div>
    <div class="floor" style="left:-220px; top:2230px; width:760px; height:150px;"></div>
    <div class="face" style="left:957px; top:617px;  width:246px; transform:rotate(-8deg);"><img src="${face('manic.png')}" alt=""></div>
    <div class="face" style="left:824px; top:879px;  width:232px; transform:rotate(6deg);"><img src="${face('elevated.png')}" alt=""></div>
    <div class="face" style="left:690px; top:1145px; width:220px; transform:rotate(-4deg);"><img src="${face('stable.png')}" alt=""></div>
    <div class="face" style="left:555px; top:1415px; width:210px; transform:rotate(5deg);"><img src="${face('low.png')}" alt=""></div>
    <div class="face" style="left:400px; top:1680px; width:200px; transform:rotate(-7deg);"><img src="${face('depressed.png')}" alt=""></div>
    ${phone(mood, MOOD_W, `left:${H2_MOOD_LEFT}px; top:${MOOD_TOP}px; transform:rotate(${MOOD_ROT}deg); z-index:2;`)}
  `, 'bg-orange', 'on-orange');

  const outDir = `out/localized-frames/${lang}`;
  mkdirSync(outDir, { recursive: true });
  for (const [name, html] of [['01-hero', hero1], ['02-hero', hero2]]) {
    const built = `screens/_herol_${lang}.built.html`;
    writeFileSync(built, html);
    render(built, path.resolve(`${outDir}/${name}.png`), W, H);
    console.log(`${lang}/${name}.png`);
  }
}
console.log(`heroes rendered for ${LANGS.length} locale(s)`);
