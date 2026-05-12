'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }       = require('firebase-functions/params');
const admin                  = require('firebase-admin');
const crypto                 = require('crypto');
const { Resend }             = require('resend');

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const REGION          = 'europe-west1';
const FROM_ADDRESS    = 'Bipolar Anonymous <bipolar@unisim.co.uk>';
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
