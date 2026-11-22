CREATE TABLE website_button_clicks (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  placement TEXT NOT NULL,
  action TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (day, source, placement, action)
) WITHOUT ROWID;
