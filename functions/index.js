'use strict';

const { onCall, HttpsError }   = require('firebase-functions/v2/https');
const { onDocumentCreated }    = require('firebase-functions/v2/firestore');
const { defineSecret }         = require('firebase-functions/params');
const admin                    = require('firebase-admin');
const crypto                   = require('crypto');
const { Resend }               = require('resend');

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const REGION          = 'europe-west1';
const FROM_ADDRESS    = 'Bipolar Anonymous <bipolar@mail.unisim.co.uk>';
const FEEDBACK_TO     = 'inbox@jamesmarkey.co.uk';
const CODE_TTL_MS     = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT      = 3;              // max codes per email per window
const MAX_ATTEMPTS    = 5;             // wrong-code attempts before lockout
const CODE_DIGITS     = 6;              // 6-digit codes → 1,000,000 keyspace
const CODE_KEYSPACE   = 10 ** CODE_DIGITS;

// 6-digit cryptographically-random verification code, zero-padded so
// every value from 000000 to 999999 is reachable.
function generateCode() {
  return String(crypto.randomInt(0, CODE_KEYSPACE)).padStart(CODE_DIGITS, '0');
}

// ── Colours matching the Bipolar Anonymous yellow theme ──────────────────────
const YELLOW      = '#f5c800';
const YELLOW_DARK = '#c79d00';
const YELLOW_BG   = '#fffde7';
const DARK        = '#1a1a1a';
const MUTED       = '#6b7280';

function emailHtml(code) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Bipolar Anonymous verification code</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${YELLOW};border-radius:16px;padding:12px 20px;display:inline-block;">
                    <span style="font-size:22px;font-weight:800;color:${DARK};letter-spacing:-0.5px;">🐻 Bipolar Anonymous</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${DARK};">Your verification code</p>
              <p style="margin:0 0 28px;font-size:14px;color:${MUTED};line-height:1.5;">
                Enter this code in the app to join the Bipolar Anonymous community board.
                It expires in <strong>10 minutes</strong>.
              </p>

              <!-- Code block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background:${YELLOW_BG};border:2px solid ${YELLOW};border-radius:14px;padding:24px;">
                    <span style="font-size:44px;font-weight:800;letter-spacing:10px;color:${DARK};font-variant-numeric:tabular-nums;">${code}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:${MUTED};line-height:1.6;">
                If you didn't request this code, you can safely ignore this email.
                Someone may have entered your address by mistake.
              </p>
              <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.6;">
                Never share this code with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:${MUTED};">
                Sent by <a href="https://bipolarbear.app" style="color:${YELLOW_DARK};text-decoration:none;font-weight:600;">BipolarBear</a>
                &nbsp;·&nbsp; A safe space for people living with bipolar
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── sendAnonCode ─────────────────────────────────────────────────────────────
exports.sendAnonCode = onCall(
  { region: REGION, invoker: 'public', secrets: [RESEND_API_KEY] },
  async (request) => {
    const email = (request.data.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'A valid email address is required.');
    }

    const now      = Date.now();
    const windowMs = CODE_TTL_MS;

    // Rate-limit: count recent sessions for this email
    const recent = await db.collection('anonVerify')
      .where('email', '==', email)
      .where('createdAt', '>', admin.firestore.Timestamp.fromMillis(now - windowMs))
      .get();

    if (recent.size >= RATE_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Too many code requests. Please wait 10 minutes and try again.');
    }

    const code      = generateCode();
    const sessionId = db.collection('anonVerify').doc().id;

    await db.collection('anonVerify').doc(sessionId).set({
      email,
      code,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      verified:  false,
      uid:       request.auth ? request.auth.uid : null,
      attempts:  0,
    });

    const resend = new Resend(RESEND_API_KEY.value());
    const { error: resendError } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      email,
      subject: `${code} is your Bipolar Anonymous code`,
      html:    emailHtml(code),
      text:    `Your Bipolar Anonymous verification code is: ${code}\n\nThis code expires in 10 minutes. Never share it with anyone.`,
    });

    if (resendError) {
      console.error('[sendAnonCode] Resend error:', JSON.stringify(resendError));
      throw new HttpsError('internal', 'Failed to send verification email. Please try again.');
    }

    return { sessionId };
  }
);

// ── verifyAnonCode ───────────────────────────────────────────────────────────
// The whole check runs inside a Firestore transaction so concurrent
// attempts can't race past the MAX_ATTEMPTS budget. The attempts counter
// is incremented BEFORE the code comparison and on EVERY attempt — even
// successful ones — so a parallel burst of guesses can't slip a verified
// write through without first exhausting attempts.
exports.verifyAnonCode = onCall(
  { region: REGION, invoker: 'public' },
  async (request) => {
    const { sessionId, code } = request.data || {};
    if (typeof sessionId !== 'string' || !sessionId ||
        (typeof code !== 'string' && typeof code !== 'number')) {
      throw new HttpsError('invalid-argument', 'sessionId and code are required.');
    }
    const submitted = String(code);
    if (submitted.length === 0 || submitted.length > 16) {
      throw new HttpsError('invalid-argument', 'Invalid code.');
    }

    const ref = db.collection('anonVerify').doc(sessionId);
    const now = Date.now();

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'not-found' };

      const data = snap.data();
      if (now - data.createdAt.toMillis() > CODE_TTL_MS) return { kind: 'expired' };
      if (data.verified) return { kind: 'already-verified' };

      const prevAttempts = data.attempts || 0;
      if (prevAttempts >= MAX_ATTEMPTS) return { kind: 'locked' };

      const attempts = prevAttempts + 1;
      const expected = String(data.code || '');
      const match =
        submitted.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));

      if (!match) {
        tx.update(ref, { attempts });
        return { kind: 'mismatch', remaining: Math.max(0, MAX_ATTEMPTS - attempts) };
      }

      tx.update(ref, {
        verified:   true,
        attempts,
        uid:        request.auth ? request.auth.uid : (data.uid || null),
        verifiedAt: admin.firestore.Timestamp.fromMillis(now),
      });
      return { kind: 'verified' };
    });

    switch (outcome.kind) {
      case 'verified':
      case 'already-verified':
        return { success: true };
      case 'not-found':
        throw new HttpsError('not-found', 'Verification session not found. Please start again.');
      case 'expired':
        throw new HttpsError('deadline-exceeded', 'This code has expired. A new one is on its way.');
      case 'locked':
        throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
      case 'mismatch':
        if (outcome.remaining <= 0) {
          throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
        }
        throw new HttpsError('unauthenticated', `Incorrect code. ${outcome.remaining} attempt${outcome.remaining === 1 ? '' : 's'} remaining.`);
      default:
        throw new HttpsError('internal', 'Verification failed.');
    }
  }
);

// ── getBBStats ───────────────────────────────────────────────────────────────
// Called by the standalone anonymous path after email-code verification to
// pull stability streak and account creation date from the linked BipolarBear
// account (if one exists with the same email). Requires a verified sessionId.
exports.getBBStats = onCall(
  { region: REGION, invoker: 'public' },
  async (request) => {
    const { sessionId } = request.data || {};
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required.');
    }

    const snap = await db.collection('anonVerify').doc(sessionId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Session not found.');
    }
    const session = snap.data();
    if (!session.verified) {
      throw new HttpsError('permission-denied', 'Session not verified.');
    }
    // Allow up to 24 hours after verification (covers slow onboarding flows)
    const verifiedAt = session.verifiedAt ? session.verifiedAt.toMillis() : 0;
    if (Date.now() - verifiedAt > 24 * 60 * 60 * 1000) {
      throw new HttpsError('deadline-exceeded', 'Session expired.');
    }

    const email = session.email;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;
      const accountCreatedAt = userRecord.metadata.creationTime || null;

      const settingsDoc = await db.collection('userSettings').doc(uid).get();
      const settings = settingsDoc.exists ? settingsDoc.data() : {};

      return {
        bbLinked:        true,
        stableStreak:    settings.stableStreak     || 0,
        stableSince:     settings.stableStreakStart || null,
        accountCreatedAt,
      };
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        return { bbLinked: false };
      }
      throw e;
    }
  }
);

// ── onFeedbackSubmitted ──────────────────────────────────────────────────────
// Fires whenever a document is created in feedback/{docId} and emails a
// summary to FEEDBACK_TO via Resend.
const ORANGE      = '#ff9500';
const ORANGE_DARK = '#c97900';
const ORANGE_BG   = '#fff8ee';

function feedbackEmailHtml(d) {
  const TYPE_EMOJI = { bug: '🐛', comment: '💬', idea: '💡' };
  const typeLabel = d.type ? `${TYPE_EMOJI[d.type] || '📣'} ${d.type}` : '📣 unknown';
  const ts = d.ts ? new Date(d.ts).toUTCString() : 'unknown';
  const rows = [
    ['Type',     typeLabel],
    ['Message',  d.message || '(empty)'],
    ['Page',     d.page    || '—'],
    ['Platform', d.platform || '—'],
    ['Version',  d.version  || '—'],
    ['UID',      d.uid      || '(guest)'],
    ['User email', d.email  || '—'],
    ['Notify me?', d.notify ? 'Yes' : 'No'],
    ['Submitted', ts],
  ];

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:${MUTED};white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:${DARK};word-break:break-word;">${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
    </tr>`).join('');

  const screenshotHtml = d.screenshot
    ? `<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:${MUTED};">Screenshot</p>
       <img src="${d.screenshot}" alt="screenshot" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb;">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>New feedback — BipolarBear</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">

        <tr><td align="center" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:${ORANGE};border-radius:16px;padding:12px 20px;">
              <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🐻 BipolarBear — New Feedback</span>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
            ${rowsHtml}
          </table>
          ${screenshotHtml}
        </td></tr>

        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:12px;color:${MUTED};">
            <a href="https://console.firebase.google.com" style="color:${ORANGE_DARK};text-decoration:none;font-weight:600;">Open Firestore console</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.onFeedbackSubmitted = onDocumentCreated(
  { document: 'feedback/{docId}', region: REGION, secrets: [RESEND_API_KEY] },
  async (event) => {
    const d = event.data.data();
    const typeLabel = d.type || 'feedback';
    const subject = `[BipolarBear] New ${typeLabel} from ${d.email || d.uid || 'guest'}`;

    const resend = new Resend(RESEND_API_KEY.value());
    const { error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      FEEDBACK_TO,
      subject,
      html:    feedbackEmailHtml(d),
      text:    `Type: ${typeLabel}\nMessage: ${d.message || ''}\nPage: ${d.page || ''}\nPlatform: ${d.platform || ''}\nUID: ${d.uid || 'guest'}\nUser email: ${d.email || '—'}\nNotify: ${d.notify ? 'yes' : 'no'}\nTime: ${d.ts ? new Date(d.ts).toUTCString() : 'unknown'}`,
    });

    if (error) {
      console.error('[onFeedbackSubmitted] Resend error:', JSON.stringify(error));
    }
  }
);

// ── onBetaSignup ─────────────────────────────────────────────────────────────
// Fires whenever a document is created in betaSignups/{docId} and emails a
// notification to FEEDBACK_TO via Resend.
function betaSignupEmailHtml(d) {
  const ts = d.timestamp ? new Date(d.timestamp.toMillis()).toUTCString() : 'unknown';
  const rows = [
    ['Email',    d.email    || '—'],
    ['Platform', d.platform || '—'],
    ['Source',   d.source   || '—'],
    ['Time',     ts],
  ];

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:${MUTED};white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:${DARK};word-break:break-word;">${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>New beta signup — BipolarBear</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">

        <tr><td align="center" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:${ORANGE};border-radius:16px;padding:12px 20px;">
              <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🐻 BipolarBear — New Beta Signup</span>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
            ${rowsHtml}
          </table>
        </td></tr>

        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:12px;color:${MUTED};">
            <a href="https://console.firebase.google.com" style="color:${ORANGE_DARK};text-decoration:none;font-weight:600;">Open Firestore console</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.onBetaSignup = onDocumentCreated(
  { document: 'betaSignups/{docId}', region: REGION, secrets: [RESEND_API_KEY] },
  async (event) => {
    const d = event.data.data();
    const resend = new Resend(RESEND_API_KEY.value());
    const { error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      FEEDBACK_TO,
      subject: `[BipolarBear] New beta signup — ${d.email || 'unknown'} (${d.platform || '?'})`,
      html:    betaSignupEmailHtml(d),
      text:    `New beta signup\nEmail: ${d.email || '—'}\nPlatform: ${d.platform || '—'}\nSource: ${d.source || '—'}\nTime: ${d.timestamp ? new Date(d.timestamp.toMillis()).toUTCString() : 'unknown'}`,
    });

    if (error) {
      console.error('[onBetaSignup] Resend error:', JSON.stringify(error));
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Bipolar Anonymous — push notifications
//
// Three things reach a member, each gated on a preference they set in the
// board's settings sheet (see js/shared/anon-push.js):
//
//   replies       — someone answered a post of theirs
//   announcements — the admin published (or approved) an announcement
//   weekly        — one digest of the week, Sunday evening
//
// Registrations live in bbAnonPush/{fcmToken}:
//   { token, prefs: {replies, announcements, weekly}, monikaLower,
//     emailHash, platform, bundle, lang, updatedAt }
//
// Notifications deliberately carry NO post or comment text. The board is a
// mental-health space and a notification lands on a lock screen where anyone
// nearby can read it — "someone replied to your post" is all the prompt
// anyone needs to open the app, and it can't out a member to the person
// looking over their shoulder.
// ═══════════════════════════════════════════════════════════════════════════

const { onSchedule } = require('firebase-functions/v2/scheduler');

const PUSH_COLLECTION = 'bbAnonPush';
const POSTS           = 'bbAnonPosts';
const FCM_BATCH       = 500;   // sendEachForMulticast ceiling

// Notification copy, mirroring js/shared/i18n.js. Kept deliberately short and
// contentless — see the note above. `{n}` is substituted for the digest.
const PUSH_TEXT = {
  en: { replyT: 'New reply',        replyB: 'Someone replied to your post on Bipolar Anonymous.',
        annT:   'New announcement', annB:   'There is a new announcement on the board.',
        weekT:  'Your week on the board', weekB: '{n} new posts this week. Come and see how everyone is doing.' },
  es: { replyT: 'Nueva respuesta',  replyB: 'Alguien ha respondido a tu publicación en Bipolar Anonymous.',
        annT:   'Nuevo anuncio',    annB:   'Hay un nuevo anuncio en el foro.',
        weekT:  'Tu semana en el foro', weekB: '{n} publicaciones nuevas esta semana. Ven a ver cómo está todo el mundo.' },
  fr: { replyT: 'Nouvelle réponse', replyB: 'Quelqu’un a répondu à votre post sur Bipolar Anonymous.',
        annT:   'Nouvelle annonce', annB:   'Il y a une nouvelle annonce sur le forum.',
        weekT:  'Votre semaine sur le forum', weekB: '{n} nouveaux posts cette semaine. Venez voir comment vont les autres.' },
  de: { replyT: 'Neue Antwort',     replyB: 'Jemand hat auf Ihren Beitrag bei Bipolar Anonymous geantwortet.',
        annT:   'Neue Ankündigung', annB:   'Es gibt eine neue Ankündigung im Forum.',
        weekT:  'Ihre Woche im Forum', weekB: '{n} neue Beiträge diese Woche. Schauen Sie, wie es allen geht.' },
  it: { replyT: 'Nuova risposta',   replyB: 'Qualcuno ha risposto al tuo post su Bipolar Anonymous.',
        annT:   'Nuovo annuncio',   annB:   'C’è un nuovo annuncio sulla bacheca.',
        weekT:  'La tua settimana sulla bacheca', weekB: '{n} nuovi post questa settimana. Vieni a vedere come stanno tutti.' },
  pt: { replyT: 'Nova resposta',    replyB: 'Alguém respondeu à sua publicação no Bipolar Anonymous.',
        annT:   'Novo anúncio',     annB:   'Há um novo anúncio no fórum.',
        weekT:  'Sua semana no fórum', weekB: '{n} novas publicações esta semana. Venha ver como todos estão.' },
  nl: { replyT: 'Nieuwe reactie',   replyB: 'Iemand heeft gereageerd op je bericht op Bipolar Anonymous.',
        annT:   'Nieuwe mededeling', annB:  'Er staat een nieuwe mededeling op het forum.',
        weekT:  'Jouw week op het forum', weekB: '{n} nieuwe berichten deze week. Kom kijken hoe het met iedereen gaat.' },
  pl: { replyT: 'Nowa odpowiedź',   replyB: 'Ktoś odpowiedział na Twój wpis na Bipolar Anonymous.',
        annT:   'Nowe ogłoszenie',  annB:   'Na forum pojawiło się nowe ogłoszenie.',
        weekT:  'Twój tydzień na forum', weekB: '{n} nowych wpisów w tym tygodniu. Zobacz, co u innych.' },
  sv: { replyT: 'Nytt svar',        replyB: 'Någon har svarat på ditt inlägg på Bipolar Anonymous.',
        annT:   'Nytt meddelande',  annB:   'Det finns ett nytt meddelande på forumet.',
        weekT:  'Din vecka på forumet', weekB: '{n} nya inlägg den här veckan. Kom och se hur alla mår.' },
  zh: { replyT: '有新回复',          replyB: '有人回复了你在 Bipolar Anonymous 的帖子。',
        annT:   '新公告',            annB:   '论坛有一条新公告。',
        weekT:  '你这一周的社区',      weekB: '本周有 {n} 条新帖子。来看看大家过得怎么样。' },
};

function pushText(lang, key, vars) {
  const table = PUSH_TEXT[lang] || PUSH_TEXT.en;
  let out = table[key] || PUSH_TEXT.en[key] || '';
  if (vars) Object.keys(vars).forEach((k) => { out = out.split(`{${k}}`).join(String(vars[k])); });
  return out;
}

/**
 * Registrations that want `pref`, optionally narrowed to one monika.
 * Preferences are filtered in code rather than in the query so a single
 * equality index serves every lookup.
 * @returns {Promise<Array<{token: string, lang: string, monikaLower: string}>>}
 */
async function subscribers(pref, monikaLower) {
  let query = db.collection(PUSH_COLLECTION);
  if (monikaLower) query = query.where('monikaLower', '==', monikaLower);
  const snap = await query.get();
  return snap.docs
    .map((d) => ({ token: d.id, ...d.data() }))
    .filter((r) => r.token && r.prefs && r.prefs[pref]);
}

/**
 * Send one notification to a set of registrations, grouped by language, and
 * clear out tokens FCM tells us are dead. Returns how many were delivered.
 * @param {Array} recipients from subscribers()
 * @param {{titleKey: string, bodyKey: string, vars?: object, data?: object}} msg
 * @returns {Promise<number>}
 */
async function sendToRecipients(recipients, msg) {
  if (!recipients.length) return 0;

  const byLang = new Map();
  recipients.forEach((r) => {
    const lang = PUSH_TEXT[r.lang] ? r.lang : 'en';
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(r.token);
  });

  let sent = 0;
  const dead = [];

  for (const [lang, allTokens] of byLang) {
    const notification = {
      title: pushText(lang, msg.titleKey, msg.vars),
      body:  pushText(lang, msg.bodyKey,  msg.vars),
    };
    for (let i = 0; i < allTokens.length; i += FCM_BATCH) {
      const tokens = allTokens.slice(i, i + FCM_BATCH);
      let res;
      try {
        res = await admin.messaging().sendEachForMulticast({
          tokens,
          notification,
          data: Object.assign({ kind: msg.data && msg.data.kind ? msg.data.kind : 'anon' }, msg.data || {}),
          apns: { payload: { aps: { sound: 'default' } } },
          android: { notification: { icon: 'ic_stat_icon_config_sample', color: '#f5c800' } },
        });
      } catch (e) {
        console.error('[anonPush] send failed', e);
        continue;
      }
      sent += res.successCount;
      res.responses.forEach((r, idx) => {
        const code = r.error && r.error.code;
        // The app was deleted, or the token was replaced. Either way nothing
        // is listening — drop it so the collection doesn't rot.
        if (code === 'messaging/registration-token-not-registered'
            || code === 'messaging/invalid-registration-token'
            || code === 'messaging/invalid-argument') {
          dead.push(tokens[idx]);
        }
      });
    }
  }

  if (dead.length) {
    const batch = db.batch();
    dead.forEach((t) => batch.delete(db.collection(PUSH_COLLECTION).doc(t)));
    await batch.commit().catch((e) => console.warn('[anonPush] token cleanup failed', e));
  }
  return sent;
}

// ── Replies ──────────────────────────────────────────────────────────────────
// A comment on a post notifies that post's author, on every device they have
// registered — but never the person who wrote the comment (replying to
// yourself, or to your own thread, is not news).
exports.onAnonCommentCreated = onDocumentCreated(
  { document: 'bbAnonPosts/{postId}/comments/{commentId}', region: REGION },
  async (event) => {
    const comment = event.data && event.data.data();
    if (!comment) return;

    const postSnap = await db.collection(POSTS).doc(event.params.postId).get();
    if (!postSnap.exists) return;
    const post = postSnap.data();
    const author = (post.name || '').toLowerCase();
    if (!author) return;                                   // system card, no author
    if (author === (comment.name || '').toLowerCase()) return;  // replying to themselves

    const recipients = await subscribers('replies', author);
    if (!recipients.length) return;

    const sent = await sendToRecipients(recipients, {
      titleKey: 'replyT',
      bodyKey:  'replyB',
      data:     { kind: 'reply', postId: event.params.postId, url: '/anonymous.html' },
    });
    console.log(`[anonPush] reply → ${author}: ${sent}/${recipients.length}`);
  }
);

// ── Announcements ────────────────────────────────────────────────────────────
// Fires for anything landing on the announcements tab, which covers both the
// admin posting directly and the admin approving a member's suggestion (the
// approval writes an ordinary announcement post).
exports.onAnonAnnouncementCreated = onDocumentCreated(
  { document: 'bbAnonPosts/{postId}', region: REGION },
  async (event) => {
    const post = event.data && event.data.data();
    if (!post || post.tab !== 'announcements' || post.deleted) return;

    const recipients = await subscribers('announcements');
    if (!recipients.length) return;

    const sent = await sendToRecipients(recipients, {
      titleKey: 'annT',
      bodyKey:  'annB',
      data:     { kind: 'announcement', postId: event.params.postId, url: '/anonymous.html' },
    });
    console.log(`[anonPush] announcement: ${sent}/${recipients.length}`);
  }
);

// ── Weekly digest ────────────────────────────────────────────────────────────
// Sunday evening, UK time. Counts only — no titles, no snippets. A week with
// nothing in it sends nothing: an empty digest is just a notification tax.
exports.weeklyAnonDigest = onSchedule(
  { schedule: '0 18 * * 0', timeZone: 'Europe/London', region: REGION },
  async () => {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snap  = await db.collection(POSTS).where('timestamp', '>=', since).get();
    const posts = snap.docs
      .map((d) => d.data())
      .filter((p) => !p.deleted && p.tab === 'general');

    if (!posts.length) {
      console.log('[anonPush] weekly digest: quiet week, nothing sent');
      return;
    }

    const recipients = await subscribers('weekly');
    if (!recipients.length) return;

    const sent = await sendToRecipients(recipients, {
      titleKey: 'weekT',
      bodyKey:  'weekB',
      vars:     { n: posts.length },
      data:     { kind: 'weekly', url: '/anonymous.html' },
    });
    console.log(`[anonPush] weekly digest: ${sent}/${recipients.length} (${posts.length} posts)`);
  }
);

// ── Announcement suggestions → email the admin ───────────────────────────────
// A suggestion is only useful once someone looks at it, and the admin isn't
// necessarily on the board that day. Same Resend path as feedback and beta
// signups; the queue itself lives in the app.
function suggestionEmailHtml(d) {
  const escape = (v) => String(v == null ? '' : v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Announcement suggestion — Bipolar Anonymous</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">

        <tr><td align="center" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:${YELLOW};border-radius:16px;padding:12px 20px;">
              <span style="font-size:20px;font-weight:800;color:${DARK};letter-spacing:-0.5px;">📢 Announcement suggestion</span>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <p style="margin:0 0 12px;font-size:13px;color:${MUTED};">From <strong style="color:${DARK};">[${escape(d.name)}]</strong></p>
          <div style="background:${YELLOW_BG};border-radius:12px;padding:16px;font-size:15px;line-height:1.6;color:${DARK};white-space:pre-wrap;">${escape(d.text)}</div>
          <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">Open the Announcements tab on the board to publish or refuse it.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.onAnonSuggestionCreated = onDocumentCreated(
  { document: 'bbAnonAnnSuggestions/{docId}', region: REGION, secrets: [RESEND_API_KEY] },
  async (event) => {
    const d = event.data && event.data.data();
    if (!d || d.status !== 'pending') return;

    const resend = new Resend(RESEND_API_KEY.value());
    const { error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      FEEDBACK_TO,
      subject: `[Bipolar Anonymous] Announcement suggested by [${d.name || 'unknown'}]`,
      html:    suggestionEmailHtml(d),
      text:    `Announcement suggested by [${d.name || 'unknown'}]\n\n${d.text || ''}\n\nPublish or refuse it from the Announcements tab.`,
    });

    if (error) {
      console.error('[onAnonSuggestionCreated] Resend error:', JSON.stringify(error));
    }
  }
);
