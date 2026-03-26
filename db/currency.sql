-- ═══════════════════════════════════════════════
-- Multi-Currency Support
-- ═══════════════════════════════════════════════

-- Exchange rates (rate = how many AFN per 1 unit of this currency)
-- e.g. USD rate_to_afn = 71 means 1 USD = 71 AFN
CREATE TABLE IF NOT EXISTS exchange_rates (
  rate_id     SERIAL PRIMARY KEY,
  currency    VARCHAR(10) NOT NULL UNIQUE,
  rate_to_afn DECIMAL(14,4) NOT NULL,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Seed default rates
INSERT INTO exchange_rates (currency, rate_to_afn) VALUES
  ('AFN', 1),
  ('USD', 71),
  ('IRR', 0.0017),
  ('PKR', 0.25)
ON CONFLICT (currency) DO NOTHING;

-- Add currency column to sales_orders (default AFN for existing data)
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AFN';

-- Add currency column to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AFN';

-- Add currency column to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AFN';
