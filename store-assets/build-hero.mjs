// Build editorial App Store hero images (iPhone 6.9" = 1290×2796).
//
// Brand identity matches the existing orange store screens (screens/shared.css):
//   • Nunito 900 rounded headlines, Nunito 700/800 support copy
//   • image 1: clean WHITE canvas (dark headline) — a bright opener
//   • image 2: the original .bg-orange gradient (white headline) — blends
//     straight into the existing orange feature screens that follow it
//   • device frame matched to shared.css .device (74/58px radii, warm shadow)
//
// The two images are halves of ONE wide scene: the mood phone bleeds off
// image 1's RIGHT edge and continues in from image 2's LEFT edge (same size,
// tilt and vertical band) so the device flows across the seam when the two
// screenshots sit side by side in the App Store carousel.
//
// Screenshots come from out/iphone-real/* (captured via capture-iphone.mjs).
//
// Run:  node build-hero.mjs   → out/hero/*.png  (+ out/hero/_stitch-preview.png)
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 1290, H = 2796;
const REAL = path.resolve('out/iphone-real');
const shot = f => pathToFileURL(path.join(REAL, f)).href;
const face = f => pathToFileURL(path.resolve('../images/moods/' + f)).href;

// A dark iPhone frame wrapping a real screenshot. `extra` lets each hero
// position / rotate / scale it. Frame styling mirrors shared.css .device.
const phone = (img, w, extra) => `
  <div class="phone" style="width:${w}px;${extra}">
    <div class="scr"><img src="${img}" alt=""></div>
    <div class="isl"></div>
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

  /* backgrounds — image 1 white, image 2 the brand orange (shared.css) */
  .bg-white{ background:#ffffff; }
  .bg-orange{ background:
    radial-gradient(120% 80% at 50% -10%, #ffc266 0%, rgba(255,194,102,0) 55%),
    linear-gradient(160deg, #ffaa33 0%, #ff8833 42%, #ff6b00 100%); }

  /* soft warm spotlight behind the devices on the white opener */
  .disc{ position:absolute; border-radius:50%;
    background:radial-gradient(closest-side, #fff0db 0%, rgba(255,240,219,0) 72%); }

  /* contact-shadow under a device */
  .floor{ position:absolute; border-radius:50%; }
  .on-light .floor{ background:radial-gradient(closest-side, rgba(120,70,20,.16), rgba(120,70,20,0)); }
  .on-orange .floor{ background:radial-gradient(closest-side, rgba(80,35,0,.30), rgba(80,35,0,0)); }

  /* rounded brand headline (Nunito 900) — colour per tone */
  .head{ position:absolute; font-weight:900; letter-spacing:-.015em; line-height:1.04; }
  .on-light  .head{ color:#26201a; }
  .on-orange .head{ color:#ffffff; }

  /* support copy (Nunito 800) */
  .sub{ position:absolute; font-weight:800; letter-spacing:.005em; }
  .on-light  .sub{ color:#8a7d6b; }
  .on-orange .sub{ color:#fff6ea; }

  /* iPhone frame — matches shared.css .device */
  .phone{ position:absolute; padding:18px; border-radius:74px; background:#0b0b0d;
    box-shadow:
      0 2px 0 2px rgba(255,255,255,.08) inset,
      0 60px 120px -30px rgba(40,16,0,.55),
      0 24px 50px -20px rgba(0,0,0,.45); }
  .phone .scr{ position:relative; width:100%; border-radius:58px; overflow:hidden;
    background:#f4a63f; line-height:0; }
  .phone .scr img{ width:100%; display:block; }
  .phone .isl{ position:absolute; top:20px; left:50%; transform:translateX(-50%);
    width:118px; height:34px; border-radius:20px; background:#08080a; z-index:5; }

  /* floating mood faces (fill the space beside the phone on image 2) */
  .face{ position:absolute; }
  .face img{ width:100%; display:block;
    filter:drop-shadow(0 22px 30px rgba(110,45,0,.34)); }
</style></head>
<body><div class="canvas ${bg} ${tone}">${inner}</div></body></html>`;

// ── shared device geometry (the mood phone spans the seam) ───────────
const MOOD_W = 740;        // mood phone width — identical on both halves
const MOOD_TOP = 712;      // mood phone vertical band — identical on both
const MOOD_ROT = 6;        // mood phone tilt (deg) — identical on both
// ONE physical device split at the seam: SEAM_SHOW px land on image 1's
// right edge; the remaining (MOOD_W - SEAM_SHOW) px continue in from image
// 2's left edge. Both halves place the phone at the SAME position in the
// combined 2580px scene, so there is no duplicate — a single phone bridges
// the join (image 1 shows its left slice, image 2 reveals the rest).
const SEAM_SHOW = 250;
const H1_MOOD_LEFT = W - SEAM_SHOW;       // 1040 — most of it bleeds off the right
const H2_MOOD_LEFT = H1_MOOD_LEFT - W;    // -250 — same device, past the seam

// ── Image 1 — WHITE opener. Home phone is the feature; the mood phone
//    bleeds off the RIGHT edge to continue onto image 2.
const hero1 = SHELL(`
  <div class="disc" style="left:-200px; top:740px; width:1960px; height:1960px;"></div>

  <div class="head" style="top:300px; left:96px; right:96px; text-align:left; font-size:122px;">
    Every high.<br>Every low.</div>

  <div class="floor" style="left:120px; top:2330px; width:760px; height:150px;"></div>
  <div class="floor" style="left:980px; top:2120px; width:560px; height:150px;"></div>

  <!-- mood picker — the single seam-spanning device, bleeding off the RIGHT -->
  ${phone(shot('02-journal-mood.png'), MOOD_W, `left:${H1_MOOD_LEFT}px; top:${MOOD_TOP}px; transform:rotate(${MOOD_ROT}deg); z-index:1;`)}
  <!-- home — the front/feature device of image 1 -->
  ${phone(shot('01-home.png'), 700, 'left:150px; top:900px; transform:rotate(-7deg); z-index:2;')}

  <div class="sub" style="bottom:156px; left:120px; right:120px; text-align:center; font-size:39px; line-height:1.34;">
    A private, encrypted mood journal —<br>track the patterns, build your survival kit.</div>
`, 'bg-white', 'on-light');

// ── Image 2 — ORANGE feature (brand gradient). The SAME mood phone
//    re-enters from the LEFT edge (same size/tilt/band) and reveals the
//    full card; this image leads straight into the existing orange screens.
const hero2 = SHELL(`
  <!-- header dropped to match image 1's "Every high" line -->
  <div class="head" style="top:300px; left:80px; right:80px; text-align:center; font-size:112px;">
    Track every mood<br>in seconds</div>

  <!-- subtitle moved to the bottom -->
  <div class="sub" style="bottom:150px; left:140px; right:140px; text-align:center; font-size:40px; line-height:1.32;">
    From depressed to manic — capture how<br>the day really felt, in a couple of taps.</div>

  <div class="floor" style="left:-220px; top:2230px; width:760px; height:150px;"></div>

  <!-- all five moods spilling out from BEHIND the phone's right edge,
       rising depressed → manic (sizes grow outward). z below the phone so
       the innermost (depressed) peeks out from behind it. -->
  <div class="face" style="left:957px; top:617px;  width:246px; transform:rotate(-8deg);"><img src="${face('manic.png')}" alt=""></div>
  <div class="face" style="left:824px; top:879px;  width:232px; transform:rotate(6deg);"><img src="${face('elevated.png')}" alt=""></div>
  <div class="face" style="left:690px; top:1145px; width:220px; transform:rotate(-4deg);"><img src="${face('stable.png')}" alt=""></div>
  <div class="face" style="left:555px; top:1415px; width:210px; transform:rotate(5deg);"><img src="${face('low.png')}" alt=""></div>
  <div class="face" style="left:400px; top:1680px; width:200px; transform:rotate(-7deg);"><img src="${face('depressed.png')}" alt=""></div>

  <!-- the SAME mood phone continued: image 1 showed its left slice, this
       reveals the rest as it enters from the LEFT edge. z:2 sits above the
       faces so depressed appears to emerge from behind it. -->
  ${phone(shot('02-journal-mood.png'), MOOD_W, `left:${H2_MOOD_LEFT}px; top:${MOOD_TOP}px; transform:rotate(${MOOD_ROT}deg); z-index:2;`)}
`, 'bg-orange', 'on-orange');

mkdirSync('out/hero', { recursive: true });
const render = (built, out, w, h) => spawnSync(CHROME,
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
   '--force-device-scale-factor=1', '--virtual-time-budget=8000',
   `--window-size=${w},${h}`, `--screenshot=${out}`,
   pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });

const jobs = [['01-hero', hero1], ['02-hero', hero2]];
for (const [name, html] of jobs) {
  const built = `screens/_hero_build.html`;
  writeFileSync(built, html);
  render(built, path.resolve(`out/hero/${name}.png`), W, H);
  console.log(`hero/${name}.png  ${W}x${H}`);
}

// dev-only: side-by-side stitch preview to verify the seam lines up
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} body{display:flex}
  img{width:${W}px;height:${H}px;display:block}
</style></head><body>
  <img src="${pathToFileURL(path.resolve('out/hero/01-hero.png')).href}">
  <img src="${pathToFileURL(path.resolve('out/hero/02-hero.png')).href}">
</body></html>`;
writeFileSync('screens/_hero_preview.html', preview);
render('screens/_hero_preview.html', path.resolve('out/hero/_stitch-preview.png'), W * 2, H);
console.log(`hero/_stitch-preview.png  ${W * 2}x${H}`);
