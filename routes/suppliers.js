const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/suppliers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY supplier_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get suppliers error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE supplier_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get supplier error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, payment_terms } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required.' });
    }
    const result = await pool.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, payment_terms)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, contact_person || null, phone || null, email || null, address || null, payment_terms || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create supplier error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, payment_terms } = req.body;
    const result = await pool.query(
      `UPDATE suppliers SET name = $1, contact_person = $2, phone = $3, email = $4, address = $5, payment_terms = $6
       WHERE supplier_id = $7 RETURNING *`,
      [name, contact_person || null, phone || null, email || null, address || null, payment_terms || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update supplier error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM suppliers WHERE supplier_id = $1 RETURNING supplier_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    res.json({ message: 'Supplier deleted successfully.' });
  } catch (err) {
    console.error('Delete supplier error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
