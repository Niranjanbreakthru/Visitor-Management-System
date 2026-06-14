const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='active') as active_visitors,
        COUNT(*) FILTER (WHERE DATE(created_at)=CURRENT_DATE) as today_visits,
        COUNT(*) FILTER (WHERE status='completed' AND DATE(out_time)=CURRENT_DATE) as today_completed,
        COALESCE(
          AVG(duration_minutes) FILTER (WHERE status='completed' AND DATE(out_time)=CURRENT_DATE),
          0
        )::INTEGER as avg_duration
      FROM visits
    `);

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/dashboard/active-sessions
router.get('/active-sessions', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        v.id, v.session_id, v.name, v.company, v.rfid_tag,
        v.in_time, v.visitor_type, v.team_name, v.team_count,
        h.name as host
      FROM visits v
      LEFT JOIN hosts h ON v.host_id = h.id
      WHERE v.status='active'
      ORDER BY v.in_time DESC
    `);

    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/dashboard/today
router.get('/today', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*, h.name as host
      FROM visits v
      LEFT JOIN hosts h ON v.host_id = h.id
      WHERE DATE(v.created_at)=CURRENT_DATE
      ORDER BY v.created_at DESC
    `);

    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/dashboard/hourly
router.get('/hourly', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        EXTRACT(HOUR FROM in_time)::INTEGER as hour,
        COUNT(*) as count
      FROM visits
      WHERE DATE(in_time)=CURRENT_DATE
        AND in_time IS NOT NULL
      GROUP BY EXTRACT(HOUR FROM in_time)
      ORDER BY hour
    `);

    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/dashboard/purpose-breakdown
router.get('/purpose-breakdown', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COALESCE(purpose,'Not specified') as purpose,
        COUNT(*) as count
      FROM visits
      WHERE DATE(created_at)=CURRENT_DATE
      GROUP BY purpose
      ORDER BY count DESC
    `);

    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

