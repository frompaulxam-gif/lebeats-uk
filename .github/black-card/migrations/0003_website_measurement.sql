ALTER TABLE signups ADD COLUMN signup_source TEXT;

CREATE TABLE website_activity (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (day, source, action)
) WITHOUT ROWID;
