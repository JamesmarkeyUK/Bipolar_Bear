// Build framed + captioned 13" iPad App Store screenshots (2048×2732).
//
// Style mirrors the iPhone set (store-assets/screens/*) — orange brand canvas,
// Nunito headline above, subtext below — but the device frame contains the
// GENUINE full-screen app screenshot (out/ipad-real-fixed/*.png, captured from
// the live app after the iPad full-screen fix), not a hand-rebuilt UI. That
// keeps it clearly "the app in use" while matching the marketing look.
//
// Run:  node build-ipad.mjs    → out/ipad-framed/*.png
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 2048, H = 2732;
const REAL = path.resolve('out/ipad-real-fixed');

// [ screenshot file, output name, headline (use \n for a line break), subtext ]
const screens = [
  ['01-home.png',          '01-home',      'Everything\nin one place', 'Your mood journal and personal survival kit — a tap away.'],
  ['02-journal-mood.png',  '02-journal',   'Track every mood',         'Capture how the day really felt — depressed to manic — in seconds.'],
  ['03-survival-kit.png',  '03-survivalkit','Your survival kit',        'Coping strategies, meds, goals and gratitude — personalised to you.'],
  ['04-survival-tools.png','04-tools',      'Ready for\nthe hard days', 'The tools that help you cope, all in one calm place.'],
  ['05-entries.png',       '05-history',    'Look back on\nevery day',  'Mood, sleep, energy and notes — your whole history in one place.'],
  ['06-pdf.png',           '06-pdf',        'Built for\nyour doctor',   'Turn months of tracking into a clean PDF to share with your clinician.'],
];

const tpl = (imgURL, headline, sub) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<link rel="stylesheet" href="../fonts.css">
<style>
  :root{ --orange:#ff9500; --orange-dark:#ff6b00; --orange-mid:#ff8833; --orange-light:#ffaa33; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:100%; height:100%; }
  body{ font-family:'Nunito','Segoe UI',system-ui,sans-serif; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
  .canvas{ position:relative; width:${W}px; height:${H}px; overflow:hidden;
    background:
      radial-gradient(120% 70% at 50% -8%, #ffc266 0%, rgba(255,194,102,0) 55%),
      linear-gradient(160deg, var(--orange-light) 0%, var(--orange-mid) 44%, var(--orange-dark) 100%); }

  /* soft depth: glow + faint rings behind the device */
  .bg{ position:absolute; inset:0; }
  .glow{ position:absolute; left:50%; top:1280px; width:1700px; height:1700px; transform:translate(-50%,-50%);
    background:radial-gradient(circle, rgba(255,255,255,.45) 0%, rgba(255,255,255,.10) 46%, rgba(255,255,255,0) 70%); }
  .ring{ position:absolute; left:50%; top:1280px; transform:translate(-50%,-50%); border:3px solid rgba(255,255,255,.10); border-radius:50%; }

  /* headline (above) */
  .headline{ position:absolute; left:0; right:0; top:118px; text-align:center; padding:0 130px;
    font-weight:900; font-size:128px; line-height:1.04; letter-spacing:-.015em; color:#fff;
    text-shadow:0 6px 28px rgba(140,55,0,.30); white-space:pre-line; }

  /* iPad device frame */
  .device{ position:absolute; left:50%; top:560px; transform:translateX(-50%);
    width:1352px; padding:34px; background:linear-gradient(160deg,#17171b,#0a0a0c); border-radius:66px;
    box-shadow:
      0 2px 0 2px rgba(255,255,255,.06) inset,
      0 70px 140px -34px rgba(40,16,0,.55),
      0 30px 60px -22px rgba(0,0,0,.45); }
  .device::before{ content:''; position:absolute; top:16px; left:50%; transform:translateX(-50%);
    width:13px; height:13px; border-radius:50%; background:#050506; box-shadow:0 0 0 4px rgba(255,255,255,.04); }
  .screen{ position:relative; width:100%; aspect-ratio:3/4; border-radius:34px; overflow:hidden; background:#f4a63f; }
  .screen img{ width:100%; height:100%; object-fit:cover; display:block; }

  /* subtext (below) */
  .sub{ position:absolute; left:0; right:0; bottom:150px; text-align:center; padding:0 200px;
    font-weight:700; font-size:50px; line-height:1.34; color:#fff8ef; }
</style></head>
<body>
  <div class="canvas">
    <div class="bg">
      <div class="glow"></div>
      <div class="ring" style="width:1180px;height:1180px;"></div>
      <div class="ring" style="width:1640px;height:1640px;"></div>
      <div class="ring" style="width:2080px;height:2080px;"></div>
    </div>
    <div class="headline">${headline}</div>
    <div class="device"><div class="screen"><img src="${imgURL}" alt=""></div></div>
    <div class="sub">${sub}</div>
  </div>
</body></html>`;

mkdirSync('out/ipad-framed', { recursive: true });
for (const [img, name, headline, sub] of screens) {
  const imgURL = pathToFileURL(path.join(REAL, img)).href;
  const html = tpl(imgURL, headline, sub);
  const built = 'screens/_ipad_build.html';
  writeFileSync(built, html);
  const out = path.resolve(`out/ipad-framed/${name}.png`);
  spawnSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=1', '--virtual-time-budget=8000',
    `--window-size=${W},${H}`, `--screenshot=${out}`,
    pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });
  console.log(`ipad-framed/${name}.png  ${W}x${H}`);
}
