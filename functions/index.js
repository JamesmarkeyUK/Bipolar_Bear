'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }       = require('firebase-functions/params');
const admin                  = require('firebase-admin');
const { Resend }             = require('resend');

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const REGION          = 'europe-west1';
const FROM_ADDRESS    = 'BipolarBear <verify@bipolarbear.app>';
const CODE_TTL_MS     = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT      = 3;              // max codes per email per window
const MAX_ATTEMPTS    = 5;             // wrong-code attempts before lockout

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
                    <span style="font-size:48px;font-weight:800;letter-spacing:16px;color:${DARK};font-variant-numeric:tabular-nums;">${code}</span>
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

    const code      = String(Math.floor(1000 + Math.random() * 9000));
    const sessionId = db.collection('anonVerify').doc().id;

    await db.collection('anonVerify').doc(sessionId).set({
      email,
      code,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      verified:  false,
      uid:       request.auth ? request.auth.uid : null,
      attempts:  0,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      email,
      subject: `${code} is your Bipolar Anonymous code`,
      html:    emailHtml(code),
      text:    `Your Bipolar Anonymous verification code is: ${code}\n\nThis code expires in 10 minutes. Never share it with anyone.`,
    });

    return { sessionId };
  }
);

// ── verifyAnonCode ───────────────────────────────────────────────────────────
exports.verifyAnonCode = onCall(
  { region: REGION, invoker: 'public' },
  async (request) => {
    const { sessionId, code } = request.data || {};
    if (!sessionId || !code) {
      throw new HttpsError('invalid-argument', 'sessionId and code are required.');
    }

    const ref  = db.collection('anonVerify').doc(sessionId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Verification session not found. Please start again.');
    }

    const data    = snap.data();
    const now     = Date.now();
    const elapsed = now - data.createdAt.toMillis();

    if (elapsed > CODE_TTL_MS) {
      throw new HttpsError('deadline-exceeded', 'This code has expired. A new one is on its way.');
    }

    if (data.verified) {
      return { success: true };
    }

    const attempts = (data.attempts || 0) + 1;

    if (data.code !== String(code)) {
      await ref.update({ attempts });
      const remaining = MAX_ATTEMPTS - attempts;
      if (remaining <= 0) {
        throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
      }
      throw new HttpsError('unauthenticated', `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    await ref.update({
      verified:  true,
      attempts,
      uid:       request.auth ? request.auth.uid : (data.uid || null),
      verifiedAt: admin.firestore.Timestamp.fromMillis(now),
    });

    return { success: true };
  }
);
