const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', async (req, res) => {
  const db = require('./config/db');
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, status: 'healthy', db: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, status: 'unhealthy', db: 'disconnected' });
  }
});

app.use('/api/hosts', require('./routes/hosts'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/rfid', require('./routes/rfid'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Root-level /badge/:visitId — QR codes point here so must be handled
// BEFORE the SPA catch-all. Delegates to visits router badge handler.
app.get('/badge/:visitId', (req, res, next) => {
  req.url = '/badge/' + req.params.visitId;
  require('./routes/visits')(req, res, next);
});

async function migrateDb() {
  const db = require('./config/db');
  try {
    await db.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS badge_type VARCHAR(10) DEFAULT 'rfid' CHECK (badge_type IN ('rfid','qr'))`);
    await db.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS qr_code TEXT`);
    await db.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS qr_status VARCHAR(20) DEFAULT 'active' CHECK (qr_status IN ('active','expired'))`);
    console.log('[Migration] visits table columns verified/added: badge_type, qr_code, qr_status');

    const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='visits' AND column_name IN ('badge_type','qr_code','qr_status')");
    const present = cols.rows.map(r => r.column_name);
    if (present.length < 3) {
      console.error('[Migration] WARNING: Some columns missing after migration:', present);
    } else {
      console.log('[Migration] All required columns present:', present);
    }
  } catch (err) {
    console.error('[Migration] Failed:', err.message);
  }
}

migrateDb();

// Serve vms_fixed.html directly (with api-bridge injected) for root and index routes
const frontendDir = path.join(__dirname, '../frontend');

app.get(['/', '/index.html'], (req, res) => {
  const html = fs.readFileSync(path.join(frontendDir, 'vms_fixed.html'), 'utf8');
  const lastIndex = html.lastIndexOf('</body>');
  let injected = html;
  if (lastIndex !== -1) {
    injected = html.substring(0, lastIndex) + '<script src="/api-bridge.js"></script>\n</body>' + html.substring(lastIndex + 7);
  } else {
    injected += '<script src="/api-bridge.js"></script>';
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(injected);
});

app.use(express.static(frontendDir));

app.get('*', (req, res) => {
  const html = fs.readFileSync(path.join(frontendDir, 'vms_fixed.html'), 'utf8');
  const injected = html.replace('</body>', '<script src="/api-bridge.js"></script>\n</body>');
  res.setHeader('Content-Type', 'text/html');
  res.send(injected);
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const AUTO_CLOSE_HOUR = 18;
const AUTO_CLOSE_MINUTE = 30;

async function performAutoClose() {
  const db = require('./config/db');
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const { rows: activeVisits } = await db.query(
      "SELECT id, rfid_tag, badge_type FROM visits WHERE status = 'active' AND DATE(in_time) = $1",
      [today]
    );

    let rfidCount = 0;
    let qrCount = 0;

    for (const visit of activeVisits) {
      await db.query(
        "UPDATE visits SET out_time = $1, duration_minutes = $2, status = 'completed', qr_status = 'expired' WHERE id = $3",
        [now, 0, visit.id]
      );

      if (visit.badge_type === 'rfid' && visit.rfid_tag) {
        await db.query(
          "UPDATE rfid_cards SET available = TRUE, assigned_to_visit = NULL, assigned_to_name = NULL WHERE tag = $1",
          [visit.rfid_tag]
        );
        rfidCount++;
      } else if (visit.badge_type === 'qr') {
        qrCount++;
      }
    }

    if (rfidCount > 0 || qrCount > 0) {
      console.log(`[AutoClose] ${rfidCount} RFID and ${qrCount} QR badge visitors auto-checked out at ${now.toISOString()}`);
    }
  } catch (err) {
    console.error('[AutoClose Error]', err);
  }
}

function scheduleAutoClose() {
  const now = new Date();
  const target = new Date();
  target.setHours(AUTO_CLOSE_HOUR, AUTO_CLOSE_MINUTE, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const msUntilFirst = target - now;
  setTimeout(() => {
    performAutoClose().then(() => {
      setInterval(performAutoClose, 24 * 60 * 60 * 1000);
    });
  }, msUntilFirst);

  console.log(`[AutoClose] Scheduled daily auto-close at ${AUTO_CLOSE_HOUR}:${AUTO_CLOSE_MINUTE.toString().padStart(2, '0')}`);
}

scheduleAutoClose();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🚀 Breakthru.ai VMS — Node.js Backend            ║
╠══════════════════════════════════════════════════════╣
║  📡 API Server:   http://localhost:${PORT}/api      ║
║  🖥  Frontend:      http://localhost:${PORT}/        ║
║  🏥 Health Check:  http://localhost:${PORT}/api/health ║
╚══════════════════════════════════════════════════════╝
  `);
});

