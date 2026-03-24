const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    // Total products
    const productsResult = await pool.query('SELECT COUNT(*) AS count FROM products');

    // Today's sales
    const salesResult = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
       FROM sales_orders WHERE date::date = CURRENT_DATE`
    );

    // Total customers
    const customersResult = await pool.query('SELECT COUNT(*) AS count FROM customers');

    // Low stock count (quantity < 10)
    const lowStockResult = await pool.query(
      'SELECT COUNT(*) AS count FROM products WHERE stock_quantity < 10'
    );

    // Total expenses this month
    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE date >= date_trunc('month', CURRENT_DATE)
         AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`
    );

    // Account balances
    const accountsResult = await pool.query(
      'SELECT account_id, name, currency, balance FROM accounts ORDER BY account_id'
    );

    res.json({
      total_products: parseInt(productsResult.rows[0].count),
      today_sales: {
        count: parseInt(salesResult.rows[0].count),
        total: parseFloat(salesResult.rows[0].total),
      },
      total_customers: parseInt(customersResult.rows[0].count),
      low_stock_count: parseInt(lowStockResult.rows[0].count),
      expenses_this_month: parseFloat(expensesResult.rows[0].total),
      accounts: accountsResult.rows,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
