const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/purchases
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT po.*, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
       ORDER BY po.purchase_id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get purchases error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/purchases/:id
router.get('/:id', async (req, res) => {
  try {
    const orderResult = await pool.query(
      `SELECT po.*, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
       WHERE po.purchase_id = $1`,
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    const itemsResult = await pool.query(
      `SELECT poi.*, p.name AS product_name, p.barcode
       FROM purchase_order_items poi
       LEFT JOIN products p ON poi.product_id = p.product_id
       WHERE poi.purchase_id = $1`,
      [req.params.id]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error('Get purchase error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/purchases
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { supplier_id, invoice_number, payment_type, paid_amount, due_date, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required.' });
    }

    await client.query('BEGIN');

    // Calculate total
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    const actualPaid = paid_amount || 0;
    const status = actualPaid >= total_amount ? 'paid' : actualPaid > 0 ? 'partial' : 'pending';

    // Create purchase order
    const orderResult = await client.query(
      `INSERT INTO purchase_orders (supplier_id, invoice_number, total_amount, paid_amount, payment_type, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [supplier_id || null, invoice_number || null, total_amount, actualPaid, payment_type || null, status, due_date || null]
    );
    const purchase = orderResult.rows[0];

    // Insert items and update stock
    for (const item of items) {
      const item_total = item.quantity * item.unit_price;

      await client.query(
        `INSERT INTO purchase_order_items (purchase_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [purchase.purchase_id, item.product_id, item.quantity, item.unit_price, item_total]
      );

      // Update product stock
      await client.query(
        `UPDATE products SET stock_quantity = stock_quantity + $1, purchase_price = $2
         WHERE product_id = $3`,
        [item.quantity, item.unit_price, item.product_id]
      );

      // Create stock movement
      await client.query(
        `INSERT INTO stock_movements (product_id, quantity, type, reference_id, user_id)
         VALUES ($1, $2, 'purchase_in', $3, $4)`,
        [item.product_id, item.quantity, purchase.purchase_id, req.user.user_id]
      );
    }

    // Deduct paid amount from account balance
    if (actualPaid > 0 && payment_type) {
      let accountName = 'Cash';
      if (payment_type === 'bank') accountName = 'Bank';
      else if (payment_type === 'mobile') accountName = 'Mobile Wallet';

      const accountResult = await client.query(
        "SELECT account_id FROM accounts WHERE name = $1 AND currency = 'AFN' LIMIT 1",
        [accountName]
      );

      if (accountResult.rows.length > 0) {
        const account_id = accountResult.rows[0].account_id;
        await client.query(
          `INSERT INTO transactions (account_id, amount, type, reference, user_id)
           VALUES ($1, $2, 'expense', $3, $4)`,
          [account_id, actualPaid, `Purchase #${purchase.purchase_id}`, req.user.user_id]
        );
        await client.query(
          'UPDATE accounts SET balance = balance - $1 WHERE account_id = $2',
          [actualPaid, account_id]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json(purchase);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create purchase error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
});

// PUT /api/purchases/:id/payment
router.put('/:id/payment', async (req, res) => {
  const client = await pool.connect();
  try {
    const { paid_amount, payment_type } = req.body;

    const current = await client.query('SELECT * FROM purchase_orders WHERE purchase_id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    await client.query('BEGIN');

    const order = current.rows[0];
    const prevPaid = parseFloat(order.paid_amount) || 0;
    const newPaid = parseFloat(paid_amount) || 0;
    const addedAmount = newPaid - prevPaid; // only deduct the new additional payment
    const status = newPaid >= parseFloat(order.total_amount) ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

    const result = await client.query(
      `UPDATE purchase_orders SET paid_amount = $1, payment_type = $2, status = $3
       WHERE purchase_id = $4 RETURNING *`,
      [newPaid, payment_type || order.payment_type, status, req.params.id]
    );

    // Deduct additional payment from account
    if (addedAmount > 0 && payment_type) {
      let accountName = 'Cash';
      if (payment_type === 'bank') accountName = 'Bank';
      else if (payment_type === 'mobile') accountName = 'Mobile Wallet';

      const accountResult = await client.query(
        "SELECT account_id FROM accounts WHERE name = $1 AND currency = 'AFN' LIMIT 1",
        [accountName]
      );
      if (accountResult.rows.length > 0) {
        const account_id = accountResult.rows[0].account_id;
        await client.query(
          `INSERT INTO transactions (account_id, amount, type, reference, user_id)
           VALUES ($1, $2, 'expense', $3, $4)`,
          [account_id, addedAmount, `Purchase #${req.params.id} payment`, req.user.user_id]
        );
        await client.query(
          'UPDATE accounts SET balance = balance - $1 WHERE account_id = $2',
          [addedAmount, account_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update purchase payment error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
