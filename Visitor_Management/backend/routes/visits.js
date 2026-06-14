const puppeteer = require('puppeteer');
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const telegramService = require('../services/telegramService');
const os = require('os');
const fs = require('fs');

const generateToken = () => crypto.randomBytes(40).toString('hex');

// Get local IPv4 address dynamically to route email links from local devices like phones
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // fallback
}

async function sendHostEmail(visit, token) {
  const port = process.env.PORT || 3001;
  const localIp = getLocalIpAddress();
  const host = process.env.BASE_URL || `http://${localIp}:${port}`;
  const approveUrl = `${host}/api/visits/action/${token}?decision=approved`;
  const denyUrl = `${host}/api/visits/action/${token}?decision=denied`;

  console.log('[sendHostEmail] Host email:', visit.host_email);
  console.log('[sendHostEmail] Approve URL:', approveUrl);
  console.log('[sendHostEmail] Deny URL:', denyUrl);

  if (!process.env.MAIL_USER) {
    console.log(`\n[EMAIL] SMTP not configured — approval link(s) for ${visit.name}`);
    console.log('APPROVE:', approveUrl);
    console.log('DENY   :', denyUrl);
    return false;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  // Prepare photo attachment if present
  let htmlPhotoTag = '';
  let attachments = [];
  if (visit.photo_b64 && visit.photo_b64.includes(';base64,')) {
    try {
      const parts = visit.photo_b64.split(';base64,');
      const contentType = parts[0].split(':')[1] || 'image/jpeg';
      const base64Data = parts[1];
      attachments.push({
        filename: 'visitor_photo.jpg',
        content: Buffer.from(base64Data, 'base64'),
        cid: 'visitorPhoto' // cid to reference in html
      });
      htmlPhotoTag = `
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="cid:visitorPhoto" alt="Visitor Photo" style="width: 130px; height: 130px; border-radius: 50%; border: 3px solid #BFDBFE; object-fit: cover; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" />
        </div>
      `;
    } catch (photoErr) {
      console.error('[Email Photo Embed Error]', photoErr);
    }
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Visitor Approval Required</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5FB; margin: 0; padding: 20px; color: #0F172A; }
        .card { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; }
        .header { background: #0A1628; padding: 32px 24px; text-align: center; color: #FFFFFF; }
        .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #FFFFFF; text-decoration: none; display: inline-block; }
        .logo span { color: #2563EB; }
        .title { font-size: 18px; margin: 12px 0 0 0; font-weight: 500; color: #E2E8F0; }
        .body { padding: 32px 24px; }
        .grid { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .grid td { padding: 10px 0; border-bottom: 1px solid #F1F5F9; font-size: 14px; }
        .label { color: #64748B; font-weight: 500; width: 35%; }
        .value { color: #0F172A; font-weight: 600; text-align: right; }
        .btn-group { display: flex; gap: 12px; margin-top: 10px; justify-content: center; }
        .btn { display: inline-block; flex: 1; text-align: center; padding: 14px 18px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; transition: transform 0.1s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .btn-approve { background-color: #16A34A; color: #FFFFFF !important; border: 1px solid #15803D; }
        .btn-deny { background-color: #DC2626; color: #FFFFFF !important; border: 1px solid #B91C1C; }
        .footer { padding: 24px; background: #F8FAFC; text-align: center; border-top: 1px solid #E2E8F0; }
        .footer-text { font-size: 11px; color: #94A3B8; margin: 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">breakthru<span>.ai</span></div>
          <div class="title">Visitor Access Request</div>
        </div>
        <div class="body">
          ${htmlPhotoTag}
          <table class="grid">
            <tr>
              <td class="label">Visitor Name</td>
              <td class="value">${visit.name}</td>
            </tr>
            <tr>
              <td class="label">Purpose of Visit</td>
              <td class="value" style="color: #2563EB;">${visit.purpose}</td>
            </tr>
            <tr>
              <td class="label">Host Name</td>
              <td class="value">${visit.host_name || '—'}</td>
            </tr>
            ${visit.company ? `
            <tr>
              <td class="label">Company</td>
              <td class="value">${visit.company}</td>
            </tr>` : ''}
          </table>
          
          <div style="text-align: center; margin-bottom: 12px; font-weight: 500; font-size: 14px; color: #475569;">
            Action Required: Approve or deny this visitor access.
          </div>
          
          <div class="btn-group">
            <a href="${approveUrl}" class="btn btn-approve" style="margin-right: 6px;">✅ Approve Access</a>
            <a href="${denyUrl}" class="btn btn-deny" style="margin-left: 6px;">❌ Deny Access</a>
          </div>
        </div>
        <div class="footer">
          <p class="footer-text">This is a secure system notification from Breakthru.ai Visitor Management.</p>
          <p class="footer-text" style="margin-top: 4px;">Approval link is active for 24 hours.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log('[sendHostEmail] Attempting to send email to:', visit.host_email);
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: visit.host_email,
      subject: `🚪 Visitor Approval Required: ${visit.name}`,
      html: htmlContent,
      attachments: attachments
    });
    console.log(`[EMAIL] Premium notification sent to ${visit.host_email}`);
    return true;
  } catch (err) {
    console.error('[Email Error]', err);
    return false;
  }
}

// POST /api/visits - Create visit
router.post('/', async (req, res) => {
  let {
    name, company, phone, email, purpose, host_id,
    id_type, id_number, photo_b64, had_appointment, appointment_id,
    visitor_type, team_name, team_count, team_members,
    countryCode, country_code,
    verified_contact_method, verified_mobile, verified_email, verification_timestamp
  } = req.body;

  console.log('[Create Visit] Received payload:', { name, phone, email: email || '(none)', purpose, host_id, visitor_type });

// Email validation - optional field but must be valid if provided
  if (email && email.trim() !== '') {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }
  }

  let cc = countryCode || country_code;
  if (cc && phone && !phone.startsWith('+')) {
    phone = `${cc} ${phone}`;
  }

  if (!name || !phone || !purpose || !host_id) {
    return res.status(400).json({ ok: false, error: 'Name, phone, purpose, and host are required' });
  }

  if (!(verified_mobile || verified_email) || !verified_contact_method) {
    return res.status(403).json({ ok: false, error: 'OTP verification required before registration. Please verify your mobile or email.' });
  }

  // Duplicate active session check disabled for now (allows multiple active visits)
//   [phone]
// );
// if (activeVisits.length > 0) {
//   return res.status(400).json({ ok: false, error: 'Visitor already has an active session' });
// }

    // Validate photo_b64 if provided
    if (photo_b64 && !photo_b64.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, error: 'Valid base64 photo required' });
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO visits
           (name, company, phone, email, purpose, host_id,
            id_type, id_number, photo_b64, had_appointment, appointment_id,
            visitor_type, team_name, team_count,
            verified_contact_method, verified_mobile, verified_email, verification_timestamp,
            status)
         VALUES
           ($1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,$11,
            $12,$13,$14,
            $15,$16,$17,$18,
            'registered')
         RETURNING id, session_id`,
        [
          name,
          company || '',
          phone,
          email || '',
          purpose,
          host_id,
          id_type || '',
          id_number || '',
          photo_b64 || '',
          had_appointment || false,
          appointment_id || null,
          visitor_type || 'Individual',
          team_name || '',
          team_count || 2,
          verified_contact_method || null,
          !!verified_mobile,
          !!verified_email,
          verification_timestamp || new Date()
        ]
      );

    const visit = rows[0];

    console.log('[Create Visit] Visit inserted with id:', visit.id);

    if (team_members && Array.isArray(team_members) && team_members.length > 0) {
      for (const member of team_members) {
        const memberName = typeof member === 'string' ? member : member.name;
        const memberIdType = typeof member === 'string' ? '' : (member.idType || member.id_type || '');
        const memberIdNumber = typeof member === 'string' ? '' : (member.idNumber || member.id_number || '');
        if (!memberName) continue;

        await db.query(
          `INSERT INTO team_members (visit_id, name, id_type, id_number)
           VALUES ($1,$2,$3,$4)`,
          [visit.id, memberName, memberIdType, memberIdNumber]
        );
      }
    }

    res.json({ ok: true, data: { id: visit.id, session_id: visit.session_id } });
  } catch (err) {
    console.error('[Create Visit Error]', err);
    console.error('[Create Visit Error Stack]', err.stack);
    res.status(500).json({ ok: false, error: 'Failed to save visit: ' + err.message });
  }
});

// PATCH /api/visits/:id/photo  — save or update the visitor photo independently
// of the visit lifecycle (covers the demo / short-circuit path as well).
router.patch('/:id/photo', async (req, res) => {
  const { id } = req.params;
  const { photo_b64 } = req.body;

  if (!photo_b64 || !photo_b64.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, error: 'Valid base64 photo required' });
  }

  try {
    // Basic validation: ensure visit exists
    const { rows } = await db.query('SELECT id FROM visits WHERE id=$1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Visit not found' });
    }

    // Persist the base64 photo data to the visits table
    await db.query('UPDATE visits SET photo_b64=$1 WHERE id=$2', [photo_b64, id]);
    res.json({ ok: true, message: 'Photo saved' });
  } catch (err) {
    console.error('[Photo Upload Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to save photo' });
  }
});

// PATCH /api/visits/:id/agreement
router.patch('/:id/agreement', async (req, res) => {
  const { id } = req.params;
  const { signed } = req.body;

  if (!signed) return res.status(400).json({ ok: false, error: 'Agreement not signed' });

  try {
    await db.query('UPDATE visits SET agreement_signed = TRUE WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Agreement Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to sign agreement' });
  }
});

// POST /api/visits/:id/notify
router.post('/:id/notify', async (req, res) => {
  const { id } = req.params;
  const token = generateToken();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const { rows: visitRows } = await db.query(
      `SELECT v.*, h.name as host_name, h.email as host_email
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.id=$1`,
      [id]
    );

    if (visitRows.length === 0) return res.status(404).json({ ok: false, error: 'Visit not found' });

    const visit = visitRows[0];
    console.log('[notify] Visit found:', { id: visit.id, name: visit.name, host_email: visit.host_email, host_id: visit.host_id });

    await db.query(
      'UPDATE visits SET approval_token=$1, token_expires=$2 WHERE id=$3',
      [token, expires, id]
    );

    // Validate host email before sending
    if (!visit.host_email) {
      console.error('[notify] ERROR: No host email found for host_id:', visit.host_id);
      return res.status(400).json({ ok: false, error: 'Host email not found. Please check host configuration.' });
    }

    // Send email notification
    const emailSent = await sendHostEmail(visit, token);
    console.log('[notify] Email sent result:', emailSent);
    
    // Send Telegram notification
    const telegramSent = await telegramService.sendVisitorNotification(visit);
    console.log('[notify] Telegram sent result:', telegramSent);

    res.json({ 
      ok: true, 
      data: { 
        email_sent: emailSent,
        telegram_sent: telegramSent,
        host: visit.host_name || 'Unknown' 
      } 
    });
  } catch (err) {
    console.error('[Notify Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to send notification' });
  }
});

// GET /api/visits/:id/status
router.get('/:id/status', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      'SELECT approval_status, status, agreement_signed FROM visits WHERE id=$1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Visit not found' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[Status Error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/visits/action/:token?decision=approved|denied
router.get('/action/:token', async (req, res) => {
  const { token } = req.params;
  const { decision } = req.query;

  if (!decision || !['approved', 'denied'].includes(decision)) {
    return res.status(400).send('<h1>Invalid decision</h1>');
  }

  try {
    const { rows } = await db.query(
      `SELECT * FROM visits
       WHERE approval_token=$1
         AND token_expires > NOW()
         AND approval_status='pending'`,
      [token]
    );

    if (rows.length === 0) return res.status(400).send('<h1>Invalid or expired token</h1>');

    const visit = rows[0];

    await db.query(
      'UPDATE visits SET approval_status=$1, approval_token=NULL WHERE id=$2',
      [decision, visit.id]
    );

    res.send(`<h1>Access ${decision === 'approved' ? 'APPROVED' : 'DENIED'}</h1><p>Visitor: ${visit.name}</p>`);
  } catch (err) {
    console.error('[Action Error]', err);
    res.status(500).send('Server error');
  }
});

// POST /api/visits/:id/activate
router.post('/:id/activate', async (req, res) => {
  const { id } = req.params;
  const { rfid_tag, badge_type, qr_code } = req.body;
  const useBadge = badge_type === 'qr' ? 'qr' : 'rfid';

  console.log(`[Activate] visitId=${id} badge_type=${useBadge} rfid_tag=${rfid_tag} qr_code_present=${!!qr_code} qr_code_length=${qr_code ? qr_code.length : 0}`);

  const CANONICAL_TAGS = Array.from({ length: 10 }, (_, i) =>
    `VISITOR-${String(i + 1).padStart(2, '0')}`
  );

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Guard: prevent duplicate check-in on same visit
    const { rows: dupCheckRows } = await client.query(
      'SELECT status FROM visits WHERE id=$1',
      [id]
    );
    if (dupCheckRows.length > 0 && dupCheckRows[0].status === 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'Visitor is already checked in.' });
    }
    if (dupCheckRows.length > 0 && dupCheckRows[0].status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'This visit has already been completed.' });
    }

        const { rows: visitRows } = await client.query('SELECT name FROM visits WHERE id=$1', [id]);
    if (visitRows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`[Activate] Visit not found: id=${id}`);
      return res.status(404).json({ ok: false, error: 'Visit not found' });
    }
    const visitorName = visitRows[0].name;
    console.log(`[Activate] Visit found: name=${visitorName}`);

    let assignedTag = null;

    if (useBadge === 'rfid') {
      console.log(`[Activate] RFID mode: fetching available cards...`);
      const { rows: dbRows } = await client.query(
        'SELECT tag, available, assigned_to_visit FROM rfid_cards WHERE tag = ANY($1::text[]) FOR UPDATE',
        [CANONICAL_TAGS]
      );

      const dbMap = {};
      dbRows.forEach(r => { dbMap[r.tag] = r; });
      console.log(`[Activate] Found ${dbRows.length} RFID cards in DB`);

      for (let i = 1; i <= 10; i++) {
        const tag = `VISITOR-${String(i).padStart(2, '0')}`;
        const dbRow = dbMap[tag];
        if (!dbRow || dbRow.available === true) {
          assignedTag = tag;
          break;
        }
      }

      if (!assignedTag) {
        await client.query('ROLLBACK');
        console.error(`[Activate] No RFID cards available`);
        return res.status(400).json({ ok: false, error: 'No RFID cards available currently.' });
      }

      console.log(`[Activate] Assigning RFID tag: ${assignedTag}`);

      const dbRow = dbMap[assignedTag];
      if (!dbRow) {
        await client.query(
          `INSERT INTO rfid_cards (tag, label, available, assigned_to_visit, assigned_to_name)
           VALUES ($1, $2, FALSE, $3, $4)`,
          [assignedTag, `Visitor ${parseInt(assignedTag.split('-')[1], 10)}`, id, visitorName]
        );
        console.log(`[Activate] Inserted new RFID card: ${assignedTag}`);
      } else {
        await client.query(
          `UPDATE rfid_cards
           SET available=FALSE, assigned_to_visit=$1, assigned_to_name=$2
           WHERE tag=$3`,
          [id, visitorName, assignedTag]
        );
        console.log(`[Activate] Updated RFID card: ${assignedTag}`);
      }
    } else {
      console.log(`[Activate] QR Badge mode: skipping RFID assignment`);
    }

    const now = new Date();
    console.log(`[Activate] Updating visit ${id} to active, badge_type=${useBadge}`);
    await client.query(
      `UPDATE visits
       SET rfid_tag=$1, badge_type=$2, qr_code=$3, in_time=$4, status='active'
       WHERE id=$5`,
      [assignedTag, useBadge, qr_code || null, now, id]
    );

    await client.query('COMMIT');
    console.log(`[Activate] SUCCESS: visit ${id} activated, badge=${useBadge}, tag=${assignedTag}`);
    res.json({ ok: true, data: { in_time: now, rfid_tag: assignedTag, badge_type: useBadge, qr_code: qr_code || null } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Activate Error] visitId=${id} badge=${useBadge} error=${err.message}`, err);
    res.status(500).json({ ok: false, error: 'Activation failed: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/visits/:id/checkout
router.post('/:id/checkout', async (req, res) => {
  const { id } = req.params;
  const { rfid_confirmed } = req.body;

  if (!rfid_confirmed) return res.status(400).json({ ok: false, error: 'RFID confirmation required' });

  try {
    const { rows } = await db.query(
      `SELECT v.in_time, v.rfid_tag, v.badge_type, v.name, v.status, h.name as host_name
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.id=$1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Visit not found' });

    // Guard: prevent duplicate/invalid checkout
    if (rows[0].status === 'completed') {
      return res.status(409).json({ ok: false, error: 'Visitor has already been checked out.' });
    }
    if (rows[0].status === 'registered') {
      return res.status(400).json({ ok: false, error: 'Visitor has not checked in yet. Cannot checkout.' });
    }

    const visit = rows[0];
    const outTime = new Date();
    const durationMinutes = Math.round((outTime - new Date(visit.in_time)) / 60000);

    // Update visit status to completed
    await db.query(
      `UPDATE visits
       SET out_time=$1, duration_minutes=$2, status='completed', qr_status='expired'
       WHERE id=$3`,
      [outTime, durationMinutes, id]
    );

    // Release RFID card if this was an RFID visit
    if (visit.rfid_tag) {
      await db.query(
        `UPDATE rfid_cards
         SET available=TRUE, assigned_to_visit=NULL, assigned_to_name=NULL
         WHERE tag=$1`,
        [visit.rfid_tag]
      );
    }

    // Send Telegram checkout notification
    visit.out_time = outTime;
    await telegramService.sendCheckoutNotification(visit);

    res.json({ ok: true, data: { out_time: outTime, duration_minutes: durationMinutes, name: visit.name } });
  } catch (err) {
    console.error('[Checkout Error]', err);
    res.status(500).json({ ok: false, error: 'Checkout failed' });
  }
});

// GET /api/visits/search?q=&status=
router.get('/search', async (req, res) => {
  const { q, status = 'active' } = req.query;
  if (!q || q.trim() === '') return res.status(400).json({ ok: false, error: 'Search query required' });

  try {
    const { rows } = await db.query(
      `SELECT
         v.id, v.session_id, v.name, v.company, v.rfid_tag, v.in_time, v.status,
         v.visitor_type, v.team_name, v.team_count,
         h.name as host
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.status=$1
         AND (v.name ILIKE $2 OR v.rfid_tag ILIKE $2)
       ORDER BY v.in_time DESC
       LIMIT 10`,
      [status, `%${q.trim()}%`]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[Search Error]', err);
    res.status(500).json({ ok: false, error: 'Search failed' });
  }
});

// GET /api/visits/active-lookup?q=
router.get('/active-lookup', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim() === '') return res.status(400).json({ ok: false, error: 'Search query required' });

  try {
    const searchTerm = q.trim();
    const { rows } = await db.query(
      `SELECT
         v.id, v.session_id, v.name, v.company, v.rfid_tag, v.badge_type, v.in_time, v.status,
         v.visitor_type, v.team_name, v.team_count,
         h.name as host
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.status='active'
         AND (
           v.phone ILIKE $1
           OR v.email ILIKE $1
           OR v.id_number ILIKE $1
           OR v.rfid_tag ILIKE $1
           OR v.session_id ILIKE $1
           OR v.id::text ILIKE $1
         )
       ORDER BY v.in_time DESC
       LIMIT 1`,
      [`%${searchTerm}%`]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[Active Lookup Error]', err);
    res.status(500).json({ ok: false, error: 'Lookup failed' });
  }
});

// GET /api/visitor/by-phone?phone=XXXXXXXXXX
router.get('/by-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone || !phone.trim()) {
      return res.json({ ok: true, data: { visitor: null } });
    }

    const digitsOnly = String(phone).replace(/\D/g, '');
    if (digitsOnly.length < 7) {
      return res.json({ ok: true, data: { visitor: null } });
    }

    const last10 = digitsOnly.slice(-10);

    const { rows: matches } = await db.query(
      `WITH n AS (SELECT REPLACE(REPLACE(REPLACE($1, '+', ''), '-', ''), ' ', '') AS p)
       SELECT v.*, h.name AS host_name
         FROM visits v
         JOIN n ON true
         LEFT JOIN hosts h ON v.host_id = h.id
        WHERE v.status IN ('registered', 'active', 'completed')
          AND SUBSTRING(REPLACE(REPLACE(REPLACE(v.phone, '+', ''), '-', ''), ' ', ''),
                        GREATEST(LENGTH(REPLACE(REPLACE(REPLACE(v.phone, '+', ''), '-', ''), ' ', '')) - 9, 1))
            = n.p
        ORDER BY v.created_at DESC
        LIMIT 1`,
      [last10]
    );

    const visitor = matches.length > 0 ? matches[0] : null;
    res.json({ ok: true, data: { visitor } });
  } catch (err) {
    console.error('[by-phone Error]', err.message || err);
    res.status(500).json({ ok: false, error: 'Lookup failed' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: visitRows } = await db.query(
      `SELECT v.*, h.name as host_name
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.id=$1`,
      [id]
    );

    if (visitRows.length === 0) return res.status(404).json({ ok: false, error: 'Visit not found' });

    const { rows: teamRows } = await db.query(
      'SELECT name, id_type, id_number FROM team_members WHERE visit_id=$1',
      [id]
    );

    res.json({ ok: true, data: { ...visitRows[0], team_members: teamRows } });
  } catch (err) {
    console.error('[Visit Report Error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/visits/telegram/webhook - Handle Telegram callback queries
router.post('/telegram/webhook', async (req, res) => {
  try {
    const { callback_query } = req.body;
    
    if (!callback_query) {
      return res.status(400).json({ ok: false, error: 'No callback query provided' });
    }
    
    const callbackData = telegramService.handleCallbackQuery(callback_query);
    
    if (!callbackData) {
      return res.status(400).json({ ok: false, error: 'Invalid callback data' });
    }
    
    const { action, visitId, messageId, chatId } = callbackData;
    
    // Validate visit exists and is pending
    const { rows: visitRows } = await db.query(
      'SELECT name, approval_status FROM visits WHERE id=$1',
      [visitId]
    );
    
    if (visitRows.length === 0) {
      await telegramService.bot.answerCallbackQuery(callback_query.id, {
        text: 'Visitor not found or already processed',
        show_alert: true
      });
      return res.json({ ok: false, error: 'Visitor not found' });
    }
    
    const visit = visitRows[0];
    
    if (visit.approval_status !== 'pending') {
      await telegramService.bot.answerCallbackQuery(callback_query.id, {
        text: 'Visitor request already processed',
        show_alert: true
      });
      return res.json({ ok: false, error: 'Visitor request already processed' });
    }
    
    // Update visit status based on action
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db.query(
      `UPDATE visits 
       SET approval_status=$1, status=$2 
       WHERE id=$3`,
      [newStatus, newStatus, visitId]
    );
    
    // Send confirmation to Telegram
    await telegramService.sendActionConfirmation(
      chatId,
      messageId,
      action,
      visit.name
    );
    
    // Answer callback query to remove loading state
    await telegramService.bot.answerCallbackQuery(callback_query.id, {
      text: `Visitor ${action === 'approve' ? 'approved' : 'rejected'}!`
    });
    
    res.json({ ok: true, data: { action, visitId } });
  } catch (err) {
    console.error('[Telegram Webhook Error]', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// GET /api/visits/:id/pdf - Generate and download PDF report
router.get('/:id/pdf', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: visitRows } = await db.query(
      `SELECT v.*, h.name as host_name
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.id::text=$1 OR v.session_id=$1`,
      [id]
    );

    if (visitRows.length === 0) return res.status(404).json({ ok: false, error: 'Visit not found' });
    const visit = visitRows[0];

    // Sanitize filename — format: visitor_name_YYYY-MM-DD.pdf
    let sanitizedName = (visit.name || '').trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    if (!sanitizedName || sanitizedName === '_') sanitizedName = 'visitor';
    const visitDate = visit.in_time
      ? new Date(visit.in_time).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const pdfFilename = `${sanitizedName}_${visitDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);

    const pdfBuffer = await generatePuppeteerPDF(visit);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF Download Error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


async function generatePuppeteerPDF(visit) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const inT = visit.in_time ? new Date(visit.in_time).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
  const outT = visit.out_time ? new Date(visit.out_time).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
  let dur = '0';
  if (visit.in_time && visit.out_time) {
    dur = Math.round((new Date(visit.out_time) - new Date(visit.in_time)) / 60000);
  }
  
  const h = visit.host_name || '—';
  const name = visit.name || '—';
  const company = visit.company || '—';
  const purpose = visit.purpose || '—';
  const photo = visit.photo_b64 || '';
  const rfid = visit.rfid_tag || '—';
  const idType = visit.id_type || '—';
  const isTeam = visit.visitor_type === 'Team';
  const teamName = visit.team_name || '—';
  const teamCount = visit.team_count || 0;
  
  function initials(n) {
    if(!n || n === '—') return '';
    return n.split(' ').map(s=>s[0]).join('').substring(0,2).toUpperCase();
  }
  
  const iconCheck = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const iconStar = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
    :root {
      --navy: #0A1628; --blue: #2563EB; --blue-t: #EFF4FF; --blue-b: #BFDBFE;
      --green: #16A34A; --green-t: #F0FDF4; --green-b: #BBF7D0;
      --bg: #F1F5FB; --card: #FFFFFF; --text: #0F172A; --text-m: #334155; --muted: #64748B;
      --border: #E2E8F0; --r-sm: 8px;
      --font: 'Outfit', sans-serif; --mono: 'Space Mono', monospace;
    }
    body { font-family: var(--font); color: var(--text); padding: 40px; background: #fff; }
    .card { background: var(--card); border: 1px solid var(--green-b); border-radius: 12px; overflow: hidden; }
    .card-hd { background: var(--green-t); border-bottom: 1px solid var(--green-b); text-align: center; padding: 24px; }
    .success-icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: #fff; color: var(--green); border-radius: 50%; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15); margin-bottom: 12px; }
    .card-title { font-size: 20px; font-weight: 700; color: var(--green); letter-spacing: -0.3px; margin-bottom: 4px; }
    .card-sub { font-size: 13px; color: #166534; }
    .card-body { padding: 20px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--blue); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .badge-green { background: var(--green-t); color: var(--green); border: 1px solid var(--green-b); }
    .rg { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .rg-card { background: var(--bg); padding: 12px 14px; border-radius: var(--r-sm); border: 1px solid rgba(0,0,0,0.03); }
    .rg-lbl { font-size: 10.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .rg-val { font-size: 14px; font-weight: 700; color: var(--text); }
    .mono { font-family: var(--mono); color: var(--blue); font-weight: 700; letter-spacing: 0.5px; }
    .data-box { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .dr { display: flex; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .dr:last-child { border-bottom: none; }
    .dl { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; width: 110px; flex-shrink: 0; }
    .dv { font-size: 13.5px; font-weight: 600; color: var(--text-m); flex: 1; text-align: right; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-hd">
      <div class="success-icon">${iconStar}</div>
      <div class="card-title">Visit Recorded</div>
      <div class="card-sub">All data saved securely. RFID card released back to pool.</div>
    </div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:14px;padding:11px;background:var(--bg);border-radius:var(--r-sm)">
        ${photo && photo.startsWith('data:image/') ? `<img src="${photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0">` : `<div class="avatar">${initials(name)}</div>`}
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700">${name}</div>
          <div style="font-size:11px;color:var(--muted)">${company} &middot; ${purpose}</div>
        </div>
        <span class="badge badge-green">${iconCheck} Done</span>
      </div>
      <div class="rg">
        <div class="rg-card"><div class="rg-lbl">Check-in</div><div class="rg-val mono">${inT}</div></div>
        <div class="rg-card"><div class="rg-lbl">Check-out</div><div class="rg-val mono">${outT}</div></div>
        <div class="rg-card"><div class="rg-lbl">Duration</div><div class="rg-val">${dur} min</div></div>
        <div class="rg-card"><div class="rg-lbl">RFID Card</div><div class="rg-val mono" style="font-size:10px">${rfid}</div></div>
      </div>
      <div class="data-box">
        <div class="dr"><div class="dl">Host</div><div class="dv">${h}</div></div>
        ${isTeam ? `<div class="dr"><div class="dl">Visitor Type</div><div class="dv">Team</div></div>
          <div class="dr"><div class="dl">Team Name</div><div class="dv">${teamName}</div></div>
          <div class="dr"><div class="dl">Team Count</div><div class="dv">${teamCount}</div></div>` : ''}
        <div class="dr"><div class="dl">ID Type</div><div class="dv">${idType}</div></div>
        <div class="dr"><div class="dl">Agreement</div><div class="dv"><span class="badge badge-green">${iconCheck} Signed</span></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;
  
  await page.setContent(html, { waitUntil: 'networkidle2' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return Buffer.from(pdfBuffer);
}

// GET /api/badge/:visitId - Badge lookup page (for QR scan)
router.get('/badge/:visitId', async (req, res) => {
  const { visitId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT v.id, v.name, v.company, v.purpose, v.in_time, v.out_time, v.status, v.badge_type, v.qr_status, v.rfid_tag,
              h.name as host_name
       FROM visits v
       LEFT JOIN hosts h ON v.host_id = h.id
       WHERE v.id = $1`,
      [visitId]
    );
    if (rows.length === 0) {
      return res.status(404).send('Badge not found');
    }
    const visit = rows[0];
    const isActive = visit.status === 'active';
    const isExpired = visit.qr_status === 'expired';
    const badgeType = visit.badge_type || 'rfid';
    const statusLabel = isExpired ? 'Expired' : (isActive ? 'Active' : visit.status);
    const statusColor = isExpired ? '#dc2626' : (isActive ? '#16a34a' : '#64748b');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visitor Badge - ${visit.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Outfit', Arial, sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .badge-page { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; width: 100%; overflow: hidden; }
    .badge-header { background: #0a1628; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
    .badge-header-title { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .badge-header-date { font-family: monospace; font-size: 10px; color: rgba(255,255,255,0.5); }
    .badge-body { padding: 20px; display: flex; gap: 16px; align-items: center; }
    .badge-photo { width: 72px; height: 72px; border-radius: 10px; background: #e2e8f0; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #64748b; }
    .badge-info { flex: 1; }
    .badge-name { font-size: 20px; font-weight: 700; color: #0a1628; margin-bottom: 4px; }
    .badge-company { font-size: 13px; color: #64748b; margin-bottom: 10px; }
    .badge-purpose { background: #eff4ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 3px 12px; border-radius: 14px; font-size: 11px; font-weight: 600; display: inline-block; }
    .badge-footer { background: #f8fafc; padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .badge-host { font-size: 11px; color: #94a3b8; }
    .badge-rfid { font-family: monospace; font-size: 13px; color: #2563eb; font-weight: 700; letter-spacing: 1px; }
    .badge-status { display: flex; align-items: center; justify-content: center; padding: 12px 20px; border-top: 1px solid #e2e8f0; gap: 8px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; }
    .status-text { font-size: 13px; font-weight: 600; color: ${statusColor}; }
    .badge-meta { padding: 14px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
    .meta-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
    .meta-label { color: #94a3b8; }
    .meta-value { color: #334155; font-weight: 500; }
    .checkout-btn { display: block; width: calc(100% - 40px); margin: 16px 20px 20px; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; }
    .checkout-btn:hover { background: #b91c1c; }
    .checkout-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .expired-note { text-align: center; padding: 10px 20px 20px; font-size: 11px; color: #dc2626; }
  </style>
</head>
<body>
  <div class="badge-page">
    <div class="badge-header">
      <span class="badge-header-title">VISITOR BADGE</span>
      <span class="badge-header-date">${visit.in_time ? new Date(visit.in_time).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : '—'}</span>
    </div>
    <div class="badge-body">
      <div class="badge-photo">?</div>
      <div class="badge-info">
        <div class="badge-name">${visit.name}</div>
        <div class="badge-company">${visit.company || '—'}</div>
        <span class="badge-purpose">${visit.purpose || 'Visit'}</span>
      </div>
    </div>
    <div class="badge-footer">
      <span class="badge-host">Host: ${visit.host_name || '—'}</span>
      <span class="badge-rfid">${badgeType === 'qr' ? 'QR BADGE' : (visit.rfid_tag || '—')}</span>
    </div>
    <div class="badge-status">
      <span class="status-dot"></span>
      <span class="status-text">${statusLabel}</span>
    </div>
    <div class="badge-meta">
      <div class="meta-row"><span class="meta-label">Visit ID</span><span class="meta-value">${visit.id}</span></div>
      <div class="meta-row"><span class="meta-label">Badge Type</span><span class="meta-value">${badgeType.toUpperCase()}</span></div>
      <div class="meta-row"><span class="meta-label">Check-in</span><span class="meta-value">${visit.in_time ? new Date(visit.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
      ${visit.out_time ? `<div class="meta-row"><span class="meta-label">Check-out</span><span class="meta-value">${new Date(visit.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>` : ''}
    </div>
    ${isActive && !isExpired ? `
      <button class="checkout-btn" onclick="checkoutBadge('${visit.id}')">Checkout</button>
    ` : ''}
    ${isExpired ? '<div class="expired-note">This badge has expired. Scan rejected.</div>' : ''}
  </div>
  <script>
    function fmtD(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }
    function fmtT(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    async function checkoutBadge(visitId) {
      if (!confirm('Confirm checkout for this visit?')) return;
      try {
        const res = await fetch('/api/visits/' + visitId + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rfid_confirmed: true }) });
        const data = await res.json();
        if (data.ok) {
          alert('Checkout successful!');
          window.location.href = '/';
        } else {
          alert('Checkout failed: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Checkout error: ' + e.message);
      }
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[Badge Lookup Error]', err);
    res.status(500).send('Error loading badge');
  }
});

module.exports = router;
