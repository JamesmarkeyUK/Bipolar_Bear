// Build the Bipolar Anonymous store screenshot set (separate listing from
// Bipolar Bear) for all three platforms:
//   - iPhone 6.9"  1290×2796  (fit=1, design renders 1:1)
//   - Android      1080×1920  (rendered at 2× then downscaled in build-post-anon.py)
//   - 13" iPad     2048×2732  (phone-aspect design centred; yellow bg fills the margins)
// Output → out/anonymous/{iphone,android2x,ipad}/. Downscale + RGB-flatten happen
// in the Python post-step (build-post-anon.py).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const REPO = pathToFileURL(path.resolve('..')).href + '/';
const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const screens = [
  ['screen-anon1-hero.html',       '01-hero'],
  ['screen-anon1-hero-light.html', '01b-hero-light'],
  ['screen-anon2-monika.html', '02-monika'],
  ['screen-anon3-ask-dark.html',   '03-ask'],
  ['screen-anon4-wiki-light.html', '04-wiki'],
  ['screen-anon5-report.html', '05-report'],
];
// dir, render W, H, extra canvas class
const targets = [
  ['iphone',   1290, 2796, ''],
  ['android2x', 2160, 3840, 'android'],   // 2× supersample → build-post-anon downsizes to 1080×1920
  ['ipad',     2048, 2732, ''],           // App Store 13" iPad
];

for (const [dir, W, H, cls] of targets) {
  mkdirSync(`out/anonymous/${dir}`, { recursive: true });
  const fit = Math.min(W / 1290, H / 2796);
  for (const [src, name] of screens) {
    let html = readFileSync(`screens/${src}`, 'utf8')
      .replaceAll('REPO/', REPO)
      .replace('</head>', `<style>.canvas{--fit:${fit}}</style></head>`);
    if (cls) html = html.replace('class="canvas ', `class="canvas ${cls} `);
    const built = 'screens/_build.html';
    writeFileSync(built, html);
    const out = path.resolve(`out/anonymous/${dir}/${name}.png`);
    spawnSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--force-device-scale-factor=1', '--virtual-time-budget=8000',
      `--window-size=${W},${H}`, `--screenshot=${out}`,
      pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });
    console.log(`anonymous/${dir}/${name}.png  ${W}x${H}  fit=${fit.toFixed(3)}`);
  }
}
