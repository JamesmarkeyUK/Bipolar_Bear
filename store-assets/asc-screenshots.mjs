// Make ONE App Store screenshot set match a local folder, in filename order, through the
// App Store Connect API. No dependencies (Node 18+). Companion to asc-upload.mjs, which only
// manages the iPhone sets of the non-primary locales.
//
// DRY RUN by default: prints what would change. --apply acts.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=~/Bipolar_Keystores/AuthKey_….p8 \
//   node asc-screenshots.mjs --bundle com.bipolaranonymous.app --version 1.36 \
//     --locale en-GB --type APP_IPAD_PRO_3GEN_129 --dir out/anonymous/ipad [--apply]
//
// Same images already there, just in a different order → reorders them (no upload).
// Anything else → deletes the set's screenshots and uploads <dir>/*.png in filename order.
// The version must be editable (not waiting for / in review).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, sign } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : undefined; };
const APPLY = argv.includes('--apply');
const BUNDLE = arg('--bundle'), VERSION = arg('--version'), LOCALE = arg('--locale'), TYPE = arg('--type'), DIR = arg('--dir');
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!BUNDLE || !VERSION || !LOCALE || !TYPE || !DIR || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error('Needs --bundle --version --locale --type --dir (+ --apply) and ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH.');
  process.exit(1);
}
const KEY = readFileSync(ASC_KEY_PATH.replace(/^~/, os.homedir()), 'utf8');

const b64u = b => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  return `${h}.${p}.${b64u(sign('sha256', Buffer.from(`${h}.${p}`), { key: KEY, dsaEncoding: 'ieee-p1363' }))}`;
}
async function api(method, url, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${url}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}\n` +
    (json.errors || []).map(e => `  ${e.title}: ${e.detail}`).join('\n'));
  return json;
}
const rel = (type, id) => ({ data: { type, id } });
const md5 = buf => createHash('md5').update(buf).digest('hex');

const files = readdirSync(DIR).filter(f => f.endsWith('.png')).sort().map(f => path.join(DIR, f));
if (!files.length) throw new Error(`no .png files in ${DIR}`);
const sums = files.map(f => md5(readFileSync(f)));

const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
const ver = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data[0];
const state = ver.attributes.appVersionState || ver.attributes.appStoreState;
console.log(`${app.attributes.name} ${VERSION} (${state}) ${LOCALE} ${TYPE} — ${APPLY ? 'APPLYING' : 'DRY RUN'}`);
const loc = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data
  .find(l => l.attributes.locale === LOCALE);
if (!loc) throw new Error(`no ${LOCALE} localization on ${VERSION}`);
let set = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data
  .find(s => s.attributes.screenshotDisplayType === TYPE);
const current = set ? (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data : [];
console.log(`  now:  ${current.map(s => s.attributes.fileName).join(', ') || '(no set)'}`);
console.log(`  want: ${files.map(f => path.basename(f)).join(', ')}`);

const bySum = new Map(current.map(s => [s.attributes.sourceFileChecksum, s]));
const sameImages = current.length === sums.length && sums.every(s => bySum.has(s));
if (sameImages && current.every((s, i) => s.attributes.sourceFileChecksum === sums[i])) {
  console.log('  already in order — nothing to do'); process.exit(0);
}
if (sameImages) {
  console.log('  same images, wrong order → reorder');
  if (APPLY) await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,
    { data: sums.map(s => ({ type: 'appScreenshots', id: bySum.get(s).id })) });
} else {
  console.log(`  ${current.length ? `replace ${current.length} with` : 'upload'} ${files.length}`);
  if (APPLY) {
    if (!set) set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: TYPE }, relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', loc.id) } } })).data;
    for (const s of current) await api('DELETE', `/v1/appScreenshots/${s.id}`);
    const ids = [];
    for (const f of files) {
      const buf = readFileSync(f);
      const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots',
        attributes: { fileName: path.basename(f), fileSize: buf.length }, relationships: { appScreenshotSet: rel('appScreenshotSets', set.id) } } })).data;
      for (const op of shot.attributes.uploadOperations) {
        const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
        const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`upload ${path.basename(f)} → ${r.status}`);
      }
      await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: md5(buf) } } });
      ids.push(shot.id); process.stdout.write('.');
    }
    for (let t = 0; t < 60; t++) {
      const st = await Promise.all(ids.map(async id => (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state));
      if (st.includes('FAILED')) throw new Error('screenshot processing FAILED');
      if (st.every(s => s === 'COMPLETE')) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map(id => ({ type: 'appScreenshots', id })) });
    console.log(' uploaded');
  }
}
if (APPLY) {
  const after = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
  console.log(`  after: ${after.map(s => s.attributes.fileName).join(', ')}`);
}
