-- ============================================================
-- Migration 002: player_profiles and related tables
-- Run in Supabase SQL Editor AFTER 001_app_settings.sql
-- Purpose: Player identity, ratings, stats, onboarding answers,
--          preferred areas, availability, and rating history.
-- Dependencies: 001_app_settings.sql, existing members table,
--               existing auth.users
-- ============================================================

-- ============================================================
-- player_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_profiles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id                   UUID REFERENCES public.members(id) ON DELETE SET NULL,

  -- Identity
  first_name                  TEXT,
  last_name                   TEXT,
  display_name                TEXT,
  username                    TEXT UNIQUE,
  public_player_id            TEXT UNIQUE,           -- stable public URL slug e.g. PP-26-XXXXXX
  avatar_url                  TEXT,

  -- Contact (never exposed to other players)
  phone                       TEXT,
  email                       TEXT,

  -- Location
  country                     TEXT DEFAULT 'EG',
  city                        TEXT,
  primary_area                TEXT,
  home_venue_id               UUID,                  -- FK to venues table (future)

  -- Demographics
  gender                      TEXT CHECK (gender IN ('male', 'female', 'prefer_not_to_say')),
  date_of_birth               DATE,

  -- Playing preferences
  dominant_hand               TEXT CHECK (dominant_hand IN ('right', 'left', 'ambidextrous')),
  preferred_side              TEXT CHECK (preferred_side IN ('right', 'left', 'no_preference')),
  years_playing_padel         INTEGER,
  weekly_match_frequency      TEXT,
  match_intensity_preference  TEXT,
  match_type_preference       TEXT CHECK (match_type_preference IN ('friendly', 'rated', 'both')),

  -- Rating
  current_rating              INTEGER NOT NULL DEFAULT 500,
  starting_rating             INTEGER NOT NULL DEFAULT 500,
  starting_rating_source      TEXT NOT NULL DEFAULT 'default_500'
                                CHECK (starting_rating_source IN ('default_500', 'rating_guess', 'admin_override')),
  rating_confidence           TEXT NOT NULL DEFAULT 'low'
                                CHECK (rating_confidence IN ('low', 'medium', 'high')),

  -- Leaderboard location (updated only after playing in new location — prevents hopping)
  leaderboard_city            TEXT,
  leaderboard_area            TEXT,

  -- Profile completion
  profile_completion_percent  INTEGER NOT NULL DEFAULT 0,
  onboarding_completed        BOOLEAN NOT NULL DEFAULT FALSE,
  match_ready                 BOOLEAN NOT NULL DEFAULT FALSE,

  -- Privacy
  is_discoverable             BOOLEAN NOT NULL DEFAULT TRUE,
  match_history_privacy       TEXT NOT NULL DEFAULT 'public'
                                CHECK (match_history_privacy IN ('public', 'followers_only', 'private')),
  followers_private           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Account state
  is_suspended                BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned                   BOOLEAN NOT NULL DEFAULT FALSE,
  suspension_reason           TEXT,
  banned_reason               TEXT,

  -- Trust / reliability (some admin-only)
  no_show_count               INTEGER NOT NULL DEFAULT 0,
  dispute_count               INTEGER NOT NULL DEFAULT 0,
  reports_received_count      INTEGER NOT NULL DEFAULT 0,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_profiles_user_id_idx    ON public.player_profiles(user_id);
CREATE INDEX IF NOT EXISTS player_profiles_username_idx   ON public.player_profiles(username);
CREATE INDEX IF NOT EXISTS player_profiles_city_idx       ON public.player_profiles(city);
CREATE INDEX IF NOT EXISTS player_profiles_rating_idx     ON public.player_profiles(current_rating);

-- ============================================================
-- player_onboarding_answers
-- Key/value store for all Rating Guess questionnaire answers.
-- Locked after first rated match — admin-only reset.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_onboarding_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL UNIQUE REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL DEFAULT '{}',   -- { question_key: answer_value }
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- player_preferred_areas
-- Multi-area infrastructure — built now, hidden in MVP UI.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_preferred_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  city        TEXT NOT NULL,
  area        TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 1,   -- 1 = primary
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, city, area)
);

-- ============================================================
-- player_availability
-- Day + time slot preferences for matchmaking discovery.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat
  time_slot     TEXT NOT NULL,    -- e.g. 'morning' | 'afternoon' | 'evening' | 'late_night'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, day_of_week, time_slot)
);

-- ============================================================
-- player_stats
-- Denormalised summary — updated by processing engine after each match.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_stats (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                       UUID NOT NULL UNIQUE REFERENCES public.player_profiles(id) ON DELETE CASCADE,

  -- Match counts
  matches_played                  INTEGER NOT NULL DEFAULT 0,
  rated_matches_played            INTEGER NOT NULL DEFAULT 0,
  friendly_matches_played         INTEGER NOT NULL DEFAULT 0,
  wins                            INTEGER NOT NULL DEFAULT 0,
  losses                          INTEGER NOT NULL DEFAULT 0,

  -- Rating extremes
  highest_rating_ever             INTEGER,
  lowest_rating_ever              INTEGER,

  -- Streaks
  current_winning_streak          INTEGER NOT NULL DEFAULT 0,
  best_winning_streak             INTEGER NOT NULL DEFAULT 0,
  current_beat_expected_streak    INTEGER NOT NULL DEFAULT 0,
  best_beat_expected_streak       INTEGER NOT NULL DEFAULT 0,
  times_beat_expected             INTEGER NOT NULL DEFAULT 0,
  upset_wins                      INTEGER NOT NULL DEFAULT 0,

  -- Bars
  bars_active_balance             NUMERIC NOT NULL DEFAULT 0,
  bars_locked_pending             NUMERIC NOT NULL DEFAULT 0,
  bars_total_earned               NUMERIC NOT NULL DEFAULT 0,
  bars_lifetime_earned            NUMERIC NOT NULL DEFAULT 0,

  -- Trust / reliability
  score_confirmation_reliability  NUMERIC,    -- % of scores confirmed on time
  no_show_count                   INTEGER NOT NULL DEFAULT 0,

  -- Social
  most_common_partner_id          UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  most_active_city                TEXT,
  most_active_area                TEXT,

  -- Cached for discovery/cards
  cached_recent_form              TEXT,       -- e.g. 'WWLWW' (last 5 rated matches)

  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- rating_events
-- Immutable rating history. Never delete — only add reversal entries.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rating_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  match_id          UUID,           -- FK to matches table (added in later migration)

  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'match_result',
                      'admin_correction',
                      'admin_reversal',
                      'global_adjustment',
                      'starting_rating'
                    )),

  rating_before     INTEGER NOT NULL,
  rating_change     INTEGER NOT NULL,
  rating_after      INTEGER NOT NULL,

  reason            TEXT,
  algorithm_version TEXT,

  -- false for admin correction/reversal entries — players never see those
  visible_to_player BOOLEAN NOT NULL DEFAULT TRUE,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rating_events_player_id_idx ON public.rating_events(player_id);
CREATE INDEX IF NOT EXISTS rating_events_match_id_idx  ON public.rating_events(match_id);
CREATE INDEX IF NOT EXISTS rating_events_created_at_idx ON public.rating_events(created_at DESC);

-- ============================================================
-- player_follows
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_follows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id       UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  followed_id       UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

-- ============================================================
-- player_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- ============================================================
-- user_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  reported_id     UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL CHECK (reason IN (
                    'fake_score', 'toxic_behavior', 'no_show', 'wrong_identity',
                    'harassment', 'spam', 'payment_booking_issue', 'other'
                  )),
  details         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  admin_notes     TEXT,
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.player_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_onboarding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_preferred_areas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_follows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_blocks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports            ENABLE ROW LEVEL SECURITY;

-- player_profiles: read public profiles, update own non-rating fields
CREATE POLICY "player_profiles_read_public"
  ON public.player_profiles FOR SELECT
  TO authenticated
  USING (NOT is_banned);

CREATE POLICY "player_profiles_update_own"
  ON public.player_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Prevent users from self-modifying rating/admin fields
    -- (current_rating, starting_rating, is_suspended, is_banned enforced server-side)
  );

CREATE POLICY "player_profiles_insert_own"
  ON public.player_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_all_player_profiles"
  ON public.player_profiles FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- player_onboarding_answers: user reads/writes own; locks after first rated match
CREATE POLICY "onboarding_answers_own"
  ON public.player_onboarding_answers FOR ALL
  TO authenticated
  USING (player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "admins_all_onboarding_answers"
  ON public.player_onboarding_answers FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- player_preferred_areas, player_availability: own only
CREATE POLICY "preferred_areas_own"
  ON public.player_preferred_areas FOR ALL
  TO authenticated
  USING (player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "admins_all_preferred_areas"
  ON public.player_preferred_areas FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "availability_own"
  ON public.player_availability FOR ALL
  TO authenticated
  USING (player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "admins_all_availability"
  ON public.player_availability FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- player_stats: read by authenticated (public competitive data), write server-side only
CREATE POLICY "player_stats_read"
  ON public.player_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins_all_player_stats"
  ON public.player_stats FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- rating_events: users read own visible events; insert via server-side only
CREATE POLICY "rating_events_read_own"
  ON public.rating_events FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid())
    AND visible_to_player = TRUE
  );

CREATE POLICY "admins_all_rating_events"
  ON public.rating_events FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- player_follows
CREATE POLICY "follows_read"
  ON public.player_follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "follows_own"
  ON public.player_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "follows_delete_own"
  ON public.player_follows FOR DELETE
  TO authenticated
  USING (follower_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

-- player_blocks: read own, write own
CREATE POLICY "blocks_own"
  ON public.player_blocks FOR ALL
  TO authenticated
  USING (blocker_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

-- user_reports: insert own, read own
CREATE POLICY "reports_insert_own"
  ON public.user_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "reports_read_own"
  ON public.user_reports FOR SELECT
  TO authenticated
  USING (reporter_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid()));

CREATE POLICY "admins_all_reports"
  ON public.user_reports FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_player_onboarding_updated_at
  BEFORE UPDATE ON public.player_onboarding_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ensurePlayerProfile: idempotent — safe to call multiple times.
-- Creates player_profile + player_stats + player_onboarding_answers
-- for a given auth user. Called from the extended handle_new_user
-- trigger AND as a safety fallback after login.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_player_profile(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_member_id UUID;
  v_email     TEXT;
  v_phone     TEXT;
BEGIN
  -- Return early if profile already exists
  SELECT id INTO v_player_id
  FROM public.player_profiles
  WHERE user_id = p_user_id;

  IF v_player_id IS NOT NULL THEN
    RETURN v_player_id;
  END IF;

  -- Fetch member data to pre-populate
  SELECT id, email, phone
  INTO v_member_id, v_email, v_phone
  FROM public.members
  WHERE user_id = p_user_id;

  -- Create player profile
  INSERT INTO public.player_profiles (
    user_id,
    member_id,
    email,
    phone,
    current_rating,
    starting_rating,
    starting_rating_source
  ) VALUES (
    p_user_id,
    v_member_id,
    v_email,
    v_phone,
    500,
    500,
    'default_500'
  )
  RETURNING id INTO v_player_id;

  -- Create player_stats row
  INSERT INTO public.player_stats (player_id)
  VALUES (v_player_id)
  ON CONFLICT (player_id) DO NOTHING;

  -- Create onboarding_answers row
  INSERT INTO public.player_onboarding_answers (player_id)
  VALUES (v_player_id)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN v_player_id;
END;
$$;

-- ============================================================
-- Extend handle_new_user trigger to also create player_profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
BEGIN
  -- Create members row (existing behaviour)
  INSERT INTO public.members (user_id, name, email, phone, is_active, valid_until)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Member'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    false,
    (NOW() + INTERVAL '1 month')::DATE
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create player_profile (new)
  PERFORM public.ensure_player_profile(NEW.id);

  RETURN NEW;
END;
$$;

-- ============================================================
-- recalculate_player_stats: repair function for admin use.
-- Recomputes stats from source-of-truth tables.
-- Full implementation added when match processing engine is built.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_player_stats(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Placeholder: full implementation in migration 006 (processing engine)
  -- Resets cached_recent_form and stat counts from rating_events + match results
  UPDATE public.player_stats
  SET updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;
