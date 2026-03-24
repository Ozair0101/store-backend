const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY employee_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get employees error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees WHERE employee_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get employee error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  try {
    const { full_name, role, salary, payment_frequency, contact } = req.body;
    if (!full_name) {
      return res.status(400).json({ error: 'Employee name is required.' });
    }
    const result = await pool.query(
      `INSERT INTO employees (full_name, role, salary, payment_frequency, contact)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [full_name, role || null, salary || 0, payment_frequency || null, contact || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create employee error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const { full_name, role, salary, payment_frequency, contact } = req.body;
    const result = await pool.query(
      `UPDATE employees SET full_name = $1, role = $2, salary = $3, payment_frequency = $4, contact = $5
       WHERE employee_id = $6 RETURNING *`,
      [full_name, role || null, salary || 0, payment_frequency || null, contact || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json({ message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
