const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

/*
  IMPORTANT: All monetary sums use exchange rates to convert to AFN (base currency).
  Formula: amount * COALESCE(er.rate_to_afn, 1)
  This ensures 100 USD * 71 = 7100 AFN in reports.
*/

// GET /api/reports/sales-summary
router.get('/sales-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const conditions = [];

    if (from) { params.push(from); conditions.push(`so.date >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`so.date <= $${params.length}`); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         ROUND(COALESCE(SUM(so.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_sales,
         ROUND(COALESCE(SUM(so.discount_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_discounts,
         ROUND(COALESCE(SUM(so.paid_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_received,
         ROUND(COALESCE(SUM((so.total_amount - so.discount_amount - so.paid_amount) * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_outstanding
       FROM sales_orders so
       LEFT JOIN exchange_rates er ON so.currency = er.currency
       ${where}`,
      params
    );

    // Daily breakdown
    const dailyResult = await pool.query(
      `SELECT
         so.date::date AS day,
         COUNT(*) AS orders,
         ROUND(COALESCE(SUM(so.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS sales,
         ROUND(COALESCE(SUM(so.paid_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS received
       FROM sales_orders so
       LEFT JOIN exchange_rates er ON so.currency = er.currency
       ${where}
       GROUP BY so.date::date
       ORDER BY day DESC`,
      params
    );

    res.json({
      summary: result.rows[0],
      daily: dailyResult.rows,
    });
  } catch (err) {
    console.error('Sales summary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/reports/purchase-summary
router.get('/purchase-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const conditions = [];

    if (from) { params.push(from); conditions.push(`po.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`po.created_at <= $${params.length}`); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         ROUND(COALESCE(SUM(po.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_purchases,
         ROUND(COALESCE(SUM(po.paid_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_paid,
         ROUND(COALESCE(SUM((po.total_amount - po.paid_amount) * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_outstanding
       FROM purchase_orders po
       LEFT JOIN exchange_rates er ON po.currency = er.currency
       ${where}`,
      params
    );

    // By supplier
    const supplierResult = await pool.query(
      `SELECT
         s.name AS supplier_name,
         COUNT(*) AS orders,
         ROUND(COALESCE(SUM(po.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_amount,
         ROUND(COALESCE(SUM(po.paid_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS paid_amount
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
       LEFT JOIN exchange_rates er ON po.currency = er.currency
       ${where}
       GROUP BY s.name
       ORDER BY total_amount DESC`,
      params
    );

    res.json({
      summary: result.rows[0],
      by_supplier: supplierResult.rows,
    });
  } catch (err) {
    console.error('Purchase summary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/reports/expense-summary
router.get('/expense-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const conditions = [];

    if (from) { params.push(from); conditions.push(`e.date >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`e.date <= $${params.length}`); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_expenses,
         ROUND(COALESCE(SUM(e.amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_amount
       FROM expenses e
       LEFT JOIN exchange_rates er ON e.currency = er.currency
       ${where}`,
      params
    );

    const categoryResult = await pool.query(
      `SELECT
         e.category,
         COUNT(*) AS count,
         ROUND(COALESCE(SUM(e.amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_amount
       FROM expenses e
       LEFT JOIN exchange_rates er ON e.currency = er.currency
       ${where}
       GROUP BY e.category
       ORDER BY total_amount DESC`,
      params
    );

    res.json({
      summary: result.rows[0],
      by_category: categoryResult.rows,
    });
  } catch (err) {
    console.error('Expense summary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/reports/profit-loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const conditions_sales = [];
    const conditions_purchases = [];
    const conditions_expenses = [];

    if (from) {
      params.push(from);
      const idx = params.length;
      conditions_sales.push(`date >= $${idx}`);
      conditions_purchases.push(`created_at >= $${idx}`);
      conditions_expenses.push(`date >= $${idx}`);
    }
    if (to) {
      params.push(to);
      const idx = params.length;
      conditions_sales.push(`date <= $${idx}`);
      conditions_purchases.push(`created_at <= $${idx}`);
      conditions_expenses.push(`date <= $${idx}`);
    }

    const salesWhere = conditions_sales.length > 0 ? 'WHERE ' + conditions_sales.join(' AND ') : '';
    const purchasesWhere = conditions_purchases.length > 0 ? 'WHERE ' + conditions_purchases.join(' AND ') : '';
    const expensesWhere = conditions_expenses.length > 0 ? 'WHERE ' + conditions_expenses.join(' AND ') : '';

    const salesResult = await pool.query(
      `SELECT
         ROUND(COALESCE(SUM(so.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_sales,
         ROUND(COALESCE(SUM(so.discount_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_discounts
       FROM sales_orders so
       LEFT JOIN exchange_rates er ON so.currency = er.currency
       ${salesWhere}`,
      params
    );

    const purchasesResult = await pool.query(
      `SELECT ROUND(COALESCE(SUM(po.total_amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_purchases
       FROM purchase_orders po
       LEFT JOIN exchange_rates er ON po.currency = er.currency
       ${purchasesWhere}`,
      params
    );

    const expensesResult = await pool.query(
      `SELECT ROUND(COALESCE(SUM(e.amount * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_expenses
       FROM expenses e
       LEFT JOIN exchange_rates er ON e.currency = er.currency
       ${expensesWhere}`,
      params
    );

    const r2 = (n) => Math.round(n * 100) / 100;
    const totalSales = parseFloat(salesResult.rows[0].total_sales);
    const totalDiscounts = parseFloat(salesResult.rows[0].total_discounts);
    const totalPurchases = parseFloat(purchasesResult.rows[0].total_purchases);
    const totalExpenses = parseFloat(expensesResult.rows[0].total_expenses);
    const netSales = r2(totalSales - totalDiscounts);
    const grossProfit = r2(netSales - totalPurchases);
    const netProfit = r2(grossProfit - totalExpenses);

    res.json({
      total_sales: r2(totalSales),
      total_discounts: r2(totalDiscounts),
      net_sales: netSales,
      total_purchases: r2(totalPurchases),
      gross_profit: grossProfit,
      total_expenses: r2(totalExpenses),
      net_profit: netProfit,
    });
  } catch (err) {
    console.error('Profit loss error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/reports/top-products
router.get('/top-products', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(
      `SELECT
         p.product_id, p.name, p.barcode,
         COALESCE(SUM(soi.quantity), 0) AS total_sold,
         ROUND(COALESCE(SUM(soi.total_price * COALESCE(er.rate_to_afn, 1)), 0), 2) AS total_revenue
       FROM sales_order_items soi
       JOIN products p ON soi.product_id = p.product_id
       JOIN sales_orders so ON soi.sale_id = so.sale_id
       LEFT JOIN exchange_rates er ON so.currency = er.currency
       GROUP BY p.product_id, p.name, p.barcode
       ORDER BY total_sold DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Top products error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/reports/stock-report
router.get('/stock-report', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.product_id, p.barcode, p.name, p.stock_quantity, p.purchase_price, p.sale_price,
         (p.stock_quantity * p.purchase_price) AS stock_cost_value,
         (p.stock_quantity * p.sale_price) AS stock_sale_value,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       ORDER BY stock_cost_value DESC`
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_items += parseInt(row.stock_quantity) || 0;
        acc.total_cost_value += parseFloat(row.stock_cost_value) || 0;
        acc.total_sale_value += parseFloat(row.stock_sale_value) || 0;
        return acc;
      },
      { total_items: 0, total_cost_value: 0, total_sale_value: 0 }
    );

    res.json({
      products: result.rows,
      totals,
    });
  } catch (err) {
    console.error('Stock report error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
