ALTER TABLE loyalty_accounts ADD COLUMN points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0);
