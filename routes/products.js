const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
       ORDER BY p.product_id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/products/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
       WHERE p.stock_quantity < 10
       ORDER BY p.stock_quantity ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get low stock error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
       WHERE p.barcode = $1`,
      [req.params.barcode]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product by barcode error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
       WHERE p.product_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { barcode, name, category_id, purchase_price, sale_price, stock_quantity, unit, supplier_id } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Product name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO products (barcode, name, category_id, purchase_price, sale_price, stock_quantity, unit, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [barcode || null, name, category_id || null, purchase_price || 0, sale_price || 0, stock_quantity || 0, unit || null, supplier_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Barcode already exists.' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { barcode, name, category_id, purchase_price, sale_price, stock_quantity, unit, supplier_id } = req.body;

    const result = await pool.query(
      `UPDATE products
       SET barcode = $1, name = $2, category_id = $3, purchase_price = $4,
           sale_price = $5, stock_quantity = $6, unit = $7, supplier_id = $8
       WHERE product_id = $9
       RETURNING *`,
      [barcode || null, name, category_id || null, purchase_price || 0, sale_price || 0, stock_quantity || 0, unit || null, supplier_id || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Barcode already exists.' });
    }
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE product_id = $1 RETURNING product_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
