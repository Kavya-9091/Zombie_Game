/*
# Create zombie game high scores table

1. New Tables
- `zombie_scores`
- `id` (uuid, primary key)
- `player_name` (text, not null) — the name the player enters
- `score` (integer, not null) — final score achieved
- `wave` (integer, not null) — highest wave reached
- `kills` (integer, not null) — total zombies killed
- `created_at` (timestamp, defaults to now)
2. Security
- Enable RLS on `zombie_scores`.
- Single-tenant (no auth): allow anon + authenticated to read all scores and insert new ones.
- Updates and deletes are intentionally disabled — scores are immutable once submitted.
3. Notes
- A public leaderboard is intentional: everyone sees all scores.
- Only INSERT and SELECT are allowed; scores cannot be edited or deleted from the client.
*/

CREATE TABLE IF NOT EXISTS zombie_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  score integer NOT NULL,
  wave integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE zombie_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scores" ON zombie_scores;
CREATE POLICY "anon_select_scores" ON zombie_scores FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scores" ON zombie_scores;
CREATE POLICY "anon_insert_scores" ON zombie_scores FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_zombie_scores_score_desc ON zombie_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_zombie_scores_created_at ON zombie_scores (created_at DESC);
