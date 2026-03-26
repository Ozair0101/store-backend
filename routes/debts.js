const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/debts
// Returns all receivables (others owe us) and payables (we owe others)
router.get('/', async (req, res) => {
  try {
    // 1. Customers who owe us (partial/pending sales)
    const salesResult = await pool.query(`
      SELECT
        so.sale_id,
        so.invoice_number,
        so.total_amount::numeric,
        so.discount_amount::numeric,
        so.paid_amount::numeric,
        (so.total_amount::numeric - so.discount_amount::numeric - so.paid_amount::numeric) AS remaining,
        so.status,
        so.date,
        c.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.customer_id
      WHERE so.status IN ('partial', 'pending')
        AND (so.total_amount::numeric - so.discount_amount::numeric - so.paid_amount::numeric) > 0
      ORDER BY remaining DESC
    `);

    // 2. Suppliers we owe (partial/pending purchases)
    const purchasesResult = await pool.query(`
      SELECT
        po.purchase_id,
        po.invoice_number,
        po.total_amount::numeric,
        po.paid_amount::numeric,
        (po.total_amount::numeric - po.paid_amount::numeric) AS remaining,
        po.status,
        po.created_at,
        po.due_date,
        s.supplier_id,
        s.name AS supplier_name,
        s.phone AS supplier_phone
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
      WHERE po.status IN ('partial', 'pending')
        AND (po.total_amount::numeric - po.paid_amount::numeric) > 0
      ORDER BY remaining DESC
    `);

    // 3. Sarafi balances (positive = they owe us, negative = we owe them)
    const sarafiResult = await pool.query(`
      SELECT sarafi_id, name, phone, balance::numeric, currency
      FROM sarafis
      WHERE balance::numeric != 0
      ORDER BY ABS(balance::numeric) DESC
    `);

    // Build receivables (others owe us)
    const receivables = [];
    // From sales
    for (const s of salesResult.rows) {
      receivables.push({
        type: 'sale',
        id: s.sale_id,
        label: s.customer_name || 'مشتری حضوری',
        phone: s.customer_phone || null,
        reference: s.invoice_number ? `فاکتور ${s.invoice_number}` : `فروش #${s.sale_id}`,
        amount: Number(s.remaining),
        total: Number(s.total_amount) - Number(s.discount_amount),
        paid: Number(s.paid_amount),
        date: s.date,
        link: `/sales/${s.sale_id}`,
      });
    }
    // From sarafis (positive balance = they owe us)
    for (const sr of sarafiResult.rows) {
      if (Number(sr.balance) > 0) {
        receivables.push({
          type: 'sarafi',
          id: sr.sarafi_id,
          label: sr.name,
          phone: sr.phone || null,
          reference: `صرافی`,
          amount: Number(sr.balance),
          total: null,
          paid: null,
          date: null,
          currency: sr.currency,
          link: `/sarafis/${sr.sarafi_id}`,
        });
      }
    }

    // Build payables (we owe others)
    const payables = [];
    // From purchases
    for (const p of purchasesResult.rows) {
      payables.push({
        type: 'purchase',
        id: p.purchase_id,
        label: p.supplier_name || 'تامین‌کننده نامشخص',
        phone: p.supplier_phone || null,
        reference: p.invoice_number ? `فاکتور ${p.invoice_number}` : `خرید #${p.purchase_id}`,
        amount: Number(p.remaining),
        total: Number(p.total_amount),
        paid: Number(p.paid_amount),
        date: p.created_at,
        due_date: p.due_date,
        link: `/purchases/${p.purchase_id}`,
      });
    }
    // From sarafis (negative balance = we owe them)
    for (const sr of sarafiResult.rows) {
      if (Number(sr.balance) < 0) {
        payables.push({
          type: 'sarafi',
          id: sr.sarafi_id,
          label: sr.name,
          phone: sr.phone || null,
          reference: `صرافی`,
          amount: Math.abs(Number(sr.balance)),
          total: null,
          paid: null,
          date: null,
          currency: sr.currency,
          link: `/sarafis/${sr.sarafi_id}`,
        });
      }
    }

    // Totals
    const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);
    const totalPayable = payables.reduce((s, p) => s + p.amount, 0);

    res.json({
      receivables,
      payables,
      summary: {
        total_receivable: totalReceivable,
        total_payable: totalPayable,
        net: totalReceivable - totalPayable,
        receivable_count: receivables.length,
        payable_count: payables.length,
      },
    });
  } catch (err) {
    console.error('Get debts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/debts/count — lightweight endpoint for notification badge
router.get('/count', async (req, res) => {
  try {
    const sales = await pool.query(
      "SELECT COUNT(*) AS c FROM sales_orders WHERE status IN ('partial','pending') AND (total_amount::numeric - discount_amount::numeric - paid_amount::numeric) > 0"
    );
    const purchases = await pool.query(
      "SELECT COUNT(*) AS c FROM purchase_orders WHERE status IN ('partial','pending') AND (total_amount::numeric - paid_amount::numeric) > 0"
    );
    const sarafis = await pool.query(
      "SELECT COUNT(*) AS c FROM sarafis WHERE balance::numeric != 0"
    );
    const total = Number(sales.rows[0].c) + Number(purchases.rows[0].c) + Number(sarafis.rows[0].c);
    res.json({ count: total });
  } catch (err) {
    console.error('Get debts count error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
