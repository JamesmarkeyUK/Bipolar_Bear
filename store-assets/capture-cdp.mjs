// Capture real-app iPad store screenshots via the Chrome DevTools Protocol.
// Unlike `--screenshot` one-shots, this waits for real network (Firebase auth)
// to settle, strips web-only chrome (PWA install banner, first-run coaches),
// then captures at deviceScaleFactor 2 → exact 2048×2732 PNG for the 13" iPad.
//
// Usage: node capture-cdp.mjs   (config table below drives the whole set)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:8765';
const SEED = `${BASE}/store-assets/_ipadseed.html?to=`;
const W = 1024, H = 1366, DSF = 2;

// page file, output name, JS predicate that returns true once content is ready
const PAGES = [
  ['index.html',        '01-home',        `document.body.innerText.includes('Mood Journal')`],
  ['journal.html',      '02-journal',     `document.body.innerText.includes('How was')`],
  ['survival-kit.html', '03-survivalkit', `document.body.innerText.includes('Survival Kit')`],
  ['anonymous.html',    '04-anonymous',   `!!document.querySelector('input[type=email]') || document.body.innerText.includes('Verify your email')`],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// Minimal CDP client over a single WebSocket (flatten/sessionId mode).
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

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--no-first-run', '--disable-extensions', `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    const wsUrl = await browserWsUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = makeClient(ws);

    for (const [file, name, ready] of PAGES) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

      await send('Page.enable', {}, sessionId);
      await send('Runtime.enable', {}, sessionId);
      await send('Emulation.setDeviceMetricsOverride',
        { width: W, height: H, deviceScaleFactor: DSF, mobile: false }, sessionId);

      await send('Page.navigate', { url: SEED + file }, sessionId);

      // Poll the readiness predicate (covers the seed redirect + Firebase settle).
      let ok = false;
      for (let i = 0; i < 60; i++) {
        await sleep(300);
        try {
          const r = await send('Runtime.evaluate',
            { expression: `(()=>{try{return !!(${ready})}catch(e){return false}})()`, returnByValue: true }, sessionId);
          if (r.result && r.result.value) { ok = true; break; }
        } catch (_) {}
      }
      // Strip web-only chrome + any leftover first-run overlays.
      await send('Runtime.evaluate', { expression: `
        ['pwa-install-banner','bbWelcomeModal','skWelcomeModal'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});
        document.querySelectorAll('[id*="install-banner"]').forEach(e=>e.remove());
      `, returnByValue: true }, sessionId).catch(()=>{});
      await sleep(500); // settle fonts/layout after DOM edits

      const shot = await send('Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false }, sessionId);
      const out = path.resolve(`out/ipad-real/${name}.png`);
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log(`${name}.png  ready=${ok}`);

      await send('Target.closeTarget', { targetId });
    }
    ws.close();
  } finally {
    chrome.kill();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
