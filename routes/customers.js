const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY customer_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE customer_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get customer error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, address, is_regular } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    const result = await pool.query(
      `INSERT INTO customers (name, phone, email, address, is_regular)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, phone || null, email || null, address || null, is_regular || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, address, is_regular } = req.body;
    const result = await pool.query(
      `UPDATE customers SET name = $1, phone = $2, email = $3, address = $4, is_regular = $5
       WHERE customer_id = $6 RETURNING *`,
      [name, phone || null, email || null, address || null, is_regular || false, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE customer_id = $1 RETURNING customer_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json({ message: 'Customer deleted successfully.' });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
