// Build editorial App Store hero images for BIPOLAR ANONYMOUS on 13" iPad
// (2048×2732) — the yellow-community sibling of build-ipad-hero.mjs.
//
// Same stitched white→yellow concept as the anon iPhone heroes
// (build-anon-hero.mjs), but with the iPad device frame (matching
// build-ipad.mjs / build-ipad-hero.mjs) wrapping iPad-aspect (3:4) board
// mockups. Uses iPad-shaped content in an iPad frame — never phone art on an
// iPad canvas — staying clear of the App Store 2.3.3 concern.
//
// The comment-thread iPad is ONE device split at the seam: image 1 (white)
// shows its left slice, image 2 (yellow) reveals the rest, and community
// avatars spill from behind it.
//
// Run:  node build-anon-ipad-hero.mjs
//   → out/anonymous/ipad-hero/*.png  (+ _stitch-preview.png)
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 2048, H = 2732;
const SRC = path.resolve('out/anonymous/ipad-hero-src');
const shot = f => pathToFileURL(path.join(SRC, f)).href;

const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${out}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });

// ── Step 1: render the iPad-aspect (1536×2048) board screens ──
mkdirSync(SRC, { recursive: true });
for (const [src, name] of [['_board-feed-ipad.html', 'feed'], ['_board-thread-ipad.html', 'thread']]) {
  render(`screens/${src}`, path.join(SRC, `${name}.png`), 1536, 2048);
  console.log(`ipad-hero-src/${name}.png  1536x2048`);
}

// An iPad frame wrapping a board screenshot (mirrors build-ipad-hero.mjs .ipad).
const ipad = (img, w, extra) => `
  <div class="ipad" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
  </div>`;

// `size` is the circle diameter; initials scale to ~42% of it.
const av = (txt, grad, size, pos) => `
  <div class="cav" style="${pos} width:${size}px; height:${size}px;">
    <div class="disc2" style="background:${grad}; font-size:${Math.round(size * 0.42)}px;">${txt}</div>
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
  .bg-yellow{ background:
    radial-gradient(120% 80% at 50% -10%, #ffe680 0%, rgba(255,230,128,0) 55%),
    linear-gradient(160deg, #ffd84d 0%, #f5c800 50%, #e0b400 100%); }

  .disc{ position:absolute; border-radius:50%;
    background:radial-gradient(closest-side, #fff6d6 0%, rgba(255,246,214,0) 72%); }

  .floor{ position:absolute; border-radius:50%; }
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,90,20,.14), rgba(120,90,20,0)); }
  .on-yellow .floor{ background:radial-gradient(closest-side, rgba(90,60,0,.26), rgba(90,60,0,0)); }

  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-yellow .head{ color:#3d2c00; }
  .head .hl{ color:#e0a800; }
  .on-yellow .head .hl{ color:#7a5a00; }

  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-yellow .sub{ color:#5c4500; }

  /* iPad frame — matches build-ipad-hero.mjs .ipad */
  .ipad{ position:absolute; padding:34px; border-radius:66px;
    background:linear-gradient(160deg,#17171b,#0a0a0c);
    box-shadow:
      0 2px 0 2px rgba(255,255,255,.06) inset,
      0 80px 150px -36px rgba(60,40,0,.5),
      0 34px 64px -24px rgba(0,0,0,.42); }
  .ipad::before{ content:''; position:absolute; top:17px; left:50%; transform:translateX(-50%);
    width:14px; height:14px; border-radius:50%; background:#050506;
    box-shadow:0 0 0 4px rgba(255,255,255,.05); z-index:6; }
  .ipad .scr{ position:relative; width:100%; aspect-ratio:3/4; border-radius:34px;
    overflow:hidden; background:#FFFBF5; }
  .ipad .scr img{ width:100%; height:100%; object-fit:cover; display:block; }

  /* floating community avatars (fill the space beside the iPad on image 2) */
  .cav{ position:absolute; }
  .disc2{ width:100%; height:100%; border-radius:50%; display:flex; align-items:center;
    justify-content:center; color:#fff; font-weight:800;
    font-family:'Segoe UI',system-ui,sans-serif; border:10px solid rgba(255,255,255,.9);
    box-shadow:0 28px 40px -14px rgba(90,60,0,.45); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

// ── shared device geometry (the thread iPad spans the seam) ──────────
const IPAD_W = 1420;
const IPAD_TOP = 470;
const IPAD_ROT = 3;
const SEAM_SHOW = 500;
const H1_LEFT = W - SEAM_SHOW;     // 1548
const H2_LEFT = H1_LEFT - W;       // -500

// ── Image 1 — WHITE opener. The feed iPad is the hero; the thread iPad
//    bleeds off the RIGHT edge to continue onto image 2.
const hero1 = SHELL(`
  <div class="disc" style="left:-140px; top:500px; width:1760px; height:1760px;"></div>

  <div class="head" style="top:180px; left:120px; right:760px; text-align:left; font-size:150px;">
    You're not<br><span class="hl">alone.</span></div>

  <div class="floor" style="left:170px; top:2040px; width:1040px; height:210px;"></div>

  <!-- thread iPad — the single seam-spanning device, bleeding off the RIGHT -->
  ${ipad(shot('thread.png'), IPAD_W, `left:${H1_LEFT}px; top:${IPAD_TOP}px; transform:rotate(${IPAD_ROT}deg); z-index:1;`)}
  <!-- feed iPad — the front/feature device of image 1 -->
  ${ipad(shot('feed.png'), 1160, 'left:100px; top:580px; transform:rotate(-3deg); z-index:2;')}

  <div class="sub" style="bottom:160px; left:120px; right:720px; text-align:left; font-size:54px; line-height:1.34;">
    An anonymous peer community for bipolar —<br>share, ask, support. No names, no judgement.</div>
`, 'bg-white', 'on-light');

// ── Image 2 — YELLOW feature. The SAME thread iPad continues in from the
//    LEFT edge; community avatars spill out from behind its right edge.
const hero2 = SHELL(`
  <div class="head" style="top:150px; left:80px; right:80px; text-align:center; font-size:138px;">
    Real people who get it</div>

  <div class="floor" style="left:-260px; top:2270px; width:980px; height:200px;"></div>

  <!-- community avatars spilling from BEHIND the iPad's right edge, rising.
       z below the iPad so the innermost peeks out from behind it. -->
  ${av('QO', 'linear-gradient(135deg,#ffb340,#e07800)', 346, 'left:1652px; top:492px;  transform:rotate(-7deg);')}
  ${av('SS', 'linear-gradient(135deg,#81c784,#2e7d32)', 328, 'left:1471px; top:821px;  transform:rotate(6deg);')}
  ${av('BB', 'linear-gradient(135deg,#64b5f6,#1565c0)', 310, 'left:1270px; top:1160px; transform:rotate(-4deg);')}
  ${av('JR', 'linear-gradient(135deg,#f48fb1,#c2185b)', 295, 'left:1057px; top:1497px; transform:rotate(5deg);')}
  ${av('NW', 'linear-gradient(135deg,#ce93d8,#7b1fa2)', 280, 'left:845px;  top:1835px; transform:rotate(-7deg);')}

  <!-- the SAME thread iPad continued, entering from the LEFT edge. z above avatars. -->
  ${ipad(shot('thread.png'), IPAD_W, `left:${H2_LEFT}px; top:${IPAD_TOP}px; transform:rotate(${IPAD_ROT}deg); z-index:2;`)}

  <div class="sub" style="bottom:170px; left:0; right:0; text-align:center; font-size:54px; line-height:1.34;">
    Post anonymously and get honest replies from<br>people living the same highs and lows.</div>
`, 'bg-yellow', 'on-yellow');

// ── Step 2: render the two hero canvases ──
mkdirSync('out/anonymous/ipad-hero', { recursive: true });
for (const [name, html] of [['01-hero', hero1], ['02-hero', hero2]]) {
  const built = `screens/_anon_ipad_hero_build.html`;
  writeFileSync(built, html);
  render(built, path.resolve(`out/anonymous/ipad-hero/${name}.png`), W, H);
  console.log(`anonymous/ipad-hero/${name}.png  ${W}x${H}`);
}

// dev-only: side-by-side stitch preview
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} body{display:flex}
  img{width:${W}px;height:${H}px;display:block}
</style></head><body>
  <img src="${pathToFileURL(path.resolve('out/anonymous/ipad-hero/01-hero.png')).href}">
  <img src="${pathToFileURL(path.resolve('out/anonymous/ipad-hero/02-hero.png')).href}">
</body></html>`;
writeFileSync('screens/_anon_ipad_hero_preview.html', preview);
render('screens/_anon_ipad_hero_preview.html', path.resolve('out/anonymous/ipad-hero/_stitch-preview.png'), W * 2, H);
console.log(`anonymous/ipad-hero/_stitch-preview.png  ${W * 2}x${H}`);
