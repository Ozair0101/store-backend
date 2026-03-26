-- ═══════════════════════════════════════════════
-- Sarafi (Currency Exchange) Module
-- ═══════════════════════════════════════════════

-- Sarafi profiles
CREATE TABLE IF NOT EXISTS sarafis (
  sarafi_id   SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200),
  phone       VARCHAR(50),
  address     TEXT,
  notes       TEXT,
  balance     DECIMAL(14,2) DEFAULT 0,  -- positive = they owe us, negative = we owe them
  currency    VARCHAR(10) DEFAULT 'AFN',
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Sarafi transaction ledger
CREATE TABLE IF NOT EXISTS sarafi_transactions (
  sarafi_tx_id  SERIAL PRIMARY KEY,
  sarafi_id     INTEGER NOT NULL REFERENCES sarafis(sarafi_id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,
    -- deposit:          we give money TO sarafi (our account -, sarafi balance +)
    -- withdrawal:       we receive money FROM sarafi (our account +, sarafi balance -)
    -- supplier_payment: sarafi pays our supplier on our behalf (sarafi balance -)
    -- customer_receipt: customer pays us via sarafi (sarafi balance +)
    -- exchange:         currency conversion through sarafi
  amount        DECIMAL(14,2) NOT NULL,
  currency      VARCHAR(10) DEFAULT 'AFN',
  account_id    INTEGER REFERENCES accounts(account_id),  -- which of our accounts is affected (nullable)
  reference     VARCHAR(200),   -- e.g. "Purchase #5", "Sale #12"
  description   TEXT,
  date          TIMESTAMP DEFAULT NOW(),
  user_id       INTEGER REFERENCES users(user_id)
);

-- Index for fast ledger lookups
CREATE INDEX IF NOT EXISTS idx_sarafi_tx_sarafi_id ON sarafi_transactions(sarafi_id);
CREATE INDEX IF NOT EXISTS idx_sarafi_tx_date ON sarafi_transactions(date DESC);
