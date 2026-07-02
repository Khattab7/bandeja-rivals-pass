-- ============================================================
-- Migration 005: Matches, Score Submissions, Match Detail Changes
-- Run in Supabase SQL Editor AFTER 004_discovery.sql
-- Dependencies: 003_teams.sql, 004_discovery.sql
-- ============================================================

-- ============================================================
-- matches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type and status
  match_type                TEXT NOT NULL CHECK (match_type IN ('friendly', 'rivals_rated')),
  status                    TEXT NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN (
                              'scheduled', 'scheduled_tbd', 'cancelled',
                              'score_submitted', 'awaiting_confirmation',
                              'alternative_score_submitted',
                              'confirmed', 'auto_approved',
                              'disputed', 'admin_resolved',
                              'processed', 'voided'
                            )),

  -- Creation source
  source_type               TEXT NOT NULL CHECK (source_type IN ('team_challenge', 'open_match', 'admin')),
  source_id                 UUID,                     -- ID of challenge or open_match that created this

  -- Teams (locked at creation)
  team_a_id                 UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  team_b_id                 UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,

  -- Location
  city                      TEXT,
  area                      TEXT,
  venue_id                  UUID,

  -- Schedule
  scheduled_date            DATE,
  scheduled_time            TIME,

  -- Rating snapshot: frozen at FIRST score submission
  -- Stores: team ratings, all 4 player ratings, expected score, algorithm version
  rating_snapshot_json      JSONB,

  -- Processing
  first_score_submitted_at  TIMESTAMPTZ,
  score_submission_window_expires_at TIMESTAMPTZ,
  processed_at              TIMESTAMPTZ,

  -- Void
  voided_at                 TIMESTAMPTZ,
  voided_by                 UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  void_reason               TEXT,

  -- Cancel
  cancelled_at              TIMESTAMPTZ,
  cancelled_by              UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  cancel_reason             TEXT,

  -- Admin
  admin_resolved_by         UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  admin_resolved_at         TIMESTAMPTZ,
  admin_notes               TEXT,

  -- Visibility
  is_hidden_from_feed       BOOLEAN NOT NULL DEFAULT FALSE,

  created_by                UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_match CHECK (team_a_id <> team_b_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_team_a  ON public.matches(team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b  ON public.matches(team_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_status  ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_source  ON public.matches(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_matches_date    ON public.matches(scheduled_date DESC NULLS LAST);

-- ============================================================
-- match_players
-- Locked 4-player snapshot at match creation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_players (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                        UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id                         UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  player_id                       UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE RESTRICT,
  side                            TEXT NOT NULL CHECK (side IN ('A', 'B')),
  slot                            TEXT NOT NULL CHECK (slot IN ('player_1', 'player_2')),
  player_rating_at_match_creation INTEGER NOT NULL,
  player_rating_at_score_submission INTEGER,         -- set when first score is submitted
  UNIQUE (match_id, player_id),
  UNIQUE (match_id, team_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match  ON public.match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON public.match_players(player_id);

-- ============================================================
-- match_score_submissions
-- Original, alternative, and admin-corrected score submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_score_submissions (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                        UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  submitted_by_player_id          UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  submitted_by_team_id            UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  submission_type                 TEXT NOT NULL
                                  CHECK (submission_type IN ('original', 'alternative', 'admin_corrected')),
  score_format                    TEXT NOT NULL CHECK (score_format IN ('one_set', 'best_of_3')),

  -- Derived from sets — the actual score used for rating algorithm
  -- Best-of-3: last played set. One-set: the single set.
  equivalent_actual_score_scenario_index INTEGER,  -- 1–14 from approved score table
  equivalent_actual_score_label   TEXT,            -- e.g. "6-4"
  winning_side                    TEXT CHECK (winning_side IN ('A', 'B')),

  status                          TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'confirmed', 'rejected', 'withdrawn', 'superseded')),
  dispute_text                    TEXT,

  confirmed_by_player_id          UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  confirmed_at                    TIMESTAMPTZ,
  rejected_by_player_id           UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  rejected_at                     TIMESTAMPTZ,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_subs_match  ON public.match_score_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_score_subs_player ON public.match_score_submissions(submitted_by_player_id);
CREATE INDEX IF NOT EXISTS idx_score_subs_status ON public.match_score_submissions(status);

-- ============================================================
-- match_score_sets
-- Individual set scores within a submission (1–3 sets)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_score_sets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_submission_id   UUID NOT NULL REFERENCES public.match_score_submissions(id) ON DELETE CASCADE,
  set_number            INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 3),
  winning_side          TEXT NOT NULL CHECK (winning_side IN ('A', 'B')),
  winner_games          INTEGER NOT NULL,
  loser_games           INTEGER NOT NULL,
  scenario_index        INTEGER,    -- 1–14 BANDEJA approved score table
  score_label           TEXT,       -- e.g. "6-4"
  UNIQUE (score_submission_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_score_sets_submission ON public.match_score_sets(score_submission_id);

-- ============================================================
-- match_detail_change_requests
-- Date/time/area/venue change proposals (requires other team's approval)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_detail_change_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  proposed_by_player_id   UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  proposed_by_team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  proposed_date           DATE,
  proposed_time           TIME,
  proposed_city           TEXT,
  proposed_area           TEXT,
  proposed_venue_id       UUID,
  message                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'superseded')),
  responded_by_player_id  UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  responded_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detail_changes_match  ON public.match_detail_change_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_detail_changes_status ON public.match_detail_change_requests(status);

-- ============================================================
-- match_no_shows
-- Reported no-shows — affect reliability score, not ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_no_shows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  reported_by_player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  reported_team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  details             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'disputed', 'dismissed')),
  reviewed_by         UUID,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_shows_match  ON public.match_no_shows(match_id);
CREATE INDEX IF NOT EXISTS idx_no_shows_status ON public.match_no_shows(status);

-- ============================================================
-- updated_at triggers for new tables
-- ============================================================
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_score_subs_updated_at
  BEFORE UPDATE ON public.match_score_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

-- ============================================================
-- Wire FK constraints back to 003's tables
-- These were deferred because matches didn't exist yet
-- ============================================================
ALTER TABLE public.team_challenges
  ADD CONSTRAINT fk_team_challenges_match
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.open_matches
  ADD CONSTRAINT fk_open_matches_match
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.team_rating_snapshots
  ADD CONSTRAINT fk_team_rating_snapshots_match
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE
  NOT VALID;

-- Validate constraints (separate step — runs table scan but deferred)
ALTER TABLE public.team_challenges       VALIDATE CONSTRAINT fk_team_challenges_match;
ALTER TABLE public.open_matches          VALIDATE CONSTRAINT fk_open_matches_match;
ALTER TABLE public.team_rating_snapshots VALIDATE CONSTRAINT fk_team_rating_snapshots_match;

-- ============================================================
-- RLS — Enable on all tables
-- ============================================================
ALTER TABLE public.matches                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_score_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_score_sets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_detail_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_no_shows               ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a participant in this match?
CREATE OR REPLACE FUNCTION is_match_participant(p_match_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.match_players mp
    JOIN public.player_profiles pp ON pp.id = mp.player_id
    WHERE mp.match_id = p_match_id AND pp.user_id = auth.uid()
  );
$$;

-- ── matches ───────────────────────────────────────────────────
-- Participants always see their own matches
-- Confirmed rated matches visible to all (for social/leaderboard context)
CREATE POLICY "matches_select" ON public.matches FOR SELECT TO authenticated
  USING (
    is_match_participant(id)
    OR (status IN ('confirmed', 'auto_approved', 'processed')
        AND match_type = 'rivals_rated'
        AND is_hidden_from_feed = FALSE)
  );

CREATE POLICY "matches_insert" ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    created_by = my_player_id()
    AND (
      is_team_member(team_a_id) OR is_team_member(team_b_id)
    )
  );

CREATE POLICY "matches_update" ON public.matches FOR UPDATE TO authenticated
  USING (is_match_participant(id));

-- ── match_players ─────────────────────────────────────────────
CREATE POLICY "match_players_select" ON public.match_players FOR SELECT TO authenticated
  USING (is_match_participant(match_id));

CREATE POLICY "match_players_insert" ON public.match_players FOR INSERT TO authenticated
  WITH CHECK (is_match_participant(match_id));

-- ── match_score_submissions ───────────────────────────────────
CREATE POLICY "score_subs_select" ON public.match_score_submissions FOR SELECT TO authenticated
  USING (is_match_participant(match_id));

CREATE POLICY "score_subs_insert" ON public.match_score_submissions FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by_player_id = my_player_id()
    AND is_match_participant(match_id)
  );

CREATE POLICY "score_subs_update" ON public.match_score_submissions FOR UPDATE TO authenticated
  USING (is_match_participant(match_id));

-- ── match_score_sets ──────────────────────────────────────────
CREATE POLICY "score_sets_select" ON public.match_score_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.match_score_submissions s
      WHERE s.id = score_submission_id AND is_match_participant(s.match_id)
    )
  );

CREATE POLICY "score_sets_insert" ON public.match_score_sets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.match_score_submissions s
      WHERE s.id = score_submission_id
        AND s.submitted_by_player_id = my_player_id()
    )
  );

-- ── match_detail_change_requests ──────────────────────────────
CREATE POLICY "detail_changes_select" ON public.match_detail_change_requests FOR SELECT TO authenticated
  USING (is_match_participant(match_id));

CREATE POLICY "detail_changes_insert" ON public.match_detail_change_requests FOR INSERT TO authenticated
  WITH CHECK (proposed_by_player_id = my_player_id() AND is_match_participant(match_id));

CREATE POLICY "detail_changes_update" ON public.match_detail_change_requests FOR UPDATE TO authenticated
  USING (is_match_participant(match_id));

-- ── match_no_shows ────────────────────────────────────────────
CREATE POLICY "no_shows_select" ON public.match_no_shows FOR SELECT TO authenticated
  USING (is_match_participant(match_id));

CREATE POLICY "no_shows_insert" ON public.match_no_shows FOR INSERT TO authenticated
  WITH CHECK (reported_by_player_id = my_player_id() AND is_match_participant(match_id));
