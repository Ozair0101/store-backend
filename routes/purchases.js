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
    const { supplier_id, invoice_number, payment_type, paid_amount, account_id, sarafi_id, currency, due_date, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required.' });
    }

    await client.query('BEGIN');

    // Resolve currency from account if not explicitly provided
    let purchaseCurrency = currency || 'AFN';
    if (!currency && account_id) {
      const accRes = await client.query('SELECT currency FROM accounts WHERE account_id = $1', [account_id]);
      if (accRes.rows.length > 0) purchaseCurrency = accRes.rows[0].currency;
    }

    // Calculate total
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    const actualPaid = paid_amount || 0;
    const status = actualPaid >= total_amount ? 'paid' : actualPaid > 0 ? 'partial' : 'pending';

    // Create purchase order
    const orderResult = await client.query(
      `INSERT INTO purchase_orders (supplier_id, invoice_number, total_amount, paid_amount, payment_type, status, currency, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [supplier_id || null, invoice_number || null, total_amount, actualPaid, payment_type || null, status, purchaseCurrency, due_date || null]
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

    // Deduct paid amount from account balance or record sarafi transaction
    if (actualPaid > 0) {
      if (sarafi_id) {
        // Payment via Sarafi — sarafi pays our supplier
        await client.query(
          `INSERT INTO sarafi_transactions (sarafi_id, type, amount, account_id, reference, description, user_id)
           VALUES ($1, 'supplier_payment', $2, NULL, $3, $4, $5)`,
          [sarafi_id, actualPaid, `Purchase #${purchase.purchase_id}`, 'پرداخت خرید از طریق صرافی', req.user.user_id]
        );
        await client.query(
          'UPDATE sarafis SET balance = balance - $1 WHERE sarafi_id = $2',
          [actualPaid, sarafi_id]
        );
      } else {
        let resolvedAccountId = account_id || null;
        if (!resolvedAccountId && payment_type) {
          let accountName = 'Cash';
          if (payment_type === 'bank') accountName = 'Bank';
          else if (payment_type === 'mobile') accountName = 'Mobile Wallet';
          const accountResult = await client.query(
            "SELECT account_id FROM accounts WHERE name = $1 LIMIT 1",
            [accountName]
          );
          if (accountResult.rows.length > 0) resolvedAccountId = accountResult.rows[0].account_id;
        }

        if (resolvedAccountId) {
          await client.query(
            `INSERT INTO transactions (account_id, amount, type, reference, user_id)
             VALUES ($1, $2, 'expense', $3, $4)`,
            [resolvedAccountId, actualPaid, `Purchase #${purchase.purchase_id}`, req.user.user_id]
          );
          await client.query(
            'UPDATE accounts SET balance = balance - $1 WHERE account_id = $2',
            [actualPaid, resolvedAccountId]
          );
        }
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
    const { paid_amount, payment_type, account_id, sarafi_id } = req.body;

    const current = await client.query('SELECT * FROM purchase_orders WHERE purchase_id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    await client.query('BEGIN');

    const order = current.rows[0];
    const prevPaid = parseFloat(order.paid_amount) || 0;
    const totalAmount = parseFloat(order.total_amount);
    // Cap payment to the total — never accept more than what's owed
    const newPaid = Math.min(parseFloat(paid_amount) || 0, totalAmount);
    const addedAmount = newPaid - prevPaid;
    const status = newPaid >= totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

    if (addedAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'مبلغ پرداخت باید بیشتر از مبلغ قبلی باشد.' });
    }

    const result = await client.query(
      `UPDATE purchase_orders SET paid_amount = $1, payment_type = $2, status = $3
       WHERE purchase_id = $4 RETURNING *`,
      [newPaid, payment_type || order.payment_type, status, req.params.id]
    );

    // Deduct additional payment from account or sarafi
    if (addedAmount > 0) {
      if (sarafi_id) {
        await client.query(
          `INSERT INTO sarafi_transactions (sarafi_id, type, amount, account_id, reference, description, user_id)
           VALUES ($1, 'supplier_payment', $2, NULL, $3, $4, $5)`,
          [sarafi_id, addedAmount, `Purchase #${req.params.id} payment`, 'پرداخت خرید از طریق صرافی', req.user.user_id]
        );
        await client.query(
          'UPDATE sarafis SET balance = balance - $1 WHERE sarafi_id = $2',
          [addedAmount, sarafi_id]
        );
      } else {
        let resolvedAccountId = account_id || null;
        if (!resolvedAccountId && payment_type) {
          let accountName = 'Cash';
          if (payment_type === 'bank') accountName = 'Bank';
          else if (payment_type === 'mobile') accountName = 'Mobile Wallet';
          const accountResult = await client.query(
            "SELECT account_id FROM accounts WHERE name = $1 LIMIT 1",
            [accountName]
          );
          if (accountResult.rows.length > 0) resolvedAccountId = accountResult.rows[0].account_id;
        }
        if (resolvedAccountId) {
          await client.query(
            `INSERT INTO transactions (account_id, amount, type, reference, user_id)
             VALUES ($1, $2, 'expense', $3, $4)`,
            [resolvedAccountId, addedAmount, `Purchase #${req.params.id} payment`, req.user.user_id]
          );
          await client.query(
            'UPDATE accounts SET balance = balance - $1 WHERE account_id = $2',
            [addedAmount, resolvedAccountId]
          );
        }
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
