// Build (resolve REPO/ tokens to absolute file URLs) + render a screen.
// Usage: node make.mjs <screens/file.html> <width> <height> <out/name.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , inFile, w, h, outFile] = process.argv;
const REPO = pathToFileURL(path.resolve('..')).href + '/'; // store-assets/.. = repo root
const src = readFileSync(inFile, 'utf8').replaceAll('REPO/', REPO);
const built = path.join(path.dirname(inFile), '_' + path.basename(inFile, '.html') + '.built.html');
writeFileSync(built, src);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
  '--force-device-scale-factor=1', '--virtual-time-budget=8000',
  `--window-size=${w},${h}`, `--screenshot=${path.resolve(outFile)}`,
  pathToFileURL(path.resolve(built)).href];
spawnSync(CHROME, args, { stdio: 'inherit' });
console.log(`OK  ${outFile}  ${w}x${h}`);
