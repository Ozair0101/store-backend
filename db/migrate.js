/**
 * Database Migration — like `php artisan migrate:fresh`
 * Drops ALL tables and recreates them from scratch.
 *
 * Usage:
 *   npm run migrate        — create tables (safe, uses IF NOT EXISTS)
 *   npm run migrate:fresh  — DROP all tables, then recreate
 */
require('dotenv').config();
const pool = require('../config/db');

const isFresh = process.argv.includes('--fresh');

/* ─── DROP all tables in correct order (respecting FK constraints) ─── */
const DROP_ALL = `
DROP TABLE IF EXISTS sarafi_transactions CASCADE;
DROP TABLE IF EXISTS sarafis CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS sales_order_items CASCADE;
DROP TABLE IF EXISTS sales_orders CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
`;

/* ─── CREATE all tables ─── */
const CREATE_TABLES = `
-- ═══ Roles & Users ═══
CREATE TABLE IF NOT EXISTS roles (
  role_id    SERIAL PRIMARY KEY,
  role_name  VARCHAR(50) NOT NULL UNIQUE,
  permissions JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
  user_id      SERIAL PRIMARY KEY,
  username     VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name    VARCHAR(200),
  role_id      INTEGER REFERENCES roles(role_id),
  created_at   TIMESTAMP DEFAULT NOW(),
  last_login   TIMESTAMP
);

-- ═══ Products & Inventory ═══
CREATE TABLE IF NOT EXISTS categories (
  category_id  SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id    SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200),
  phone          VARCHAR(50),
  email          VARCHAR(200),
  address        TEXT,
  payment_terms  VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS products (
  product_id     SERIAL PRIMARY KEY,
  barcode        VARCHAR(100) UNIQUE,
  name           VARCHAR(300) NOT NULL,
  category_id    INTEGER REFERENCES categories(category_id),
  purchase_price DECIMAL(12,2) DEFAULT 0,
  sale_price     DECIMAL(12,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  unit           VARCHAR(50),
  supplier_id    INTEGER REFERENCES suppliers(supplier_id),
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ═══ Customers ═══
CREATE TABLE IF NOT EXISTS customers (
  customer_id SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  phone       VARCHAR(50),
  email       VARCHAR(200),
  address     TEXT,
  is_regular  BOOLEAN DEFAULT FALSE
);

-- ═══ Purchases ═══
CREATE TABLE IF NOT EXISTS purchase_orders (
  purchase_id    SERIAL PRIMARY KEY,
  supplier_id    INTEGER REFERENCES suppliers(supplier_id),
  invoice_number VARCHAR(100),
  total_amount   DECIMAL(12,2) DEFAULT 0,
  paid_amount    DECIMAL(12,2) DEFAULT 0,
  payment_type   VARCHAR(50),
  currency       VARCHAR(10) DEFAULT 'AFN',
  status         VARCHAR(50) DEFAULT 'pending',
  created_at     TIMESTAMP DEFAULT NOW(),
  due_date       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id          SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES purchase_orders(purchase_id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(product_id),
  quantity    INTEGER NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL
);

-- ═══ Sales ═══
CREATE TABLE IF NOT EXISTS sales_orders (
  sale_id         SERIAL PRIMARY KEY,
  customer_id     INTEGER REFERENCES customers(customer_id),
  invoice_number  VARCHAR(100),
  total_amount    DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount     DECIMAL(12,2) DEFAULT 0,
  payment_type    VARCHAR(50),
  currency        VARCHAR(10) DEFAULT 'AFN',
  status          VARCHAR(50) DEFAULT 'completed',
  date            TIMESTAMP DEFAULT NOW(),
  user_id         INTEGER REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER REFERENCES sales_orders(sale_id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(product_id),
  quantity    INTEGER NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL
);

-- ═══ Stock Movements ═══
CREATE TABLE IF NOT EXISTS stock_movements (
  movement_id  SERIAL PRIMARY KEY,
  product_id   INTEGER REFERENCES products(product_id),
  quantity     INTEGER NOT NULL,
  type         VARCHAR(50) NOT NULL,
  reference_id INTEGER,
  date         TIMESTAMP DEFAULT NOW(),
  user_id      INTEGER REFERENCES users(user_id)
);

-- ═══ Expenses ═══
CREATE TABLE IF NOT EXISTS expenses (
  expense_id   SERIAL PRIMARY KEY,
  description  TEXT,
  amount       DECIMAL(12,2) NOT NULL,
  category     VARCHAR(100),
  payment_type VARCHAR(50),
  currency     VARCHAR(10) DEFAULT 'AFN',
  date         TIMESTAMP DEFAULT NOW(),
  user_id      INTEGER REFERENCES users(user_id)
);

-- ═══ Accounts & Transactions ═══
CREATE TABLE IF NOT EXISTS accounts (
  account_id SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(50),
  currency   VARCHAR(10) DEFAULT 'AFN',
  balance    DECIMAL(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id SERIAL PRIMARY KEY,
  account_id     INTEGER REFERENCES accounts(account_id),
  amount         DECIMAL(12,2) NOT NULL,
  type           VARCHAR(50) NOT NULL,
  reference      VARCHAR(200),
  date           TIMESTAMP DEFAULT NOW(),
  user_id        INTEGER REFERENCES users(user_id)
);

-- ═══ Payments (unified for sales & purchases) ═══
CREATE TABLE IF NOT EXISTS payments (
  payment_id   SERIAL PRIMARY KEY,
  entity_type  VARCHAR(50),
  entity_id    INTEGER,
  amount       DECIMAL(12,2),
  currency     VARCHAR(10) DEFAULT 'AFN',
  method       VARCHAR(50),
  account_id   INTEGER REFERENCES accounts(account_id),
  sarafi_id    INTEGER,
  account_name VARCHAR(200),
  note         TEXT,
  date         TIMESTAMP DEFAULT NOW(),
  user_id      INTEGER REFERENCES users(user_id)
);

-- ═══ Employees ═══
CREATE TABLE IF NOT EXISTS employees (
  employee_id       SERIAL PRIMARY KEY,
  full_name         VARCHAR(200) NOT NULL,
  role              VARCHAR(100),
  salary            DECIMAL(12,2) DEFAULT 0,
  payment_frequency VARCHAR(50),
  contact           VARCHAR(100),
  joined_at         TIMESTAMP DEFAULT NOW()
);

-- ═══ Sarafi (Currency Exchange) ═══
CREATE TABLE IF NOT EXISTS sarafis (
  sarafi_id      SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200),
  phone          VARCHAR(50),
  address        TEXT,
  notes          TEXT,
  balance        DECIMAL(14,2) DEFAULT 0,
  currency       VARCHAR(10) DEFAULT 'AFN',
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sarafi_transactions (
  sarafi_tx_id SERIAL PRIMARY KEY,
  sarafi_id    INTEGER NOT NULL REFERENCES sarafis(sarafi_id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  currency     VARCHAR(10) DEFAULT 'AFN',
  account_id   INTEGER REFERENCES accounts(account_id),
  reference    VARCHAR(200),
  description  TEXT,
  date         TIMESTAMP DEFAULT NOW(),
  user_id      INTEGER REFERENCES users(user_id)
);

-- ═══ Exchange Rates ═══
CREATE TABLE IF NOT EXISTS exchange_rates (
  rate_id     SERIAL PRIMARY KEY,
  currency    VARCHAR(10) NOT NULL UNIQUE,
  rate_to_afn DECIMAL(14,4) NOT NULL,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_sarafi_tx_sarafi_id ON sarafi_transactions(sarafi_id);
CREATE INDEX IF NOT EXISTS idx_sarafi_tx_date ON sarafi_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_orders(date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchase_orders(created_at DESC);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    if (isFresh) {
      console.log('🗑️  Dropping all tables...');
      await client.query(DROP_ALL);
      console.log('✅ All tables dropped.');
    }

    console.log('📦 Creating tables...');
    await client.query(CREATE_TABLES);
    console.log('✅ All tables created successfully.');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
