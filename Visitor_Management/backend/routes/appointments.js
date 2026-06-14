const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/appointments/lookup?code=XXX
router.get('/lookup', async (req, res) => {
  const { code } = req.query;
  if (!code || code.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Appointment code required' });
  }

  try {
    const { rows } = await db.query(
      `SELECT
        a.id as appointment_id,
        a.code,
        a.visitor_name as name,
        a.company,
        a.phone,
        a.email,
        a.purpose,
        a.host_id,
        h.name as host_name,
        a.scheduled_date
       FROM appointments a
       LEFT JOIN hosts h ON a.host_id = h.id
       WHERE a.code = $1`,
      [code.trim()]
    );

    if (rows.length === 0) return res.json({ ok: true, found: false });
    res.json({ ok: true, found: true, data: rows[0] });
  } catch (err) {
    console.error('[Appointment Lookup Error]', err);
    res.status(500).json({ ok: false, error: 'Lookup failed' });
  }
});

// POST /api/appointments (Admin)
router.post('/', async (req, res) => {
  const { code, visitor_name, company, phone, email, purpose, host_id, scheduled_date } = req.body;

  // Email validation - optional field but must be valid if provided
  if (email && email.trim() !== '') {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO appointments
        (code, visitor_name, company, phone, email, purpose, host_id, scheduled_date, host_name)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT name FROM hosts WHERE id=$7))
       RETURNING *`,
      [code, visitor_name, company || '', phone, email || '', purpose || '', host_id || null, scheduled_date || null]
    );

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[Create Appointment Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to create appointment' });
  }
});

module.exports = router;

