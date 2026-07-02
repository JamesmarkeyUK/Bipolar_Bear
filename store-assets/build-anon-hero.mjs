// Build editorial App Store hero images for BIPOLAR ANONYMOUS (iPhone 6.9" =
// 1290×2796) — the yellow-community sibling of build-hero.mjs.
//
//   • image 1: clean WHITE canvas (dark headline) — bright opener
//   • image 2: the brand YELLOW gradient (shared.css .bg-yellow), dark
//     headline — leads straight into the existing yellow feature screens
//   • ONE board phone (the comment thread) bleeds off image 1's RIGHT edge
//     and re-enters from image 2's LEFT edge, so it flows across the seam.
//   • Instead of the main app's mood faces, image 2 spills a cascade of
//     anonymous community avatars from behind the phone — the "you're one of
//     many voices" motif from the existing anon hero.
//
// Board phone screens are mockups (screens/_board-*.html), rendered here to
// out/anonymous/hero-src/*.png — no real user posts.
//
// Run:  node build-anon-hero.mjs
//   → out/anonymous/hero/*.png  (+ out/anonymous/hero/_stitch-preview.png)
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 1290, H = 2796;
const SRC = path.resolve('out/anonymous/hero-src');
const shot = f => pathToFileURL(path.join(SRC, f)).href;

const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${out}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });

// ── Step 1: render the bare board screens to frame inside the phones ──
mkdirSync(SRC, { recursive: true });
for (const [src, name] of [['_board-feed.html', 'feed'], ['_board-thread.html', 'thread']]) {
  render(`screens/${src}`, path.join(SRC, `${name}.png`), W, H);
  console.log(`hero-src/${name}.png  ${W}x${H}`);
}

// A dark iPhone frame wrapping a board screenshot. Frame mirrors shared.css .device.
const phone = (img, w, extra) => `
  <div class="phone" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
    <div class="isl"></div>
  </div>`;

// A floating anonymous community avatar (initials in a coloured disc).
// `size` is the circle diameter; the initials scale to ~42% of it so two
// letters fill the disc the way they do in the real app.
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

  /* backgrounds — image 1 white, image 2 brand yellow (shared.css .bg-yellow) */
  .bg-white{ background:#ffffff; }
  .bg-yellow{ background:
    radial-gradient(120% 80% at 50% -10%, #ffe680 0%, rgba(255,230,128,0) 55%),
    linear-gradient(160deg, #ffd84d 0%, #f5c800 50%, #e0b400 100%); }

  /* soft warm spotlight behind the devices on the white opener */
  .disc{ position:absolute; border-radius:50%;
    background:radial-gradient(closest-side, #fff6d6 0%, rgba(255,246,214,0) 72%); }

  /* contact-shadow under a device */
  .floor{ position:absolute; border-radius:50%; }
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,90,20,.16), rgba(120,90,20,0)); }
  .on-yellow .floor{ background:radial-gradient(closest-side, rgba(90,60,0,.28), rgba(90,60,0,0)); }

  /* rounded brand headline (Nunito 900) */
  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-yellow .head{ color:#3d2c00; }
  .head .hl{ color:#e0a800; }
  .on-yellow .head .hl{ color:#7a5a00; }

  /* support copy (Nunito 800) */
  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-yellow .sub{ color:#5c4500; }

  /* iPhone frame — matches shared.css .device */
  .phone{ position:absolute; padding:18px; border-radius:74px; background:#0b0b0d;
    box-shadow:
      0 2px 0 2px rgba(255,255,255,.08) inset,
      0 60px 120px -30px rgba(60,40,0,.55),
      0 24px 50px -20px rgba(0,0,0,.45); }
  .phone .scr{ position:relative; width:100%; border-radius:58px; overflow:hidden;
    background:#FFFBF5; line-height:0; }
  .phone .scr img{ width:100%; display:block; }
  .phone .isl{ position:absolute; top:20px; left:50%; transform:translateX(-50%);
    width:118px; height:34px; border-radius:20px; background:#08080a; z-index:5; }

  /* floating community avatars (fill the space beside the phone on image 2) */
  .cav{ position:absolute; }
  .disc2{ width:100%; height:100%; border-radius:50%; display:flex; align-items:center;
    justify-content:center; color:#fff; font-weight:800;
    font-family:'Segoe UI',system-ui,sans-serif; border:8px solid rgba(255,255,255,.9);
    box-shadow:0 22px 34px -12px rgba(90,60,0,.45); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

// ── shared device geometry (the thread phone spans the seam) ──────────
const BOARD_W = 740;       // thread phone width — identical on both halves
const BOARD_TOP = 712;     // vertical band — identical on both
const BOARD_ROT = 6;       // tilt (deg) — identical on both
const SEAM_SHOW = 250;     // px of the thread phone shown on image 1's right edge
const H1_LEFT = W - SEAM_SHOW;    // 1040 — most bleeds off the right
const H2_LEFT = H1_LEFT - W;      // -250 — same device, past the seam

// ── Image 1 — WHITE opener. Feed phone is the feature; the thread phone
//    bleeds off the RIGHT edge to continue onto image 2.
const hero1 = SHELL(`
  <div class="disc" style="left:-200px; top:740px; width:1960px; height:1960px;"></div>

  <div class="head" style="top:300px; left:96px; right:96px; text-align:left; font-size:130px;">
    You're not<br><span class="hl">alone.</span></div>

  <div class="floor" style="left:120px; top:2330px; width:760px; height:150px;"></div>
  <div class="floor" style="left:980px; top:2120px; width:560px; height:150px;"></div>

  <!-- comment thread — the single seam-spanning device, bleeding off the RIGHT -->
  ${phone(shot('thread.png'), BOARD_W, `left:${H1_LEFT}px; top:${BOARD_TOP}px; transform:rotate(${BOARD_ROT}deg); z-index:1;`)}
  <!-- feed — the front/feature device of image 1 -->
  ${phone(shot('feed.png'), 700, 'left:150px; top:900px; transform:rotate(-7deg); z-index:2;')}

  <div class="sub" style="bottom:156px; left:120px; right:120px; text-align:center; font-size:39px; line-height:1.34;">
    An anonymous peer community for bipolar —<br>share, ask, and support. No names, no judgement.</div>
`, 'bg-white', 'on-light');

// ── Image 2 — YELLOW feature (brand gradient). The SAME thread phone
//    re-enters from the LEFT edge; anonymous community avatars spill out
//    from behind its right edge. Leads into the existing yellow screens.
const hero2 = SHELL(`
  <div class="head" style="top:300px; left:80px; right:80px; text-align:center; font-size:120px;">
    Real people<br>who get it</div>

  <div class="sub" style="bottom:150px; left:130px; right:130px; text-align:center; font-size:40px; line-height:1.32;">
    Post anonymously and get honest replies from<br>people living the same highs and lows.</div>

  <div class="floor" style="left:-220px; top:2230px; width:760px; height:150px;"></div>

  <!-- community voices spilling from BEHIND the phone's right edge, rising.
       z below the phone so the innermost peeks out from behind it. -->
  ${av('QO', 'linear-gradient(135deg,#ffb340,#e07800)', 236, 'left:957px; top:617px;  transform:rotate(-8deg);')}
  ${av('SS', 'linear-gradient(135deg,#81c784,#2e7d32)', 222, 'left:838px; top:900px;  transform:rotate(6deg);')}
  ${av('BB', 'linear-gradient(135deg,#64b5f6,#1565c0)', 210, 'left:712px; top:1178px; transform:rotate(-4deg);')}
  ${av('JR', 'linear-gradient(135deg,#f48fb1,#c2185b)', 200, 'left:586px; top:1452px; transform:rotate(5deg);')}
  ${av('NW', 'linear-gradient(135deg,#ce93d8,#7b1fa2)', 190, 'left:452px; top:1724px; transform:rotate(-7deg);')}

  <!-- the SAME thread phone continued: image 1 showed its left slice, this
       reveals the rest as it enters from the LEFT edge. z:2 above the avatars. -->
  ${phone(shot('thread.png'), BOARD_W, `left:${H2_LEFT}px; top:${BOARD_TOP}px; transform:rotate(${BOARD_ROT}deg); z-index:2;`)}
`, 'bg-yellow', 'on-yellow');

// ── Step 2: render the two hero canvases ──
mkdirSync('out/anonymous/hero', { recursive: true });
for (const [name, html] of [['01-hero', hero1], ['02-hero', hero2]]) {
  const built = `screens/_anon_hero_build.html`;
  writeFileSync(built, html);
  render(built, path.resolve(`out/anonymous/hero/${name}.png`), W, H);
  console.log(`anonymous/hero/${name}.png  ${W}x${H}`);
}

// dev-only: side-by-side stitch preview to verify the seam lines up
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} body{display:flex}
  img{width:${W}px;height:${H}px;display:block}
</style></head><body>
  <img src="${pathToFileURL(path.resolve('out/anonymous/hero/01-hero.png')).href}">
  <img src="${pathToFileURL(path.resolve('out/anonymous/hero/02-hero.png')).href}">
</body></html>`;
writeFileSync('screens/_anon_hero_preview.html', preview);
render('screens/_anon_hero_preview.html', path.resolve('out/anonymous/hero/_stitch-preview.png'), W * 2, H);
console.log(`anonymous/hero/_stitch-preview.png  ${W * 2}x${H}`);
