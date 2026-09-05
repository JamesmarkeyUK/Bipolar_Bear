// Build the search-result cards — the images Google shows beside a snippet.
//
//   ../images/search/bipolarbear-1x1.jpg    1200×1200
//   ../images/search/bipolarbear-4x3.jpg    1200×900
//   ../images/search/bipolarbear-16x9.jpg   1200×675
//   ../images/search/anonymous-1x1.jpg      (and the same three for the
//   ../images/search/anonymous-4x3.jpg       yellow Bipolar Anonymous brand)
//   ../images/search/anonymous-16x9.jpg
//
// Separate from build-og-cards.mjs on purpose. The Open Graph cards are 1.91:1
// and read at a few hundred pixels wide in a Slack or X unfurl; a search
// thumbnail is a ~92px square, and dropping a 1.91:1 card into it leaves the
// grey letterbox bars you see on mobile results. Google picks per surface from
// the aspect ratios offered in structured data (see the JSON-LD `image` array
// on welcome.html / welcome-anonymous.html), so all three are built from one
// composition and every element is sized to survive the shrink: icon first,
// wordmark second, a single short line of copy last.
//
// JPEG rather than PNG: the cards are a gradient behind one mark, where q92 is
// visually identical (mean channel error ~1/255) at an eighth of the weight —
// 126KB against 800KB — and the whole point of the exercise is an image a
// crawler will happily fetch and re-serve.
//
// Output is committed so Cloudflare Pages serves it statically — crawlers
// can't run this.
//
//     cd store-assets && node build-search-cards.mjs
//
// Chrome is found at the usual macOS/Windows paths, or set CHROME=/path/to/chrome.
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/usr/bin/google-chrome');
const PORT = 9334;

const REPO = path.resolve('..');
const OUT  = path.join(REPO, 'images/search');
const url  = p => pathToFileURL(path.resolve(p)).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Captured over the DevTools protocol rather than with `--screenshot`, because
// the canvas has to be exactly 1200×1200: `--window-size` measures the window,
// and some Chrome builds hand back a viewport tens of pixels shorter, which
// shows up as a white strip along the bottom of the card.
// Emulation.setDeviceMetricsOverride has no such ambiguity.
// Same minimal CDP client as capture-cdp.mjs.
async function browserWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Chrome CDP endpoint never came up');
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

// Three shapes, one composition. The wide ones get a smaller icon and slightly
// tighter type — the square is the one that has to carry a 92px thumbnail, so
// it gives the icon the most room.
const RATIOS = [
  { name: '1x1',  w: 1200, h: 1200, icon: 600, gap: 46, name_: 104, tag: 46, pad: 72 },
  { name: '4x3',  w: 1200, h: 900,  icon: 440, gap: 40, name_: 92,  tag: 42, pad: 68 },
  { name: '16x9', w: 1200, h: 675,  icon: 330, gap: 34, name_: 80,  tag: 38, pad: 60 },
];

const CARD = (brand, r) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<link rel="stylesheet" href="${url('fonts.css')}">
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:100%; height:100%; }
  /* Fixed to the viewport rather than sized in px: the canvas is whatever
     --window-size says, and a fixed-size box can leave a bare strip if the
     headless viewport is a pixel or two off. */
  .card{
    position:fixed; inset:0; overflow:hidden;
    background:${brand.gradient};
    font-family:'Nunito','Segoe UI',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:${r.pad}px; text-align:center;
  }
  /* Faint ring haloing the icon — the only decoration, because anything
     finer than this turns to mush at thumbnail size. Sized to sit clear of
     the wordmark rather than threading through it. */
  .ring{
    position:absolute; left:50%; top:${Math.round(r.icon / 2 + r.pad * 0.55)}px;
    transform:translate(-50%,-50%);
    width:${Math.round(r.icon * 1.34)}px; height:${Math.round(r.icon * 1.34)}px;
    border-radius:50%; border:${Math.max(2, Math.round(r.w / 400))}px solid rgba(255,255,255,${brand.ringAlpha});
  }
  .icon{
    width:${r.icon}px; height:${r.icon}px; display:block; object-fit:contain;
    filter:drop-shadow(0 ${Math.round(r.icon * 0.045)}px ${Math.round(r.icon * 0.09)}px rgba(${brand.shadow},.28));
    position:relative; z-index:2;
  }
  .name{
    position:relative; z-index:2; margin-top:${r.gap}px;
    font-weight:900; font-size:${r.name_}px; letter-spacing:-.025em; line-height:1.05;
    color:${brand.ink};
  }
  .tag{
    position:relative; z-index:2; margin-top:${Math.round(r.gap * 0.34)}px;
    font-weight:800; font-size:${r.tag}px; line-height:1.3;
    color:${brand.inkSoft};
  }
</style></head>
<body>
  <div class="card">
    <div class="ring"></div>
    <img class="icon" src="${brand.icon}" alt="">
    <div class="name">${brand.name}</div>
    <div class="tag">${brand.tag}</div>
  </div>
</body></html>`;

// Gradients and icons match build-og-cards.mjs, so a search thumbnail and a
// social unfurl of the same page look like the same brand.
const BRANDS = [
  {
    file: 'bipolarbear',
    gradient: `radial-gradient(120% 90% at 40% -20%, #ffc266 0%, rgba(255,194,102,0) 60%),
      linear-gradient(160deg, #ffaa33 0%, #ff8833 42%, #ff6b00 100%)`,
    // The transparent mark, not the white App Store tile: at 92px the mark
    // wants every pixel, and a white square inside a coloured square just
    // shrinks it.
    icon: url(path.join(REPO, 'icons/favicons/android-chrome-512x512.png')),
    name: 'Bipolar Bear',
    tag: 'A private mood journal',
    // White on orange; the darker end of the gradient keeps it legible.
    ink: '#ffffff', inkSoft: 'rgba(255,255,255,.92)',
    ringAlpha: '.16', shadow: '140,55,0',
  },
  {
    file: 'anonymous',
    gradient: `radial-gradient(120% 90% at 40% -20%, #ffe680 0%, rgba(255,230,128,0) 60%),
      linear-gradient(160deg, #ffd84d 0%, #f5c800 50%, #e0b400 100%)`,
    icon: url(path.join(REPO, 'icons/Bipolar_Anonymous_Trans.png')),
    name: 'Bipolar Anonymous',
    tag: 'Anonymous peer support',
    // Yellow is too light to carry white text — the board uses dark ink on it.
    ink: '#26201a', inkSoft: 'rgba(38,32,26,.72)',
    ringAlpha: '.34', shadow: '150,110,0',
  },
];

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME} — set CHROME=/path/to/chrome`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
mkdirSync('screens', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
  '--no-first-run', '--disable-extensions', '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

try {
  const ws = new WebSocket(await browserWsUrl());
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = makeClient(ws);

  for (const brand of BRANDS) {
    for (const r of RATIOS) {
      const built = `screens/_search-${brand.file}-${r.name}.built.html`;
      writeFileSync(built, CARD(brand, r));

      const { targetId }  = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      await send('Emulation.setDeviceMetricsOverride',
        { width: r.w, height: r.h, deviceScaleFactor: 1, mobile: false }, sessionId);
      await send('Page.navigate', { url: url(built) }, sessionId);
      await sleep(1200);   // webfont + icon decode

      const shot = await send('Page.captureScreenshot',
        { format: 'jpeg', quality: 92, captureBeyondViewport: false }, sessionId);
      writeFileSync(path.join(OUT, `${brand.file}-${r.name}.jpg`), Buffer.from(shot.data, 'base64'));
      await send('Target.closeTarget', { targetId });
      rmSync(built, { force: true });
      console.log(`images/search/${brand.file}-${r.name}.jpg  ${r.w}x${r.h}`);
    }
  }
  ws.close();
} finally {
  chrome.kill();
}
