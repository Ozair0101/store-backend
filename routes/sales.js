const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/sales/daily-summary
router.get('/daily-summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(total_amount), 0) AS total_sales,
         COALESCE(SUM(discount_amount), 0) AS total_discounts,
         COALESCE(SUM(paid_amount), 0) AS total_received
       FROM sales_orders
       WHERE date::date = CURRENT_DATE`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/sales
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT so.*, c.name AS customer_name, u.full_name AS user_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.customer_id
       LEFT JOIN users u ON so.user_id = u.user_id
       ORDER BY so.sale_id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/sales/:id
router.get('/:id', async (req, res) => {
  try {
    const orderResult = await pool.query(
      `SELECT so.*, c.name AS customer_name, u.full_name AS user_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.customer_id
       LEFT JOIN users u ON so.user_id = u.user_id
       WHERE so.sale_id = $1`,
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale order not found.' });
    }

    const itemsResult = await pool.query(
      `SELECT soi.*, p.name AS product_name, p.barcode
       FROM sales_order_items soi
       LEFT JOIN products p ON soi.product_id = p.product_id
       WHERE soi.sale_id = $1`,
      [req.params.id]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/sales
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, invoice_number, discount_amount, payment_type, paid_amount, account_id, sarafi_id, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required.' });
    }

    await client.query('BEGIN');

    // Calculate total
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    const actualDiscount = parseFloat(discount_amount) || 0;
    const finalTotal = total_amount - actualDiscount;
    const actualPaid = parseFloat(paid_amount) || finalTotal;
    const status = actualPaid >= finalTotal ? 'completed' : actualPaid > 0 ? 'partial' : 'pending';

    // Create sale order
    const orderResult = await client.query(
      `INSERT INTO sales_orders (customer_id, invoice_number, total_amount, discount_amount, paid_amount, payment_type, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [customer_id || null, invoice_number || null, total_amount, actualDiscount, actualPaid, payment_type || 'cash', status, req.user.user_id]
    );
    const sale = orderResult.rows[0];

    // Insert items and update stock
    for (const item of items) {
      const item_total = item.quantity * item.unit_price;

      // Check stock availability
      const stockCheck = await client.query(
        'SELECT stock_quantity, name FROM products WHERE product_id = $1',
        [item.product_id]
      );
      if (stockCheck.rows.length === 0) {
        throw new Error(`Product with ID ${item.product_id} not found.`);
      }
      if (stockCheck.rows[0].stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for "${stockCheck.rows[0].name}". Available: ${stockCheck.rows[0].stock_quantity}`);
      }

      await client.query(
        `INSERT INTO sales_order_items (sale_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [sale.sale_id, item.product_id, item.quantity, item.unit_price, item_total]
      );

      // Decrease product stock
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2',
        [item.quantity, item.product_id]
      );

      // Create stock movement
      await client.query(
        `INSERT INTO stock_movements (product_id, quantity, type, reference_id, user_id)
         VALUES ($1, $2, 'sale_out', $3, $4)`,
        [item.product_id, item.quantity, sale.sale_id, req.user.user_id]
      );
    }

    // Create transaction record for the payment
    if (actualPaid > 0) {
      if (sarafi_id) {
        // Payment via Sarafi — customer pays through sarafi
        await client.query(
          `INSERT INTO sarafi_transactions (sarafi_id, type, amount, account_id, reference, description, user_id)
           VALUES ($1, 'customer_receipt', $2, NULL, $3, $4, $5)`,
          [sarafi_id, actualPaid, `Sale #${sale.sale_id}`, 'دریافت فروش از طریق صرافی', req.user.user_id]
        );
        await client.query(
          'UPDATE sarafis SET balance = balance + $1 WHERE sarafi_id = $2',
          [actualPaid, sarafi_id]
        );
      } else {
        // Direct payment to account
        let resolvedAccountId = account_id || null;
        if (!resolvedAccountId) {
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
             VALUES ($1, $2, 'income', $3, $4)`,
            [resolvedAccountId, actualPaid, `Sale #${sale.sale_id}`, req.user.user_id]
          );
          await client.query(
            'UPDATE accounts SET balance = balance + $1 WHERE account_id = $2',
            [actualPaid, resolvedAccountId]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json(sale);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create sale error:', err);
    if (err.message && (err.message.includes('Insufficient stock') || err.message.includes('not found'))) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
});

// PUT /api/sales/:id/payment
router.put('/:id/payment', async (req, res) => {
  const client = await pool.connect();
  try {
    const { paid_amount, payment_type, account_id, sarafi_id } = req.body;

    const current = await client.query('SELECT * FROM sales_orders WHERE sale_id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Sale order not found.' });
    }

    await client.query('BEGIN');

    const order = current.rows[0];
    const prevPaid = parseFloat(order.paid_amount) || 0;
    const newPaid = parseFloat(paid_amount) || 0;
    const addedAmount = newPaid - prevPaid;
    const finalTotal = parseFloat(order.total_amount) - parseFloat(order.discount_amount);
    const status = newPaid >= finalTotal ? 'completed' : newPaid > 0 ? 'partial' : 'pending';

    const result = await client.query(
      `UPDATE sales_orders SET paid_amount = $1, payment_type = $2, status = $3
       WHERE sale_id = $4 RETURNING *`,
      [newPaid, payment_type || order.payment_type, status, req.params.id]
    );

    // Record financial effect for the additional payment
    if (addedAmount > 0) {
      if (sarafi_id) {
        await client.query(
          `INSERT INTO sarafi_transactions (sarafi_id, type, amount, account_id, reference, description, user_id)
           VALUES ($1, 'customer_receipt', $2, NULL, $3, $4, $5)`,
          [sarafi_id, addedAmount, `Sale #${req.params.id} payment`, 'دریافت بقیه فروش از طریق صرافی', req.user.user_id]
        );
        await client.query('UPDATE sarafis SET balance = balance + $1 WHERE sarafi_id = $2', [addedAmount, sarafi_id]);
      } else if (account_id) {
        await client.query(
          `INSERT INTO transactions (account_id, amount, type, reference, user_id)
           VALUES ($1, $2, 'income', $3, $4)`,
          [account_id, addedAmount, `Sale #${req.params.id} payment`, req.user.user_id]
        );
        await client.query('UPDATE accounts SET balance = balance + $1 WHERE account_id = $2', [addedAmount, account_id]);
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update sale payment error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
