const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/rfid/available
// Returns all 10 canonical visitor-card slots, correctly computing "available"
// by cross-checking rfid_cards.available AND whether any non-completed visit
// is still holding the tag. Tags that were accidentally deleted from the DB
// are treated as available so the /activate fallback INSERT can recover them.
const ALL_10_SLOTS = Array.from({ length: 10 }, (_, i) => ({
  tag: `VISITOR-${String(i + 1).padStart(2, '0')}`,
  label: `Visitor ${i + 1}`,
}));

router.get('/available', async (req, res) => {
  try {
    // Fetch DB state for all canonical 10 tags + status of the linked visit row
    const { rows: dbRows } = await db.query(
      `SELECT r.tag, r.available, r.assigned_to_visit, r.assigned_to_name, v.status AS visit_status
         FROM rfid_cards r
    LEFT JOIN visits v ON r.assigned_to_visit = v.id
        WHERE r.tag = ANY($1::text[])`,
      [ALL_10_SLOTS.map(s => s.tag)]
    );
    const dbMap = {};
    dbRows.forEach(r => { dbMap[r.tag] = r; });

    const cards = ALL_10_SLOTS.map(slot => {
      const db = dbMap[slot.tag];
      if (db) {
        const linkedVisitActive = db.assigned_to_visit &&
          db.visit_status !== 'completed';
        // card is free only if: (available=true AND visit is completed) OR never assigned
        const isFree = (!db.assigned_to_visit) || (!linkedVisitActive && db.available);
        return {
          tag:              slot.tag,
          label:            slot.label,
          available:        isFree,
          assigned_to_visit:  isFree ? null  : db.assigned_to_visit,
          assigned_to_name:   isFree ? null  : db.assigned_to_name,
        };
      }
      // No DB row — tag is free; /activate will INSERT on first assignment
      return {
        tag:              slot.tag,
        label:            slot.label,
        available:        true,
        assigned_to_visit:  null,
        assigned_to_name:   null,
      };
    });
    res.json({ ok: true, data: { cards } });
  } catch (err) {
    console.error('[RFID Error]', err);
    res.status(500).json({ ok: false, error: 'Failed to load RFID cards' });
  }
});

// POST /api/rfid/register (Admin)
router.post('/register', async (req, res) => {
  const { tag, label } = req.body;

  try {
    const { rows } = await db.query(
      'INSERT INTO rfid_cards (tag, label) VALUES ($1, $2) RETURNING *',
      [tag, label]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

