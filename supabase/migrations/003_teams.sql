-- ============================================================
-- Migration 003: Teams, Invitations, Challenges, Open Matches
-- Run in Supabase SQL Editor AFTER 002_player_profiles.sql
-- Dependencies: 001_app_settings.sql, 002_player_profiles.sql
-- ============================================================

-- ============================================================
-- Helper function: deterministic pair key for duplicate prevention
-- pair_key = smaller_player_id::text || ':' || larger_player_id::text
-- ============================================================
CREATE OR REPLACE FUNCTION compute_pair_key(p1 UUID, p2 UUID)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p1 < p2 THEN RETURN p1::text || ':' || p2::text;
  ELSE RETURN p2::text || ':' || p1::text;
  END IF;
END;
$$;

-- ============================================================
-- teams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_team_id              TEXT UNIQUE,              -- BRT-YY-XXXXXX
  handle                      TEXT UNIQUE,              -- optional vanity handle
  name                        TEXT,                     -- optional custom name
  auto_name                   TEXT,                     -- "Player A + Player B" (computed, cached)
  avatar_url                  TEXT,
  bio                         TEXT,

  -- Membership
  captain_player_id           UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  team_type                   TEXT NOT NULL DEFAULT 'permanent'
                              CHECK (team_type IN ('permanent')),
  status                      TEXT NOT NULL DEFAULT 'incomplete'
                              CHECK (status IN ('active', 'incomplete', 'pending_partner_acceptance',
                                                'suspended', 'archived', 'deleted')),

  -- Duplicate prevention: set when 2nd player joins
  -- Unique partial index below enforces no duplicate active pairs
  pair_key                    TEXT,

  -- Location preferences
  home_city                   TEXT,
  home_area                   TEXT,
  home_venue_id               UUID,                     -- FK to venues (future)

  -- Discovery & challenges
  is_discoverable             BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured                 BOOLEAN NOT NULL DEFAULT FALSE,
  challenge_rating_range      INTEGER NOT NULL DEFAULT 100,
  match_history_privacy       TEXT NOT NULL DEFAULT 'public'
                              CHECK (match_history_privacy IN ('public', 'team_only')),

  -- Rating cache (always (p1.current_rating + p2.current_rating) / 2)
  cached_current_team_rating  INTEGER,

  -- Admin
  suspended_at                TIMESTAMPTZ,
  suspended_reason            TEXT,
  archived_at                 TIMESTAMPTZ,
  created_by                  UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Duplicate active team prevention (order-independent via pair_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_pair_key_active
  ON public.teams (pair_key)
  WHERE status IN ('active', 'pending_partner_acceptance', 'incomplete')
    AND team_type = 'permanent'
    AND pair_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_captain ON public.teams(captain_player_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON public.teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_home_city ON public.teams(home_city);

-- ============================================================
-- team_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('captain', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_player ON public.team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);

-- ============================================================
-- team_invitations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  inviter_player_id   UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  -- Registered invitee:
  invitee_player_id   UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  -- External (unregistered) invitee:
  invitee_email       TEXT,
  invitee_phone       TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  message             TEXT,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invitee_required CHECK (
    invitee_player_id IS NOT NULL OR invitee_email IS NOT NULL OR invitee_phone IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_team     ON public.team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invitee  ON public.team_invitations(invitee_player_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_inviter  ON public.team_invitations(inviter_player_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status   ON public.team_invitations(status);

-- ============================================================
-- team_challenges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_challenges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenging_team_id   UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  challenged_team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sender_player_id      UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,

  match_type            TEXT NOT NULL CHECK (match_type IN ('friendly', 'rivals_rated')),
  proposed_datetime     TIMESTAMPTZ,
  city                  TEXT,
  area                  TEXT,
  venue_id              UUID,
  message               TEXT,

  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled',
                                          'expired', 'countered', 'match_created')),
  -- Set when status = 'match_created' (FK added in migration 004)
  match_id              UUID,
  expires_at            TIMESTAMPTZ,
  responded_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_challenge CHECK (challenging_team_id <> challenged_team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_challenges_challenger ON public.team_challenges(challenging_team_id);
CREATE INDEX IF NOT EXISTS idx_team_challenges_challenged ON public.team_challenges(challenged_team_id);
CREATE INDEX IF NOT EXISTS idx_team_challenges_status     ON public.team_challenges(status);

-- ============================================================
-- team_challenge_counteroffers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_challenge_counteroffers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id          UUID NOT NULL REFERENCES public.team_challenges(id) ON DELETE CASCADE,
  offered_by_team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  offered_by_player_id  UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  proposed_datetime     TIMESTAMPTZ,
  area                  TEXT,
  venue_id              UUID,
  message               TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_counteroffers_challenge ON public.team_challenge_counteroffers(challenge_id);

-- ============================================================
-- open_matches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.open_matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_open_id      TEXT UNIQUE,              -- OM-YY-XXXXXX for shareable links
  team_id             UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,

  match_type          TEXT NOT NULL CHECK (match_type IN ('friendly', 'rivals_rated')),
  city                TEXT NOT NULL,
  area                TEXT,
  venue_id            UUID,
  proposed_datetime   TIMESTAMPTZ NOT NULL,
  rating_min          INTEGER,
  rating_max          INTEGER,
  gender_preference   TEXT CHECK (gender_preference IN ('male', 'female', 'mixed', 'any')),
  message             TEXT,

  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  -- Set when an application is accepted (FK added in migration 004)
  match_id            UUID,
  accepted_team_id    UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_matches_team   ON public.open_matches(team_id);
CREATE INDEX IF NOT EXISTS idx_open_matches_status ON public.open_matches(status);
CREATE INDEX IF NOT EXISTS idx_open_matches_city   ON public.open_matches(city);

-- ============================================================
-- open_match_applications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.open_match_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_match_id         UUID NOT NULL REFERENCES public.open_matches(id) ON DELETE CASCADE,
  applying_team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  applied_by_player_id  UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  message               TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'auto_rejected')),
  responded_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (open_match_id, applying_team_id)
);

CREATE INDEX IF NOT EXISTS idx_open_match_apps_match    ON public.open_match_applications(open_match_id);
CREATE INDEX IF NOT EXISTS idx_open_match_apps_team     ON public.open_match_applications(applying_team_id);
CREATE INDEX IF NOT EXISTS idx_open_match_apps_status   ON public.open_match_applications(status);

-- ============================================================
-- team_stats
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_stats (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                     UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Match counts
  matches_played              INTEGER NOT NULL DEFAULT 0,
  rated_matches               INTEGER NOT NULL DEFAULT 0,
  friendly_matches            INTEGER NOT NULL DEFAULT 0,
  wins                        INTEGER NOT NULL DEFAULT 0,
  losses                      INTEGER NOT NULL DEFAULT 0,

  -- Streaks
  current_win_streak          INTEGER NOT NULL DEFAULT 0,
  best_win_streak             INTEGER NOT NULL DEFAULT 0,
  current_beat_expected_streak INTEGER NOT NULL DEFAULT 0,
  best_beat_expected_streak   INTEGER NOT NULL DEFAULT 0,

  -- Notable wins
  times_beat_expected         INTEGER NOT NULL DEFAULT 0,
  upset_wins                  INTEGER NOT NULL DEFAULT 0,    -- beat significantly stronger team
  biggest_upset_match_id      UUID,

  -- Location tendencies
  most_played_city            TEXT,
  most_played_area            TEXT,
  most_played_venue_id        UUID,

  -- Bars
  bars_earned_as_team         INTEGER NOT NULL DEFAULT 0,

  -- Cached
  cached_win_rate             NUMERIC(5,2),
  cached_recent_form          TEXT,           -- e.g. 'WWLWW' (last 5, newest-first)

  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- team_badges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  badge_key   TEXT NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB,
  UNIQUE (team_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_team_badges_team ON public.team_badges(team_id);

-- ============================================================
-- team_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  reporting_player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL,
  details             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  admin_notes         TEXT,
  reviewed_by         UUID,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_reports_team   ON public.team_reports(reported_team_id);
CREATE INDEX IF NOT EXISTS idx_team_reports_status ON public.team_reports(status);

-- ============================================================
-- team_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  blocked_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_team_id, blocked_team_id),
  CONSTRAINT no_self_block CHECK (blocker_team_id <> blocked_team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_blocks_blocker ON public.team_blocks(blocker_team_id);
CREATE INDEX IF NOT EXISTS idx_team_blocks_blocked ON public.team_blocks(blocked_team_id);

-- ============================================================
-- team_rating_snapshots
-- Populated during match processing — stores pre/post ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_rating_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- match_id FK to matches added in migration 004
  match_id              UUID NOT NULL,
  team_id               UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player1_id            UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  player2_id            UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_rating_before    INTEGER NOT NULL,
  team_rating_after     INTEGER NOT NULL,
  player1_rating_before INTEGER NOT NULL,
  player1_rating_after  INTEGER NOT NULL,
  player2_rating_before INTEGER NOT NULL,
  player2_rating_after  INTEGER NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_rating_snapshots_match ON public.team_rating_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_team_rating_snapshots_team  ON public.team_rating_snapshots(team_id);

-- ============================================================
-- Trigger: recalculate team rating & activate team when 2nd member joins
-- ============================================================
CREATE OR REPLACE FUNCTION on_team_member_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count     INT;
  v_players   UUID[];
  v_ratings   INTEGER[];
  v_pair_key  TEXT;
  v_avg_rating INTEGER;
  v_names     TEXT[];
BEGIN
  SELECT
    COUNT(*),
    ARRAY_AGG(tm.player_id ORDER BY tm.player_id),
    ARRAY_AGG(pp.current_rating ORDER BY tm.player_id),
    ARRAY_AGG(COALESCE(pp.first_name, '') ORDER BY tm.player_id)
  INTO v_count, v_players, v_ratings, v_names
  FROM team_members tm
  JOIN player_profiles pp ON pp.id = tm.player_id
  WHERE tm.team_id = NEW.team_id;

  IF v_count = 2 THEN
    v_pair_key   := v_players[1]::text || ':' || v_players[2]::text;
    v_avg_rating := (v_ratings[1] + v_ratings[2]) / 2;

    UPDATE public.teams SET
      pair_key                 = v_pair_key,
      status                   = 'active',
      cached_current_team_rating = v_avg_rating,
      auto_name                = v_names[1] || ' + ' || v_names[2],
      updated_at               = NOW()
    WHERE id = NEW.team_id;

    -- Mark both players as match-ready
    UPDATE public.player_profiles SET match_ready = TRUE
    WHERE id = ANY(v_players) AND match_ready = FALSE;

    -- Ensure team_stats row exists
    INSERT INTO public.team_stats (team_id)
    VALUES (NEW.team_id)
    ON CONFLICT (team_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_member_added
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION on_team_member_added();

-- ============================================================
-- Function: recalculate_team_rating (called after match processing)
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_team_rating(p_team_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg INTEGER;
BEGIN
  SELECT AVG(pp.current_rating)::INTEGER
  INTO v_avg
  FROM team_members tm
  JOIN player_profiles pp ON pp.id = tm.player_id
  WHERE tm.team_id = p_team_id;

  IF v_avg IS NOT NULL THEN
    UPDATE public.teams
    SET cached_current_team_rating = v_avg, updated_at = NOW()
    WHERE id = p_team_id;
  END IF;

  RETURN v_avg;
END;
$$;

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at_teams()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_team_invitations_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_team_challenges_updated_at
  BEFORE UPDATE ON public.team_challenges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_open_matches_updated_at
  BEFORE UPDATE ON public.open_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_open_match_apps_updated_at
  BEFORE UPDATE ON public.open_match_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

-- ============================================================
-- RLS — Enable on all tables
-- ============================================================
ALTER TABLE public.teams                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_challenges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_challenge_counteroffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_matches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_match_applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_stats                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_badges                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_blocks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_rating_snapshots        ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of this team?
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.player_profiles pp ON pp.id = tm.player_id
    WHERE tm.team_id = p_team_id AND pp.user_id = auth.uid()
  );
$$;

-- Helper: get current user's player_profile id
CREATE OR REPLACE FUNCTION my_player_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.player_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── teams ─────────────────────────────────────────────────────
-- Read: own teams OR discoverable active teams (all authenticated users)
CREATE POLICY "team_select" ON public.teams FOR SELECT TO authenticated
  USING (
    is_team_member(id)
    OR (status = 'active' AND is_discoverable = TRUE)
  );

-- Insert: authenticated users (captain creates team with themselves)
CREATE POLICY "team_insert" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (created_by = my_player_id());

-- Update: captain only
CREATE POLICY "team_update" ON public.teams FOR UPDATE TO authenticated
  USING (captain_player_id = my_player_id());

-- ── team_members ──────────────────────────────────────────────
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated
  USING (is_team_member(team_id));

CREATE POLICY "team_members_insert" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (is_team_member(team_id) OR player_id = my_player_id());

CREATE POLICY "team_members_delete" ON public.team_members FOR DELETE TO authenticated
  USING (player_id = my_player_id());

-- ── team_invitations ──────────────────────────────────────────
-- Inviter or invitee can see
CREATE POLICY "team_invitations_select" ON public.team_invitations FOR SELECT TO authenticated
  USING (
    inviter_player_id = my_player_id()
    OR invitee_player_id = my_player_id()
    OR is_team_member(team_id)
  );

-- Team members can create invitations
CREATE POLICY "team_invitations_insert" ON public.team_invitations FOR INSERT TO authenticated
  WITH CHECK (inviter_player_id = my_player_id() AND is_team_member(team_id));

-- Inviter can cancel; invitee can accept/reject
CREATE POLICY "team_invitations_update" ON public.team_invitations FOR UPDATE TO authenticated
  USING (inviter_player_id = my_player_id() OR invitee_player_id = my_player_id());

-- ── team_challenges ───────────────────────────────────────────
CREATE POLICY "team_challenges_select" ON public.team_challenges FOR SELECT TO authenticated
  USING (
    is_team_member(challenging_team_id)
    OR is_team_member(challenged_team_id)
  );

CREATE POLICY "team_challenges_insert" ON public.team_challenges FOR INSERT TO authenticated
  WITH CHECK (
    sender_player_id = my_player_id()
    AND is_team_member(challenging_team_id)
  );

CREATE POLICY "team_challenges_update" ON public.team_challenges FOR UPDATE TO authenticated
  USING (
    is_team_member(challenging_team_id)
    OR is_team_member(challenged_team_id)
  );

-- ── team_challenge_counteroffers ──────────────────────────────
CREATE POLICY "counteroffers_select" ON public.team_challenge_counteroffers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_challenges tc
      WHERE tc.id = challenge_id
        AND (is_team_member(tc.challenging_team_id) OR is_team_member(tc.challenged_team_id))
    )
  );

CREATE POLICY "counteroffers_insert" ON public.team_challenge_counteroffers FOR INSERT TO authenticated
  WITH CHECK (offered_by_player_id = my_player_id() AND is_team_member(offered_by_team_id));

CREATE POLICY "counteroffers_update" ON public.team_challenge_counteroffers FOR UPDATE TO authenticated
  USING (offered_by_player_id = my_player_id());

-- ── open_matches ──────────────────────────────────────────────
-- All authenticated players can see open matches in 'open' status
CREATE POLICY "open_matches_select" ON public.open_matches FOR SELECT TO authenticated
  USING (status = 'open' OR is_team_member(team_id));

-- Only team members (captain in practice, enforced app-side) can create
CREATE POLICY "open_matches_insert" ON public.open_matches FOR INSERT TO authenticated
  WITH CHECK (created_by_player_id = my_player_id() AND is_team_member(team_id));

-- Team members can update (cancel, accept application)
CREATE POLICY "open_matches_update" ON public.open_matches FOR UPDATE TO authenticated
  USING (is_team_member(team_id));

-- ── open_match_applications ───────────────────────────────────
-- Creator team sees all; applicant team sees their own
CREATE POLICY "open_match_apps_select" ON public.open_match_applications FOR SELECT TO authenticated
  USING (
    is_team_member(applying_team_id)
    OR EXISTS (
      SELECT 1 FROM public.open_matches om
      WHERE om.id = open_match_id AND is_team_member(om.team_id)
    )
  );

CREATE POLICY "open_match_apps_insert" ON public.open_match_applications FOR INSERT TO authenticated
  WITH CHECK (applied_by_player_id = my_player_id() AND is_team_member(applying_team_id));

CREATE POLICY "open_match_apps_update" ON public.open_match_applications FOR UPDATE TO authenticated
  USING (
    is_team_member(applying_team_id)
    OR EXISTS (
      SELECT 1 FROM public.open_matches om
      WHERE om.id = open_match_id AND is_team_member(om.team_id)
    )
  );

-- ── team_stats ────────────────────────────────────────────────
-- All authenticated can read stats of active discoverable teams; own team always
CREATE POLICY "team_stats_select" ON public.team_stats FOR SELECT TO authenticated
  USING (
    is_team_member(team_id)
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.status = 'active' AND t.is_discoverable = TRUE)
  );

-- ── team_badges ───────────────────────────────────────────────
CREATE POLICY "team_badges_select" ON public.team_badges FOR SELECT TO authenticated
  USING (
    is_team_member(team_id)
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.status = 'active' AND t.is_discoverable = TRUE)
  );

-- ── team_reports ──────────────────────────────────────────────
CREATE POLICY "team_reports_insert" ON public.team_reports FOR INSERT TO authenticated
  WITH CHECK (reporting_player_id = my_player_id());

CREATE POLICY "team_reports_select" ON public.team_reports FOR SELECT TO authenticated
  USING (reporting_player_id = my_player_id());

-- ── team_blocks ───────────────────────────────────────────────
CREATE POLICY "team_blocks_select" ON public.team_blocks FOR SELECT TO authenticated
  USING (is_team_member(blocker_team_id));

CREATE POLICY "team_blocks_insert" ON public.team_blocks FOR INSERT TO authenticated
  WITH CHECK (is_team_member(blocker_team_id));

CREATE POLICY "team_blocks_delete" ON public.team_blocks FOR DELETE TO authenticated
  USING (is_team_member(blocker_team_id));

-- ── team_rating_snapshots ─────────────────────────────────────
CREATE POLICY "team_rating_snapshots_select" ON public.team_rating_snapshots FOR SELECT TO authenticated
  USING (is_team_member(team_id));

-- ============================================================
-- Additional app_settings seeds for Module 03/04 (not in 001)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('TEAM_DISCOVERABILITY_DEFAULT',       'true',          'Whether new teams are discoverable by default'),
  ('AI_MATCH_EXPLANATION_AVAILABILITY',  '"paid_only"',   'Who can see AI match explanations: free | paid_only | disabled')
ON CONFLICT (key) DO NOTHING;
