-- Migration: revert difficulty tier (if it was ever applied) and drop the
-- uniqueness constraint on spin_date so TESTING_MODE can allow multiple
-- spins per day.
--
-- Run on the VPS against the existing database:
--   docker exec -i $(docker compose ps -q db) psql -U spinner -d word_spinner < migrations/001_remove_difficulty_and_daily_unique.sql

ALTER TABLE words DROP CONSTRAINT IF EXISTS words_difficulty_check;
ALTER TABLE words DROP COLUMN IF EXISTS difficulty;

ALTER TABLE spin_history DROP CONSTRAINT IF EXISTS spin_history_spin_date_key;
