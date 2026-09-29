-- Eingaben auf der öffentlichen Seite. Bewusst ohne IP-Adresse oder Browserdaten.
CREATE TABLE IF NOT EXISTS eingaben (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  zeit   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),  -- UTC
  satz   TEXT    NOT NULL,
  modell TEXT    NOT NULL,
  p      REAL,             -- Wahrscheinlichkeit für "wahr", 0..1
  ms     INTEGER,
  kosten REAL,             -- US-Dollar
  fehler TEXT
);
CREATE INDEX IF NOT EXISTS eingaben_zeit ON eingaben (zeit);
