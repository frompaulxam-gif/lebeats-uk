CREATE TABLE member_click_consent (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  receipt TEXT NOT NULL UNIQUE,
  notice_version INTEGER NOT NULL,
  enabled_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE member_click_history (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_click_consent(account_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  clicked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  placement TEXT NOT NULL,
  action TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX member_click_account_time ON member_click_history(account_id, clicked_at, id);
CREATE INDEX member_click_time ON member_click_history(clicked_at);
