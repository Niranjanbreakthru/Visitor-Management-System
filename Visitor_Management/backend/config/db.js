const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

pool.on('connect', () => {
  console.log('[DB] New client connected');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  testConnection: async () => {
    try {
      const res = await pool.query('SELECT NOW() as server_time');
      console.log('[DB] Connected ✓  Server time:', res.rows[0].server_time);
      return true;
    } catch (err) {
      console.error('[DB] Connection failed ✗');
      console.error('Error:', err.message);
      return false;
    }
  },
};

