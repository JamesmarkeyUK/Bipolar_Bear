// Build editorial App Store hero images for 13" iPad (2048×2732).
//
// Same stitched white→orange concept as the iPhone heroes (build-hero.mjs),
// but with the iPad device frame (matching build-ipad.mjs) wrapping the REAL
// full-screen iPad screenshots (out/ipad-real-fixed/*). The mood-journal iPad
// is ONE device split at the seam — image 1 (white) shows its left slice, image
// 2 (orange) reveals the rest — so the pair reads as a continuous panorama and
// leads straight into the existing orange iPad feature screens (build-ipad.mjs).
//
// Uses the real iPad app in an iPad frame (never phone art on an iPad canvas),
// staying clear of the App Store 2.3.3 concern noted in build-all.mjs.
//
// Run:  node build-ipad-hero.mjs   → out/ipad-hero/*.png  (+ _stitch-preview.png)
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 2048, H = 2732;
const REAL = path.resolve('out/ipad-real-fixed');
const shot = f => pathToFileURL(path.join(REAL, f)).href;
const face = f => pathToFileURL(path.resolve('../images/moods/' + f)).href;

// An iPad frame wrapping a real screenshot (mirrors build-ipad.mjs .device).
const ipad = (img, w, extra) => `
  <div class="ipad" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
  </div>`;

const SHELL = (inner, bg, tone) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<link rel="stylesheet" href="../fonts.css">
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
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,70,20,.14), rgba(120,70,20,0)); }
  .on-orange .floor{ background:radial-gradient(closest-side, rgba(80,35,0,.28), rgba(80,35,0,0)); }

  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-orange .head{ color:#ffffff; text-shadow:0 6px 28px rgba(140,55,0,.28); }

  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-orange .sub{ color:#fff6ea; }

  /* iPad frame — matches build-ipad.mjs .device */
  .ipad{ position:absolute; padding:34px; border-radius:66px;
    background:linear-gradient(160deg,#17171b,#0a0a0c);
    box-shadow:
      0 2px 0 2px rgba(255,255,255,.06) inset,
      0 80px 150px -36px rgba(40,16,0,.5),
      0 34px 64px -24px rgba(0,0,0,.42); }
  .ipad::before{ content:''; position:absolute; top:17px; left:50%; transform:translateX(-50%);
    width:14px; height:14px; border-radius:50%; background:#050506;
    box-shadow:0 0 0 4px rgba(255,255,255,.05); z-index:6; }
  .ipad .scr{ position:relative; width:100%; aspect-ratio:3/4; border-radius:34px;
    overflow:hidden; background:#f4a63f; }
  .ipad .scr img{ width:100%; height:100%; object-fit:cover; display:block; }

  /* floating mood faces (fill the space beside the iPad on image 2) */
  .face{ position:absolute; }
  .face img{ width:100%; display:block;
    filter:drop-shadow(0 28px 38px rgba(110,45,0,.32)); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

// ── shared device geometry (the mood iPad spans the seam) ────────────
const IPAD_W = 1420;       // iPad frame width — identical on both halves
const IPAD_TOP = 470;      // iPad vertical band — identical on both
const IPAD_ROT = 3;        // mood iPad tilt (deg) — identical on both halves
const SEAM_SHOW = 500;     // px of the iPad visible on image 1's right edge
const H1_IPAD_LEFT = W - SEAM_SHOW;        // 1548 — most bleeds off the right
const H2_IPAD_LEFT = H1_IPAD_LEFT - W;     // -500 — same device, past the seam

// ── Image 1 — WHITE opener. The home iPad (bear logo + Mood Journal /
//    Survival Kit) is the hero; the mood iPad bleeds off the RIGHT edge to
//    continue onto image 2. Mirrors the approved iPhone hero1 two-device look.
const hero1 = SHELL(`
  <div class="disc" style="left:-140px; top:500px; width:1760px; height:1760px;"></div>

  <div class="head" style="top:180px; left:120px; right:760px; text-align:left; font-size:150px;">
    Every high.<br>Every low.</div>

  <div class="floor" style="left:170px; top:2040px; width:1040px; height:210px;"></div>

  <!-- mood iPad — the single seam-spanning device, bleeding off the RIGHT -->
  ${ipad(shot('02-journal-mood.png'), IPAD_W, `left:${H1_IPAD_LEFT}px; top:${IPAD_TOP}px; transform:rotate(${IPAD_ROT}deg); z-index:1;`)}
  <!-- home iPad — the front/feature device of image 1 -->
  ${ipad(shot('01-home.png'), 1160, 'left:100px; top:580px; transform:rotate(-3deg); z-index:2;')}

  <div class="sub" style="bottom:160px; left:120px; right:720px; text-align:left; font-size:54px; line-height:1.34;">
    A private, encrypted mood journal — track<br>the patterns, build your survival kit.</div>
`, 'bg-white', 'on-light');

// ── Image 2 — ORANGE feature. The SAME mood iPad continues in from the
//    LEFT edge; the five moods spill out from behind its right edge.
const hero2 = SHELL(`
  <div class="head" style="top:150px; left:80px; right:80px; text-align:center; font-size:138px;">
    Track every mood in seconds</div>

  <div class="floor" style="left:-260px; top:2270px; width:980px; height:200px;"></div>

  <!-- all five moods spilling out from BEHIND the iPad's right edge,
       rising depressed → manic (sizes grow outward). z below the iPad. -->
  <div class="face" style="left:1652px; top:492px;  width:356px; transform:rotate(-7deg);"><img src="${face('manic.png')}" alt=""></div>
  <div class="face" style="left:1461px; top:821px;  width:338px; transform:rotate(6deg);"><img src="${face('elevated.png')}" alt=""></div>
  <div class="face" style="left:1260px; top:1160px; width:320px; transform:rotate(-4deg);"><img src="${face('stable.png')}" alt=""></div>
  <div class="face" style="left:1047px; top:1497px; width:305px; transform:rotate(5deg);"><img src="${face('low.png')}" alt=""></div>
  <div class="face" style="left:835px;  top:1835px; width:290px; transform:rotate(-7deg);"><img src="${face('depressed.png')}" alt=""></div>

  <!-- the SAME mood iPad continued: image 1 showed its left slice, this
       reveals the rest as it enters from the LEFT edge. z above the faces. -->
  ${ipad(shot('02-journal-mood.png'), IPAD_W, `left:${H2_IPAD_LEFT}px; top:${IPAD_TOP}px; transform:rotate(${IPAD_ROT}deg); z-index:2;`)}

  <div class="sub" style="bottom:170px; left:0; right:0; text-align:center; font-size:54px; line-height:1.34;">
    From depressed to manic — capture how the<br>day really felt, in a couple of taps.</div>
`, 'bg-orange', 'on-orange');

mkdirSync('out/ipad-hero', { recursive: true });
const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${out}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });

const jobs = [['01-hero', hero1], ['02-hero', hero2]];
for (const [name, html] of jobs) {
  const built = `screens/_ipad_hero_build.html`;
  writeFileSync(built, html);
  render(built, path.resolve(`out/ipad-hero/${name}.png`), W, H);
  console.log(`ipad-hero/${name}.png  ${W}x${H}`);
}

// dev-only: side-by-side stitch preview to verify the seam lines up
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} body{display:flex}
  img{width:${W}px;height:${H}px;display:block}
</style></head><body>
  <img src="${pathToFileURL(path.resolve('out/ipad-hero/01-hero.png')).href}">
  <img src="${pathToFileURL(path.resolve('out/ipad-hero/02-hero.png')).href}">
</body></html>`;
writeFileSync('screens/_ipad_hero_preview.html', preview);
render('screens/_ipad_hero_preview.html', path.resolve('out/ipad-hero/_stitch-preview.png'), W * 2, H);
console.log(`ipad-hero/_stitch-preview.png  ${W * 2}x${H}`);
