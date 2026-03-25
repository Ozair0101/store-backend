const fs = require('fs');
const pool = require('../config/db');

async function runInit() {
  const sql = fs.readFileSync('./db/init.sql').toString();

  try {
    await pool.query(sql);
    console.log('Database initialized!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
// run this command: node db/initDb.js
runInit();