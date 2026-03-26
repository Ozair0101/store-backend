const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/exchange-rates
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM exchange_rates ORDER BY currency');
    res.json(result.rows);
  } catch (err) {
    console.error('Get exchange rates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/exchange-rates/:currency
router.put('/:currency', async (req, res) => {
  try {
    const { rate_to_afn } = req.body;
    if (!rate_to_afn || rate_to_afn <= 0) {
      return res.status(400).json({ error: 'Valid rate is required.' });
    }
    const result = await pool.query(
      `INSERT INTO exchange_rates (currency, rate_to_afn, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (currency) DO UPDATE SET rate_to_afn = $2, updated_at = NOW()
       RETURNING *`,
      [req.params.currency.toUpperCase(), rate_to_afn]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update exchange rate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/exchange-rates/:currency
router.delete('/:currency', async (req, res) => {
  try {
    if (req.params.currency.toUpperCase() === 'AFN') {
      return res.status(400).json({ error: 'Cannot delete base currency.' });
    }
    await pool.query('DELETE FROM exchange_rates WHERE currency = $1', [req.params.currency.toUpperCase()]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('Delete exchange rate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
