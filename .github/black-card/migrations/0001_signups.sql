CREATE TABLE IF NOT EXISTS signups (
  email TEXT NOT NULL PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL,
  signed_up_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  consent_text TEXT NOT NULL
);
