const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/expenses/summary
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = `SELECT
      category,
      COUNT(*) AS count,
      COALESCE(SUM(amount), 0) AS total_amount
      FROM expenses`;
    const params = [];
    const conditions = [];

    if (from) {
      params.push(from);
      conditions.push(`date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`date <= $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY category ORDER BY total_amount DESC';

    const result = await pool.query(query, params);

    // Also get grand total
    let totalQuery = 'SELECT COALESCE(SUM(amount), 0) AS grand_total FROM expenses';
    if (conditions.length > 0) {
      totalQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const totalResult = await pool.query(totalQuery, params);

    res.json({
      categories: result.rows,
      grand_total: totalResult.rows[0].grand_total,
    });
  } catch (err) {
    console.error('Expense summary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.full_name AS user_name
       FROM expenses e
       LEFT JOIN users u ON e.user_id = u.user_id
       ORDER BY e.expense_id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.full_name AS user_name
       FROM expenses e
       LEFT JOIN users u ON e.user_id = u.user_id
       WHERE e.expense_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get expense error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const { description, amount, category, payment_type, date } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required.' });
    }

    const result = await pool.query(
      `INSERT INTO expenses (description, amount, category, payment_type, date, user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [description || null, amount, category || null, payment_type || null, date || new Date(), req.user.user_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const { description, amount, category, payment_type, date } = req.body;
    const result = await pool.query(
      `UPDATE expenses SET description = $1, amount = $2, category = $3, payment_type = $4, date = $5
       WHERE expense_id = $6 RETURNING *`,
      [description || null, amount, category || null, payment_type || null, date || new Date(), req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM expenses WHERE expense_id = $1 RETURNING expense_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    res.json({ message: 'Expense deleted successfully.' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
