CREATE TABLE loyalty_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_digest TEXT NOT NULL,
  recovery_digest TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE loyalty_sessions (
  token_digest TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX loyalty_sessions_expiry ON loyalty_sessions(expires_at);
CREATE INDEX loyalty_sessions_account ON loyalty_sessions(account_id);
