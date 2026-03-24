const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY category_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE category_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get category error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/categories
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE categories SET name = $1, description = $2 WHERE category_id = $3 RETURNING *',
      [name, description || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM categories WHERE category_id = $1 RETURNING category_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ message: 'Category deleted successfully.' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
