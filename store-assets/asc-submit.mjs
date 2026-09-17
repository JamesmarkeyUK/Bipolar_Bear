// Attach a processed build to an App Store version and submit it for review, through
// the App Store Connect API. No dependencies (Node 18+). Companion to asc-upload.mjs.
//
// DRY RUN by default: prints the version's state and what would happen. --apply acts.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=~/Bipolar_Keystores/AuthKey_….p8 \
//   node asc-submit.mjs --bundle com.app.bipolarbear --version 1.36 \
//     [--build 36 [--wait 45]] [--submit] [--apply]
//
// --build <n>   attach build <n> of <version> to the App Store version, waiting up to
//               --wait minutes (default 45) for Apple to finish processing it
// --submit      submit the version for review. Refuses unless a VALID build is attached
//               and every localization has What's New text. Reuses an open review
//               submission for the app if there is one.
import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';
import os from 'node:os';

const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : undefined; };
const APPLY = argv.includes('--apply'), SUBMIT = argv.includes('--submit');
const BUNDLE = arg('--bundle'), VERSION = arg('--version'), BUILD = arg('--build');
const WAIT_MIN = Number(arg('--wait') || 45);
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!BUNDLE || !VERSION || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error('Needs --bundle --version (+ --build / --submit / --apply) and ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH.');
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
if (!app) throw new Error(`No app with bundle id ${BUNDLE}`);
const ver = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data[0];
if (!ver) throw new Error(`Version ${VERSION} doesn't exist yet — create it with asc-upload.mjs first`);
const state = v => v.attributes.appVersionState || v.attributes.appStoreState;
console.log(`${app.attributes.name} ${VERSION}: ${state(ver)} — ${APPLY ? 'APPLYING' : 'DRY RUN'}`);

if (BUILD) {
  let build;
  for (let i = 0; ; i++) {
    build = (await api('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD}&filter[preReleaseVersion.version]=${VERSION}`)).data[0];
    const st = build?.attributes.processingState ?? 'not visible yet';
    console.log(`  build ${BUILD}: ${st}`);
    if (st === 'VALID' || !APPLY) break;
    if (st === 'FAILED' || st === 'INVALID') throw new Error('build processing failed — not attaching');
    if (i >= WAIT_MIN) throw new Error(`build still not processed after ${WAIT_MIN} min`);
    await sleep(60000);
  }
  if (build?.attributes.processingState === 'VALID') {
    const cur = (await api('GET', `/v1/appStoreVersions/${ver.id}/build`)).data;
    if (cur?.id === build.id) console.log('  already attached');
    else {
      console.log(`  ${APPLY ? 'attaching' : 'would attach'} build ${BUILD}${cur ? ` (replacing ${cur.attributes.version})` : ''}`);
      if (APPLY) await api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
    }
  }
}

if (SUBMIT) {
  const problems = [];
  const attached = (await api('GET', `/v1/appStoreVersions/${ver.id}/build`)).data;
  if (!attached) problems.push('no build attached');
  else if (attached.attributes.processingState !== 'VALID') problems.push(`attached build ${attached.attributes.version} is ${attached.attributes.processingState}`);
  const locs = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data;
  const noNotes = locs.filter(l => !l.attributes.whatsNew).map(l => l.attributes.locale);
  if (noNotes.length) problems.push(`no What's New in: ${noNotes.join(', ')}`);
  if (state(ver) !== 'PREPARE_FOR_SUBMISSION') problems.push(`version is ${state(ver)}, not PREPARE_FOR_SUBMISSION`);
  console.log(`  submit check: build ${attached?.attributes.version ?? '—'}, ${locs.length} localizations` +
    (problems.length ? `\n  ✗ ${problems.join('\n  ✗ ')}` : ' — ready'));
  if (problems.length) process.exit(1);
  if (APPLY) {
    const open = (await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=5`)).data[0];
    const sub = open || (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions',
      attributes: { platform: 'IOS' }, relationships: { app: rel('apps', app.id) } } })).data;
    const items = (await api('GET', `/v1/reviewSubmissions/${sub.id}/items?limit=20`)).data;
    if (!items.length) await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems',
      relationships: { reviewSubmission: rel('reviewSubmissions', sub.id), appStoreVersion: rel('appStoreVersions', ver.id) } } });
    await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
    const after = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data[0];
    console.log(`  submitted for review — version now ${state(after)}`);
  } else console.log('  would submit for review (re-run with --apply)');
}
