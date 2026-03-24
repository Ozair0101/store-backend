-- Store MIS Database Schema

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  permissions JSONB DEFAULT '{}'
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200),
  role_id INTEGER REFERENCES roles(role_id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  category_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200),
  phone VARCHAR(50),
  email VARCHAR(200),
  address TEXT,
  payment_terms VARCHAR(100)
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  product_id SERIAL PRIMARY KEY,
  barcode VARCHAR(100) UNIQUE,
  name VARCHAR(300) NOT NULL,
  category_id INTEGER REFERENCES categories(category_id),
  purchase_price DECIMAL(12,2) DEFAULT 0,
  sale_price DECIMAL(12,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  unit VARCHAR(50),
  supplier_id INTEGER REFERENCES suppliers(supplier_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  customer_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(200),
  address TEXT,
  is_regular BOOLEAN DEFAULT FALSE
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  purchase_id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(supplier_id),
  invoice_number VARCHAR(100),
  total_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  payment_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  due_date TIMESTAMP
);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES purchase_orders(purchase_id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(product_id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL
);

-- Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  sale_id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(customer_id),
  invoice_number VARCHAR(100),
  total_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  payment_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'completed',
  date TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(user_id)
);

-- Sales Order Items
CREATE TABLE IF NOT EXISTS sales_order_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales_orders(sale_id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(product_id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL
);

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
  movement_id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(product_id),
  quantity INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id INTEGER,
  date TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(user_id)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  expense_id SERIAL PRIMARY KEY,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(100),
  payment_type VARCHAR(50),
  date TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(user_id)
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  account_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50),
  currency VARCHAR(10) DEFAULT 'AFN',
  balance DECIMAL(12,2) DEFAULT 0
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(account_id),
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference VARCHAR(200),
  date TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(user_id)
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  employee_id SERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  role VARCHAR(100),
  salary DECIMAL(12,2) DEFAULT 0,
  payment_frequency VARCHAR(50),
  contact VARCHAR(100),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- ========== SEED DATA ==========

-- Default Roles
INSERT INTO roles (role_name, permissions) VALUES
  ('Admin', '{"all": true}'),
  ('Manager', '{"products": true, "sales": true, "purchases": true, "reports": true, "employees": true, "expenses": true}'),
  ('Cashier', '{"sales": true, "products": {"read": true}}'),
  ('Stocker', '{"products": true, "purchases": true, "stock": true}'),
  ('Accountant', '{"expenses": true, "accounts": true, "reports": true, "transactions": true}')
ON CONFLICT (role_name) DO NOTHING;

-- Default Admin User (password: admin123)
INSERT INTO users (username, password_hash, full_name, role_id) VALUES
  ('admin', '$2b$10$Q8xz5tbOet8qxafgZSg1FOIp.YSt/dI.vol/A4E/j0mgGSdGB/3nu', 'System Administrator', 1)
ON CONFLICT (username) DO NOTHING;

-- Default Accounts
INSERT INTO accounts (name, type, currency, balance) VALUES
  ('Cash', 'cash', 'AFN', 0),
  ('Bank', 'bank', 'AFN', 0),
  ('Mobile Wallet', 'mobile', 'AFN', 0),
  ('Cash USD', 'cash', 'USD', 0)
ON CONFLICT DO NOTHING;

-- Sample Categories
INSERT INTO categories (name, description) VALUES
  ('مواد غذایی', 'Food items and groceries'),
  ('لوازم خانگی', 'Household items and appliances'),
  ('نوشیدنی‌ها', 'Beverages and drinks'),
  ('لوازم بهداشتی', 'Health and hygiene products'),
  ('لوازم التحریر', 'Stationery and office supplies')
ON CONFLICT DO NOTHING;
