const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, department FROM hosts ORDER BY name'
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[Hosts Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to load hosts' });
  }
});

module.exports = router;

