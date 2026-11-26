CREATE TABLE counter_staff (
  id TEXT PRIMARY KEY NOT NULL,
  code_digest TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);
CREATE TABLE counter_sessions (
  token_digest TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES counter_staff(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX counter_sessions_expiry ON counter_sessions(expires_at);

CREATE TABLE loyalty_orders (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES counter_staff(id),
  stamp_number INTEGER NOT NULL CHECK (stamp_number > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  claim_code TEXT,
  redeemed_at INTEGER,
  redeemed_by TEXT REFERENCES counter_staff(id),
  UNIQUE (account_id, stamp_number),
  CHECK ((stamp_number % 4 = 0) = (claim_code IS NOT NULL)),
  CHECK ((redeemed_at IS NULL) = (redeemed_by IS NULL))
);
