-- Word Spinner schema

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  used_in_cycle BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS styles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per day's session (not per spin). A day starts with 3 spins
-- available; each spin re-rolls whichever of word/style isn't locked.
-- The row is only "real" (counts toward word cycle / style cooldown) once
-- finalized = true, which happens either by explicitly locking in early or
-- automatically once all 3 spins are used.
CREATE TABLE IF NOT EXISTS spin_history (
  id SERIAL PRIMARY KEY,
  spin_date DATE NOT NULL,
  word_id INTEGER NOT NULL REFERENCES words(id),
  style_id INTEGER NOT NULL REFERENCES styles(id),
  spins_used INTEGER NOT NULL DEFAULT 1,
  word_locked BOOLEAN NOT NULL DEFAULT FALSE,
  style_locked BOOLEAN NOT NULL DEFAULT FALSE,
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  cycle_reset BOOLEAN NOT NULL DEFAULT FALSE,
  cap_relaxed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spin_history_date ON spin_history(spin_date);
CREATE INDEX IF NOT EXISTS idx_spin_history_finalized ON spin_history(finalized);

-- Seed styles (NAPLAN-aligned)
INSERT INTO styles (name) VALUES
  ('narrative'), ('informative'), ('recount'),
  ('persuasive'), ('descriptive'), ('imaginative')
ON CONFLICT (name) DO NOTHING;

-- Seed a starter word list — replace/extend via the admin panel, or bulk-import a CSV.
INSERT INTO words (text) VALUES
  ('battery'), ('volcano'), ('umbrella'), ('dragon'), ('sandwich'),
  ('glacier'), ('kangaroo'), ('rocket'), ('whisper'), ('lighthouse'),
  ('pickle'), ('thunder'), ('marble'), ('compass'), ('jellyfish')
ON CONFLICT (text) DO NOTHING;
