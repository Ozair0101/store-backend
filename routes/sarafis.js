const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

/* ════════════════════════════════════════════
   SARAFI CRUD
   ════════════════════════════════════════════ */

// GET /api/sarafis
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sarafis ORDER BY sarafi_id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get sarafis error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/sarafis/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sarafis WHERE sarafi_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sarafi not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get sarafi error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/sarafis
router.post('/', async (req, res) => {
  try {
    const { name, contact_person, phone, address, notes, currency } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const result = await pool.query(
      `INSERT INTO sarafis (name, contact_person, phone, address, notes, currency)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, contact_person || null, phone || null, address || null, notes || null, currency || 'AFN']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create sarafi error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/sarafis/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, contact_person, phone, address, notes, currency } = req.body;
    const result = await pool.query(
      `UPDATE sarafis SET name=$1, contact_person=$2, phone=$3, address=$4, notes=$5, currency=$6
       WHERE sarafi_id=$7 RETURNING *`,
      [name, contact_person || null, phone || null, address || null, notes || null, currency || 'AFN', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sarafi not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update sarafi error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/sarafis/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sarafis WHERE sarafi_id=$1 RETURNING sarafi_id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sarafi not found.' });
    res.json({ message: 'Sarafi deleted.' });
  } catch (err) {
    console.error('Delete sarafi error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ════════════════════════════════════════════
   SARAFI TRANSACTIONS (LEDGER)
   ════════════════════════════════════════════ */

// GET /api/sarafis/:id/transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT st.*, a.name AS account_name, u.full_name AS user_name
       FROM sarafi_transactions st
       LEFT JOIN accounts a ON st.account_id = a.account_id
       LEFT JOIN users u ON st.user_id = u.user_id
       WHERE st.sarafi_id = $1
       ORDER BY st.sarafi_tx_id DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get sarafi transactions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/sarafis/:id/transactions
// Body: { type, amount, account_id?, reference?, description? }
//
// type = deposit:          We give money TO sarafi   → our account -, sarafi balance +
// type = withdrawal:       We take money FROM sarafi → our account +, sarafi balance -
// type = supplier_payment: Sarafi pays our supplier  → sarafi balance - (no account effect)
// type = customer_receipt:  Customer pays via sarafi  → sarafi balance + (no account effect)
// type = exchange:         Manual adjustment          → sarafi balance adjusted
router.post('/:id/transactions', async (req, res) => {
  const client = await pool.connect();
  try {
    const sarafi_id = req.params.id;
    const { type, amount, account_id, reference, description } = req.body;

    if (!type || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Type and positive amount are required.' });
    }

    const validTypes = ['deposit', 'withdrawal', 'supplier_payment', 'customer_receipt', 'exchange'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Verify sarafi exists
    const sarafiCheck = await client.query('SELECT * FROM sarafis WHERE sarafi_id = $1', [sarafi_id]);
    if (sarafiCheck.rows.length === 0) return res.status(404).json({ error: 'Sarafi not found.' });

    await client.query('BEGIN');

    // 1) Insert the sarafi transaction
    const txResult = await client.query(
      `INSERT INTO sarafi_transactions (sarafi_id, type, amount, currency, account_id, reference, description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [sarafi_id, type, amount, sarafiCheck.rows[0].currency, account_id || null, reference || null, description || null, req.user.user_id]
    );

    // 2) Update sarafi balance
    //    deposit / customer_receipt → sarafi owes us MORE → balance +
    //    withdrawal / supplier_payment → sarafi owes us LESS → balance -
    const balanceDirection = (type === 'deposit' || type === 'customer_receipt') ? '+' : '-';
    await client.query(
      `UPDATE sarafis SET balance = balance ${balanceDirection} $1 WHERE sarafi_id = $2`,
      [amount, sarafi_id]
    );

    // 3) Update our account balance (only for deposit / withdrawal)
    if (account_id && (type === 'deposit' || type === 'withdrawal')) {
      if (type === 'deposit') {
        // We give money to sarafi → our account decreases
        await client.query('UPDATE accounts SET balance = balance - $1 WHERE account_id = $2', [amount, account_id]);
        await client.query(
          `INSERT INTO transactions (account_id, amount, type, reference, user_id)
           VALUES ($1, $2, 'expense', $3, $4)`,
          [account_id, amount, `صرافی واریز: ${sarafiCheck.rows[0].name}`, req.user.user_id]
        );
      } else if (type === 'withdrawal') {
        // We receive money from sarafi → our account increases
        await client.query('UPDATE accounts SET balance = balance + $1 WHERE account_id = $2', [amount, account_id]);
        await client.query(
          `INSERT INTO transactions (account_id, amount, type, reference, user_id)
           VALUES ($1, $2, 'income', $3, $4)`,
          [account_id, amount, `صرافی دریافت: ${sarafiCheck.rows[0].name}`, req.user.user_id]
        );
      }
    }

    await client.query('COMMIT');

    // Return the transaction with updated sarafi balance
    const updated = await pool.query('SELECT balance FROM sarafis WHERE sarafi_id = $1', [sarafi_id]);
    res.status(201).json({
      ...txResult.rows[0],
      new_balance: updated.rows[0].balance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create sarafi transaction error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
