const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const result = await pool.query(
      `SELECT u.*, r.role_name, r.permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role_id: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role_id: user.role_id,
        role_name: user.role_name,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, full_name, role_id } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const existing = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role_id)
       VALUES ($1, $2, $3, $4) RETURNING user_id, username, full_name, role_id, created_at`,
      [username, password_hash, full_name || null, role_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      user_id: req.user.user_id,
      username: req.user.username,
      full_name: req.user.full_name,
      role_id: req.user.role_id,
      role_name: req.user.role_name,
      permissions: req.user.permissions,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
