-- ============================================================
-- Migration 006: Rating Processing — Bars Ledger + Processing Summaries
-- Run AFTER 005_matches.sql
-- Dependencies: 002_player_profiles.sql, 005_matches.sql
-- ============================================================

-- ============================================================
-- bars_ledger
-- Tracks earned, locked, expired, redeemed, and reversed Bars
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bars_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  match_id      UUID REFERENCES public.matches(id) ON DELETE SET NULL,

  amount        NUMERIC(10,1) NOT NULL,   -- supports .5 for exact-expected edge case
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'locked', 'expired', 'reversed', 'redeemed')),
  source_type   TEXT NOT NULL
                CHECK (source_type IN (
                  'match_reward', 'admin_adjustment', 'admin_reversal',
                  'unlock_locked_bars', 'redemption'
                )),
  source_id     UUID,                     -- match_id or admin action id

  -- Eligibility snapshot at score submission time
  was_paid_at_submission BOOLEAN NOT NULL DEFAULT FALSE,

  locked_reason  TEXT,
  expires_at     TIMESTAMPTZ,             -- for locked Bars: expiry from score_submission date
  unlocked_at    TIMESTAMPTZ,
  reversed_at    TIMESTAMPTZ,
  redeemed_at    TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bars_ledger_player  ON public.bars_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_bars_ledger_match   ON public.bars_ledger(match_id);
CREATE INDEX IF NOT EXISTS idx_bars_ledger_status  ON public.bars_ledger(status);

ALTER TABLE public.bars_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bars_ledger_select" ON public.bars_ledger FOR SELECT TO authenticated
  USING (player_id = my_player_id());

-- ============================================================
-- match_processing_summaries
-- Permanent record of processing output — one per match
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_processing_summaries (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,

  -- Snapshot used (copied from match.rating_snapshot_json for easy access)
  team_a_rating_snapshot  INTEGER NOT NULL,
  team_b_rating_snapshot  INTEGER NOT NULL,

  -- Algorithm result
  steps                   INTEGER NOT NULL,
  favored_side            TEXT CHECK (favored_side IN ('A', 'B', 'balanced')),
  expected_scenario_index INTEGER,
  expected_label          TEXT,
  actual_scenario_index   INTEGER NOT NULL,
  actual_label            TEXT NOT NULL,

  -- Rating changes (team level)
  team_a_rating_change    INTEGER NOT NULL,
  team_b_rating_change    INTEGER NOT NULL,

  -- Per-player changes (JSONB: {player_id: {before, change, after}})
  player_changes          JSONB NOT NULL,

  -- Bars awarded (JSONB: {player_id: {amount, status}})
  bars_json               JSONB,

  -- Streaks (JSONB: {player_id: {win_streak_before, win_streak_after, beat_expected_streak_before, beat_expected_streak_after}})
  streaks_json            JSONB,

  -- Plain-language explanation
  explanation_short       TEXT,
  explanation_detailed    TEXT,

  processed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proc_summaries_match ON public.match_processing_summaries(match_id);

ALTER TABLE public.match_processing_summaries ENABLE ROW LEVEL SECURITY;

-- Players can see summaries for their own matches
CREATE POLICY "proc_summaries_select" ON public.match_processing_summaries FOR SELECT TO authenticated
  USING (is_match_participant(match_id));

-- ============================================================
-- Additional app_settings for processing (not in 001)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('BARS_VALIDITY_DAYS',          '60',    'Days from score submission that locked Bars expire if player does not upgrade'),
  ('PROCESSING_ALGORITHM_VERSION', '"1.0"', 'Current algorithm version tag stored in rating snapshots and processing summaries')
ON CONFLICT (key) DO NOTHING;
