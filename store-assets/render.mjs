// Render an HTML file to a PNG at exact pixel dimensions using headless Chrome.
// Usage: node render.mjs <input.html> <width> <height> <output.png>
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , inFile, w, h, outFile] = process.argv;
if (!inFile || !w || !h || !outFile) {
  console.error('Usage: node render.mjs <input.html> <width> <height> <output.png>');
  process.exit(1);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = pathToFileURL(path.resolve(inFile)).href;
const out = path.resolve(outFile);

const args = [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-sandbox',
  '--default-background-color=00000000', // allow transparency if used
  '--force-device-scale-factor=1',
  '--virtual-time-budget=8000',          // let fonts/images/layout settle
  `--window-size=${w},${h}`,
  `--screenshot=${out}`,
  url,
];

const r = spawnSync(CHROME, args, { stdio: 'inherit' });
console.log(`rendered ${out} (${w}x${h})`);
process.exit(r.status || 0);
