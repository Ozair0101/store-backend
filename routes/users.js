const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// All routes require auth + admin
router.use(auth, adminOnly);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.full_name, u.role_id, r.role_name, u.created_at, u.last_login
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       ORDER BY u.user_id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.full_name, u.role_id, r.role_name, u.created_at, u.last_login
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, full_name, role_id } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, username, full_name, role_id, created_at`,
      [username, password_hash, full_name || null, role_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const { username, password, full_name, role_id } = req.body;

    let query, params;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);
      query = `UPDATE users SET username = $1, password_hash = $2, full_name = $3, role_id = $4
               WHERE user_id = $5
               RETURNING user_id, username, full_name, role_id, created_at`;
      params = [username, password_hash, full_name, role_id, req.params.id];
    } else {
      query = `UPDATE users SET username = $1, full_name = $2, role_id = $3
               WHERE user_id = $4
               RETURNING user_id, username, full_name, role_id, created_at`;
      params = [username, full_name, role_id, req.params.id];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE user_id = $1 RETURNING user_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
