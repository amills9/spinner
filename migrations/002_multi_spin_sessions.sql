-- Migration: support 3-spins-per-day sessions with lock/respin and lock-in.
-- Run on the VPS against the existing database:
--   docker exec -i $(docker compose ps -q db) psql -U spinner -d word_spinner < migrations/002_multi_spin_sessions.sql

ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS spins_used INTEGER NOT NULL DEFAULT 1;
ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS word_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS style_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS finalized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_spin_history_finalized ON spin_history(finalized);

-- Mark existing rows (from the old one-spin-per-day model) as finalized,
-- since they represent completed days under the old rules.
UPDATE spin_history SET finalized = TRUE WHERE finalized = FALSE;
