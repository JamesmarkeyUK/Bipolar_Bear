// Push localised App Store listing text + iPhone screenshots to App Store Connect
// through the App Store Connect API. No fastlane, no dependencies (Node 18+).
//
// DRY RUN by default: prints what would change. Add --apply to write.
//
//   ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
//   ASC_KEY_PATH=~/Bipolar_Keystores/AuthKey_XXXXXXXXXX.p8 \
//   node asc-upload.mjs --bundle com.app.bipolarbear --version 1.35 \
//     --listing screens-i18n/listing_bipolarbear.json --shots out/localized-frames \
//     [--only de,fr] [--apply]
//
// For every language in the listing JSON (keys: es fr de it pt nl pl sv zh, plus
// optional "en" = the app's primary locale) it creates or updates:
//   • App Information localisation — name, subtitle, privacy policy URL
//   • the version's localisation   — description, keywords, promotional text,
//                                    What's New, support + marketing URLs
//   • the iPhone screenshot set    — replaced by <shots>/<lang>/*.png (filename
//                                    order); skipped when the checksums already match
// Only fields present in the JSON are written. New locales copy name + URLs from
// the primary locale. The primary locale's screenshots are never touched.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash, sign } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : undefined; };
const APPLY = argv.includes('--apply');
const BUNDLE = arg('--bundle'), VERSION = arg('--version'), LISTING = arg('--listing'), SHOTS = arg('--shots');
const ONLY = arg('--only')?.split(',');
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!BUNDLE || !VERSION || !LISTING || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error('Needs --bundle --version --listing (+ optional --shots --only --apply) and ' +
    'ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH in the environment. See the header of this file.');
  process.exit(1);
}
const KEY = readFileSync(ASC_KEY_PATH.replace(/^~/, os.homedir()), 'utf8');

// listing JSON key -> App Store Connect locale ("en" resolves to the app's primary locale)
const LOCALES = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it', pt: 'pt-PT',
  nl: 'nl-NL', pl: 'pl', sv: 'sv', zh: 'zh-Hans' };
// App Store Connect limits (keywords are counted in UTF-8 bytes, the rest in characters)
const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, description: 4000, whatsNew: 4000 };
const KEYWORD_BYTES = 100;
const INFO_FIELDS = ['name', 'subtitle'];
const VER_FIELDS = ['description', 'keywords', 'promotionalText', 'whatsNew'];
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];

// ── API plumbing ──────────────────────────────────────────────────────────
const b64u = b => Buffer.from(b).toString('base64url');
let tok = null, tokExp = 0;
function token() {
  const now = Math.floor(Date.now() / 1000);
  if (tok && now < tokExp - 60) return tok;
  tokExp = now + 1080;                                   // Apple caps tokens at 20 min
  const h = b64u(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: tokExp, aud: 'appstoreconnect-v1' }));
  const s = sign('sha256', Buffer.from(`${h}.${p}`), { key: KEY, dsaEncoding: 'ieee-p1363' });
  return (tok = `${h}.${p}.${b64u(s)}`);
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
const short = v => (v == null ? '∅' : JSON.stringify(String(v).length > 50 ? String(v).slice(0, 47) + '…' : v));

// ── validation (before touching anything) ────────────────────────────────
const listing = JSON.parse(readFileSync(LISTING, 'utf8'));
const langs = Object.keys(listing).filter(l => (l === 'en' || LOCALES[l]) && (!ONLY || ONLY.includes(l)));
const problems = [];
for (const l of langs) for (const [f, v] of Object.entries(listing[l])) {
  if (f === 'keywords') { const b = Buffer.byteLength(v); if (b > KEYWORD_BYTES) problems.push(`${l}.keywords ${b} bytes > ${KEYWORD_BYTES}`); }
  else if (LIMITS[f] && [...v].length > LIMITS[f]) problems.push(`${l}.${f} ${[...v].length} chars > ${LIMITS[f]}`);
}
if (problems.length) { console.error('Listing over App Store limits:\n  ' + problems.join('\n  ')); process.exit(1); }

// ── resolve app / version / app info ─────────────────────────────────────
const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
if (!app) throw new Error(`No app with bundle id ${BUNDLE} visible to this key`);
const primary = app.attributes.primaryLocale;
console.log(`${app.attributes.name} (${app.id}), primary locale ${primary} — ${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);

const versions = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
const vState = v => v.attributes.appVersionState || v.attributes.appStoreState;
let ver = versions.find(v => v.attributes.versionString === VERSION);
const refVer = ver || versions[0];
if (!ver) {
  console.log(`Version ${VERSION}: does not exist yet → ${APPLY ? 'creating' : 'would create'}`);
  if (APPLY) ver = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions',
    attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: rel('apps', app.id) } } })).data;
}
if (ver) {
  console.log(`Version ${VERSION}: ${vState(ver)}`);
  if (!EDITABLE.includes(vState(ver))) throw new Error(`Version ${VERSION} is ${vState(ver)} — not editable`);
}

const infos = (await api('GET', `/v1/apps/${app.id}/appInfos`)).data;
const iState = i => i.attributes.state || i.attributes.appStoreState;
const info = infos.find(i => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(iState(i)));
const refInfo = info || infos[0];
const listLocs = async url => (await api('GET', `${url}?limit=50`)).data;
const infoLocs = info ? await listLocs(`/v1/appInfos/${info.id}/appInfoLocalizations`) : [];
const verLocs = ver ? await listLocs(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`) : [];
const pInfo = (await listLocs(`/v1/appInfos/${refInfo.id}/appInfoLocalizations`)).find(l => l.attributes.locale === primary);
const pVerLocs = ver ? verLocs : await listLocs(`/v1/appStoreVersions/${refVer.id}/appStoreVersionLocalizations`);
const pVer = pVerLocs.find(l => l.attributes.locale === primary);
if (!info) console.log('App Information: no editable copy yet (appears once the new version exists)');

// screenshot display type: mirror the primary locale's iPhone set
const pSets = (await api('GET', `/v1/appStoreVersionLocalizations/${pVer.id}/appScreenshotSets?limit=50`)).data;
const iphoneTypes = pSets.map(s => s.attributes.screenshotDisplayType).filter(t => t.startsWith('APP_IPHONE'));
const DISPLAY = ['APP_IPHONE_69', 'APP_IPHONE_67'].find(t => iphoneTypes.includes(t)) || 'APP_IPHONE_67';
console.log(`Primary iPhone screenshot sets: ${iphoneTypes.join(', ') || 'none'} → using ${DISPLAY}\n`);

// ── per-locale sync ───────────────────────────────────────────────────────
async function syncLoc(label, existing, fields, create, type) {
  const want = Object.fromEntries(fields.filter(([, v]) => v !== undefined));
  if (!existing) {
    console.log(`  ${label}: create  ` + Object.entries(want).map(([k, v]) => `${k}=${short(v)}`).join('  '));
    return APPLY ? (await api('POST', `/v1/${type}`, create(want))).data : null;
  }
  const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => existing.attributes[k] !== v));
  if (!Object.keys(diff).length) { console.log(`  ${label}: up to date`); return existing; }
  console.log(`  ${label}: update  ` + Object.keys(diff).map(k => `${k} ${short(existing.attributes[k])} → ${short(diff[k])}`).join('  '));
  if (APPLY) await api('PATCH', `/v1/${type}/${existing.id}`, { data: { type, id: existing.id, attributes: diff } });
  return existing;
}

async function uploadShot(setId, file) {
  const buf = readFileSync(file), fileName = path.basename(file);
  const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots',
    attributes: { fileName, fileSize: buf.length }, relationships: { appScreenshotSet: rel('appScreenshotSets', setId) } } })).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload ${fileName} chunk @${op.offset} → ${res.status}`);
  }
  await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id,
    attributes: { uploaded: true, sourceFileChecksum: md5(buf) } } });
  return shot.id;
}
async function waitProcessed(ids) {
  for (let t = 0; t < 60; t++) {
    const states = await Promise.all(ids.map(async id =>
      (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state));
    if (states.includes('FAILED')) throw new Error(`screenshot processing FAILED: ${states.join(',')}`);
    if (states.every(s => s === 'COMPLETE')) return;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('screenshots still processing after 3 min — check App Store Connect');
}

async function syncShots(lang, verLoc) {
  const dir = SHOTS && path.join(SHOTS, lang);
  if (!dir || !existsSync(dir)) { console.log(`  screenshots: none in ${dir ?? '(no --shots)'} — skipped`); return; }
  const files = readdirSync(dir).filter(f => f.endsWith('.png')).sort().map(f => path.join(dir, f));
  const sums = files.map(f => md5(readFileSync(f)));
  let set = null, current = [];
  if (verLoc) {
    set = (await api('GET', `/v1/appStoreVersionLocalizations/${verLoc.id}/appScreenshotSets?limit=50`))
      .data.find(s => s.attributes.screenshotDisplayType === DISPLAY);
    if (set) current = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
  }
  if (current.length === sums.length && current.every((s, i) => s.attributes.sourceFileChecksum === sums[i])) {
    console.log(`  screenshots: ${files.length} already uploaded`); return;
  }
  console.log(`  screenshots: ${current.length ? `replace ${current.length} existing with` : 'upload'} ${files.length} (${DISPLAY})`);
  if (!APPLY) return;
  if (!set) set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets',
    attributes: { screenshotDisplayType: DISPLAY },
    relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', verLoc.id) } } })).data;
  for (const s of current) await api('DELETE', `/v1/appScreenshots/${s.id}`);
  const ids = [];
  for (const f of files) { ids.push(await uploadShot(set.id, f)); process.stdout.write('.'); }
  await waitProcessed(ids);
  await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,
    { data: ids.map(id => ({ type: 'appScreenshots', id })) });
  console.log(' done');
}

const failed = [];
for (const lang of langs) {
  const locale = lang === 'en' ? primary : LOCALES[lang];
  const L = listing[lang];
  console.log(`${lang} → ${locale}`);
  try {
    const isNew = lang !== 'en';
    // New locales copy name + URLs from the primary locale wherever they're still blank.
    const fill = (loc, f, v) => (isNew && !loc?.attributes[f] ? v || undefined : undefined);
    const infoLoc = infoLocs.find(l => l.attributes.locale === locale);
    if (info) await syncLoc('App Information', infoLoc, [
      ['name', L.name ?? fill(infoLoc, 'name', pInfo.attributes.name)],
      ['subtitle', L.subtitle],
      ['privacyPolicyUrl', fill(infoLoc, 'privacyPolicyUrl', pInfo.attributes.privacyPolicyUrl)],
    ], a => ({ data: { type: 'appInfoLocalizations', attributes: { locale, ...a },
      relationships: { appInfo: rel('appInfos', info.id) } } }), 'appInfoLocalizations');

    let verLoc = verLocs.find(l => l.attributes.locale === locale);
    // Creating an App Information localisation makes App Store Connect add an empty
    // version localisation for that locale too — re-read so we update, not re-create.
    if (!verLoc && ver && APPLY)
      verLoc = (await listLocs(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`))
        .find(l => l.attributes.locale === locale);
    if (ver || !APPLY) verLoc = await syncLoc(`Version ${VERSION}`, verLoc, [
      ...VER_FIELDS.map(f => [f, L[f]]),
      ['supportUrl', fill(verLoc, 'supportUrl', pVer.attributes.supportUrl)],
      ['marketingUrl', fill(verLoc, 'marketingUrl', pVer.attributes.marketingUrl)],
    ], a => ({ data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...a },
      relationships: { appStoreVersion: rel('appStoreVersions', ver.id) } } }), 'appStoreVersionLocalizations');

    if (isNew) await syncShots(lang, verLoc);
  } catch (e) {
    console.log(`  ✗ ${e.message}`); failed.push(lang);
  }
  console.log('');
}
console.log(failed.length ? `Finished with errors in: ${failed.join(', ')}` :
  APPLY ? 'All done.' : 'Dry run only — re-run with --apply to write these changes.');
process.exit(failed.length ? 1 : 0);
