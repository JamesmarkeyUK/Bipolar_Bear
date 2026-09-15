// Capture real-app store screenshots in every supported UI language.
//
// Drives the live app headless via the Chrome DevTools Protocol, seeding demo
// content + a chosen language through _ipadseed.html (?lang=), and shoots each
// screen at an exact iPhone 6.9" frame (430×932 @ DSF 3 → 1290×2796 PNG).
// Because the seed injects demo data into localStorage, no Firebase login is
// needed — the app opens straight onto a populated, localised screen.
//
// Prereqs:  a local dev server on :8765  (python3 -m http.server 8765 from repo root)
// Usage:    node capture-localized.mjs                 # all locales below
//           LANGS=en,fr,de node capture-localized.mjs  # a subset
//           CHROME=/path/to/chrome node capture-localized.mjs
// Output:   out/localized/<lang>/{01-home,02-journal,03-survival}.png
//
// Chrome is auto-detected across macOS / Windows / Linux (incl. the sandbox's
// pre-installed Playwright Chromium); override with the CHROME env var.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cands = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  // Playwright's bundled Chromium (used by the cloud sandbox).
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(pw)) {
      if (d.startsWith('chromium-')) {
        const p = path.join(pw, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) cands.unshift(p);
      }
    }
  } catch (_) {}
  for (const c of cands) { try { if (existsSync(c)) return c; } catch (_) {} }
  throw new Error('No Chrome/Chromium found — set the CHROME env var');
}

const CHROME = findChrome();
const PORT = Number(process.env.CDP_PORT || 9337);
const BASE = process.env.BASE || 'http://localhost:8765';
const LANGS = (process.env.LANGS || 'en,es,fr,de,it,pt,nl,pl,sv,zh').split(',').map(s => s.trim());
const W = 430, H = 932, DSF = 3;

// [page file, output name, JS predicate that is true once content is on screen]
const PAGES = [
  ['index.html',        '01-home',     `document.body.innerText.length > 200`],
  ['journal.html',      '02-journal',  `document.body.innerText.length > 200`],
  ['survival-kit.html', '03-survival', `document.body.innerText.length > 200`],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function browserWsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json/version`); const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(200);
  }
  throw new Error('Chrome CDP endpoint never came up');
}
function makeClient(ws) {
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result); } });
  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); });
}

async function captureLang(send, lang) {
  const out = path.resolve(`out/localized/${lang}`);
  mkdirSync(out, { recursive: true });
  const seed = `${BASE}/store-assets/_ipadseed.html?lang=${lang}&to=`;
  for (const [file, name, ready] of PAGES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: true }, sessionId);
    await send('Page.navigate', { url: seed + file }, sessionId);
    let ok = false;
    for (let i = 0; i < 60; i++) { await sleep(300);
      try { const r = await send('Runtime.evaluate',
        { expression: `(()=>{try{return !!(${ready})}catch(e){return false}})()`, returnByValue: true }, sessionId);
        if (r.result && r.result.value) { ok = true; break; } } catch (_) {}
    }
    // Strip web-only chrome, first-run overlays, coach hints.
    await send('Runtime.evaluate', { expression: `
      ['pwa-install-banner','bbWelcomeModal','skWelcomeModal','journalTutorialProgress','journalStartHint',
       'survivalKitHint','signinHint','logoHint','bbHintOverlay','bbHomeVersion']
        .forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});
      document.querySelectorAll('[id*="install-banner"]').forEach(e=>e.remove());`, returnByValue: true }, sessionId).catch(()=>{});
    await sleep(name === '01-home' ? 3800 : 900);
    // Drop any leftover fixed confetti/toast overlays.
    await send('Runtime.evaluate', { expression: `
      document.querySelectorAll('body > div').forEach(el=>{ const s = el.getAttribute('style')||'';
        if (/position:\\s*fixed/.test(s) && /z-index:\\s*(9998|9999)/.test(s)) el.remove(); });`, returnByValue: true }, sessionId).catch(()=>{});
    await sleep(200);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`${lang}/${name}.png  ready=${ok}`);
    await send('Target.closeTarget', { targetId });
  }
}

async function main() {
  const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox',
    '--no-first-run','--disable-extensions',`--remote-debugging-port=${PORT}`,`--window-size=${W},${H}`,'about:blank'],
    { stdio: 'ignore' });
  try {
    const ws = new WebSocket(await browserWsUrl());
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = makeClient(ws);
    for (const lang of LANGS) await captureLang(send, lang);
    ws.close();
  } finally { chrome.kill(); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
