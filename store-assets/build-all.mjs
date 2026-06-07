// Build the full store screenshot set for both platforms.
//  - iPhone 6.9"  1290×2796  (fit=1, design renders 1:1)
//  - Android      1080×1920  (rendered at 2× = 2160×3840 then downscaled, for clean
//                 anti-aliasing of the wave glow etc.; uses the .android class so the
//                 below-the-phone decks are enlarged to stay legible)
// Output is ordered (Anonymous=#3, Patterns=#4). Downscale + RGB-flatten happen in
// the Python post-step (build-post.py).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const REPO = pathToFileURL(path.resolve('..')).href + '/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const screens = [
  ['screen1-hero.html',        '01-hero'],
  ['screen2-sleep.html',       '02-sleep'],
  ['screen4-anonymous.html',   '03-anonymous'],   // swapped → #3
  ['screen3-patterns.html',    '04-patterns'],     // swapped → #4
  ['screen5-survivalkit.html', '05-survivalkit'],
  ['screen6-pin.html',         '06-pin'],
];
// dir, render W, H, extra canvas class
const targets = [
  ['iphone',   1290, 2796, ''],
  ['android2x', 2160, 3840, 'android'],   // 2× supersample → build-post downsizes to 1080×1920
];

for (const [dir, W, H, cls] of targets) {
  mkdirSync(`out/${dir}`, { recursive: true });
  const fit = Math.min(W / 1290, H / 2796);
  for (const [src, name] of screens) {
    let html = readFileSync(`screens/${src}`, 'utf8')
      .replaceAll('REPO/', REPO)
      .replace('</head>', `<style>.canvas{--fit:${fit}}</style></head>`);
    if (cls) html = html.replace('class="canvas ', `class="canvas ${cls} `);
    const built = 'screens/_build.html';
    writeFileSync(built, html);
    const out = path.resolve(`out/${dir}/${name}.png`);
    spawnSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--force-device-scale-factor=1', '--virtual-time-budget=8000',
      `--window-size=${W},${H}`, `--screenshot=${out}`,
      pathToFileURL(path.resolve(built)).href], { stdio: 'ignore' });
    console.log(`${dir}/${name}.png  ${W}x${H}  fit=${fit.toFixed(3)}`);
  }
}
