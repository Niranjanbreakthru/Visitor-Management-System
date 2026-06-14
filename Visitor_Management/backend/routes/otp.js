const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { sendOtpEmail } = require('../services/emailService');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const OTP_LENGTH = 6;

const otpStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of otpStore) {
    if (rec.expires_at < now) {
      otpStore.delete(key);
    }
  }
}, 60_000);

function otpKey(method, contact) {
  return `${method}:${contact}`;
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validateEmailFormat(email) {
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!re.test(email)) return { ok: false, error: 'Invalid email format.' };
  return { ok: true };
}

async function cleanupDbOtps() {
  try {
    await db.query('DELETE FROM otp_verifications WHERE expires_at < NOW()');
  } catch (_e) { /* table may not exist yet */ }
}

// POST /api/otp/send-email
router.post('/send-email', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).trim()) return res.status(400).json({ ok: false, error: 'Email address required.' });

  const normalized = String(email).trim().toLowerCase();
  const fmtCheck = validateEmailFormat(normalized);
  if (!fmtCheck.ok) return res.status(400).json({ ok: false, error: fmtCheck.error });

  const key = otpKey('email', normalized);
  const existing = otpStore.get(key);
  if (existing && existing.resend_count >= MAX_RESENDS) {
    return res.status(429).json({ ok: false, error: 'Maximum resend attempts reached. Please try again later.' });
  }

  const code = generateOtp();
  const now = new Date();
  const record = {
    method: 'email',
    contact: normalized,
    code_hash: hashOtp(code),
    created_at: now.toISOString(),
    expires_at: now.getTime() + OTP_EXPIRY_MS,
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    resend_count: existing ? existing.resend_count + 1 : 0,
    verified: false,
  };

  otpStore.set(key, record);

  await cleanupDbOtps();
  try {
    await db.query(
      `INSERT INTO otp_verifications (method, contact, code_hash, expires_at, attempts, resend_count, verified)
       VALUES ($1,$2,$3,NOW() + INTERVAL '5 minutes',$4,$5,$6)
       ON CONFLICT (method, contact) DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = EXCLUDED.attempts,
         resend_count = EXCLUDED.resend_count,
         verified = EXCLUDED.verified`,
      ['email', normalized, record.code_hash, 0, record.resend_count, false]
    );
  } catch (_e) { /* silent */ }

  let emailStatus = 'failed';
  let emailMessage = 'OTP generated.';
  let sentInfo = null;

  try {
    sentInfo = await sendOtpEmail({
      to: normalized,
      code,
      method: 'email',
      contact: normalized,
    });
    emailStatus = 'sent';
    emailMessage = 'OTP email sent successfully.';
    console.log(`[OTP] Email OTP sent to ${normalized}: ${code} (resend #${record.resend_count})`);
  } catch (mailErr) {
    emailMessage = `OTP generated. Mail delivery failed: ${mailErr.message}`;
    console.error('[OTP] Email delivery failed:', mailErr);
    console.log(`[OTP] Email OTP for ${normalized}: ${code} (resend #${record.resend_count})`);
  }

  res.json({
    ok: true,
    message: emailMessage,
    contact: normalized,
    method: 'email',
    expires_in: 300,
    resend_count: record.resend_count,
    max_resends: MAX_RESENDS,
    delivery: {
      provider: 'smtp',
      status: emailStatus,
      message: emailMessage,
      messageId: sentInfo ? sentInfo.messageId : null,
    },
  });
});

// POST /api/otp/verify
router.post('/verify', (req, res) => {
  const { method, contact, code } = req.body || {};
  if (!method || !contact || !code) return res.status(400).json({ ok: false, error: 'method, contact, and code are required.' });

  const normalizedContact = String(contact).trim().toLowerCase();
  const key = otpKey(method, normalizedContact);
  const record = otpStore.get(key);

  if (!record) return res.status(400).json({ ok: false, error: 'No OTP request found. Please request a new OTP.' });

  if (record.verified) return res.status(400).json({ ok: false, error: 'Already verified.' });

  if (Date.now() > record.expires_at) {
    otpStore.delete(key);
    return res.status(400).json({ ok: false, error: 'OTP expired. Please request a new one.' });
  }

  if (record.attempts >= record.max_attempts) {
    otpStore.delete(key);
    return res.status(429).json({ ok: false, error: 'Maximum verification attempts exceeded. Please request a new OTP.' });
  }

  const inputHash = hashOtp(String(code).trim());
  if (inputHash === record.code_hash) {
    record.verified = true;
    record.verified_at = new Date().toISOString();
    otpStore.set(key, record);

    db.query(
      `UPDATE otp_verifications SET verified=TRUE, verified_at=NOW() WHERE method=$1 AND contact=$2`,
      [method, normalizedContact]
    ).catch(() => {});

    return res.json({
      ok: true,
      message: 'Verification successful.',
      method,
      contact: normalizedContact,
    });
  }

  record.attempts += 1;
  otpStore.set(key, record);

  const remaining = record.max_attempts - record.attempts;
  if (remaining <= 0) {
    otpStore.delete(key);
    return res.status(429).json({ ok: false, error: 'Maximum attempts exceeded. Please request a new OTP.' });
  }

  res.status(400).json({
    ok: false,
    error: `Invalid OTP. ${remaining} attempt(s) remaining.`,
    attempts_left: remaining,
  });
});

module.exports = router;
