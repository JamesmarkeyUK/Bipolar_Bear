// Render the steps screen to iPhone (1290×2796) + Android 2× (2160×3840).
// Mirrors build-all.mjs but scoped to the single new screen -> out/steps/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

mkdirSync('out/steps', { recursive: true });
const targets = [
  ['iphone',    1290, 2796, ''],
  ['android2x', 2160, 3840, 'android'],
];

for (const [name, W, H, cls] of targets) {
  const fit = Math.min(W / 1290, H / 2796);
  let html = readFileSync('screens/screen-steps.html', 'utf8')
    .replace('</head>', `<style>.canvas{--fit:${fit}}</style></head>`);
  if (cls) html = html.replace('class="canvas ', `class="canvas ${cls} `);
  const built = 'screens/_build_steps.html';
  writeFileSync(built, html);
  const out = path.resolve(`out/steps/${name}.png`);
  spawnSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=1', '--virtual-time-budget=8000',
    `--window-size=${W},${H}`, `--screenshot=${out}`,
    pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });
  console.log(`out/steps/${name}.png  ${W}x${H}  fit=${fit.toFixed(3)}`);
}
