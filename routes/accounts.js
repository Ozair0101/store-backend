const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/accounts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY account_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts WHERE account_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/accounts/:id/transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS user_name
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.user_id
       WHERE t.account_id = $1
       ORDER BY t.transaction_id DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get account transactions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/accounts
router.post('/', async (req, res) => {
  try {
    const { name, type, currency, balance } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Account name is required.' });
    }
    const result = await pool.query(
      `INSERT INTO accounts (name, type, currency, balance)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, type || null, currency || 'AFN', balance || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, type, currency, balance } = req.body;
    const result = await pool.query(
      `UPDATE accounts SET name = $1, type = $2, currency = $3, balance = $4
       WHERE account_id = $5 RETURNING *`,
      [name, type || null, currency || 'AFN', balance || 0, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update account error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM accounts WHERE account_id = $1 RETURNING account_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
