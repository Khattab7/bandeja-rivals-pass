-- ============================================================
-- Migration 004: Matchmaking and Discovery tables
-- Run in Supabase SQL Editor AFTER 003_teams.sql
-- Dependencies: 003_teams.sql
-- ============================================================

-- ============================================================
-- team_discovery_preferences
-- Per-team discovery settings (captain controls)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_discovery_preferences (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                   UUID NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,

  is_discoverable           BOOLEAN NOT NULL DEFAULT TRUE,
  open_to_challenges        BOOLEAN NOT NULL DEFAULT TRUE,

  -- Rating range preferences for challenges
  challenge_rating_min      INTEGER,                    -- NULL = no minimum
  challenge_rating_max      INTEGER,                    -- NULL = no maximum

  -- Location preferences
  preferred_city            TEXT,
  preferred_areas           TEXT[],                     -- array of area strings

  -- Gender preference for opponents
  gender_preference         TEXT CHECK (gender_preference IN ('male', 'female', 'mixed', 'any')),

  -- Whether to accept challenges from unknown teams (no prior interaction)
  allow_unknown_challenges  BOOLEAN NOT NULL DEFAULT TRUE,

  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disc_prefs_team ON public.team_discovery_preferences(team_id);

-- ============================================================
-- discovery_hides
-- Mutual team-to-team hides from discovery feed (not full blocks)
-- V1: hide is mutual — if A hides B, B also won't see A
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discovery_hides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_team_id   UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  target_team_id  UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_team_id, target_team_id),
  CONSTRAINT no_self_hide CHECK (actor_team_id <> target_team_id)
);

CREATE INDEX IF NOT EXISTS idx_disc_hides_actor  ON public.discovery_hides(actor_team_id);
CREATE INDEX IF NOT EXISTS idx_disc_hides_target ON public.discovery_hides(target_team_id);

-- ============================================================
-- saved_discovery_items
-- Teams and open matches saved for later from the discovery feed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_discovery_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_team_id   UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('team', 'open_match')),
  -- Saved team or open_match id — no FK to allow either type
  item_id         UUID NOT NULL,
  saved_by_player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_team_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_team ON public.saved_discovery_items(actor_team_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_item ON public.saved_discovery_items(item_id);

-- ============================================================
-- discovery_events
-- Analytics: every swipe, pass, save, challenge, filter use
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discovery_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  actor_player_id   UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL
                    CHECK (event_type IN (
                      'view', 'pass', 'save', 'unsave', 'challenge',
                      'open_match_apply', 'filter_change', 'preview_match',
                      'why_this_match', 'undo'
                    )),
  feed_type         TEXT CHECK (feed_type IN ('team_discovery', 'open_matches')),
  target_team_id    UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  target_open_match_id UUID REFERENCES public.open_matches(id) ON DELETE SET NULL,
  filters_snapshot  JSONB,     -- filters active when event occurred
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disc_events_actor ON public.discovery_events(actor_team_id);
CREATE INDEX IF NOT EXISTS idx_disc_events_type  ON public.discovery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_disc_events_at    ON public.discovery_events(created_at DESC);

-- ============================================================
-- team_saved_filters
-- Per-team saved filter presets for each feed type
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_saved_filters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  feed_type   TEXT NOT NULL CHECK (feed_type IN ('team_discovery', 'open_matches')),
  name        TEXT,              -- optional user-given preset name
  filters     JSONB NOT NULL,    -- full filter state
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, feed_type, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_team ON public.team_saved_filters(team_id);

-- ============================================================
-- featured_discovery_items
-- Admin-featured teams/open matches with optional area scope and time window
-- ============================================================
CREATE TABLE IF NOT EXISTS public.featured_discovery_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type     TEXT NOT NULL CHECK (item_type IN ('team', 'open_match')),
  item_id       UUID NOT NULL,
  feed_type     TEXT NOT NULL CHECK (feed_type IN ('team_discovery', 'open_matches')),
  area_scope    TEXT,            -- NULL = all areas; specific area = scoped boost
  city_scope    TEXT,
  priority      INTEGER NOT NULL DEFAULT 0,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_by    UUID,            -- admin player id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featured_items_feed   ON public.featured_discovery_items(feed_type);
CREATE INDEX IF NOT EXISTS idx_featured_items_active ON public.featured_discovery_items(starts_at, ends_at);

-- ============================================================
-- discovery_ranking_configs
-- Admin-configurable weights per feed type (single row per feed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discovery_ranking_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type   TEXT NOT NULL UNIQUE CHECK (feed_type IN ('team_discovery', 'open_matches')),
  weights     JSONB NOT NULL,    -- key-value: factor_name -> weight
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default ranking weights
INSERT INTO public.discovery_ranking_configs (feed_type, weights) VALUES
  ('team_discovery', '{
    "rating_balance": 0.30,
    "rematch": 0.15,
    "same_area": 0.15,
    "availability_overlap": 0.10,
    "recent_activity": 0.08,
    "never_played": 0.07,
    "underdog_opportunity": 0.05,
    "stronger_team": 0.05,
    "paid_rival_boost": 0.05
  }'::jsonb),
  ('open_matches', '{
    "rating_balance": 0.40,
    "soonest_datetime": 0.30,
    "same_area": 0.20,
    "combined_score": 0.10
  }'::jsonb)
ON CONFLICT (feed_type) DO NOTHING;

-- ============================================================
-- updated_at trigger helper (reuse from 003 via pg function)
-- ============================================================
CREATE TRIGGER trg_disc_prefs_updated_at
  BEFORE UPDATE ON public.team_discovery_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

CREATE TRIGGER trg_saved_filters_updated_at
  BEFORE UPDATE ON public.team_saved_filters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_teams();

-- ============================================================
-- Auto-create team_discovery_preferences when team activates
-- (uses existing trg_team_member_added trigger in 003)
-- ============================================================
CREATE OR REPLACE FUNCTION on_team_activated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- When team transitions to 'active', create discovery preferences
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status <> 'active') THEN
    INSERT INTO public.team_discovery_preferences (team_id)
    VALUES (NEW.id)
    ON CONFLICT (team_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_activated
  AFTER UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION on_team_activated();

-- ============================================================
-- RLS — Enable on all tables
-- ============================================================
ALTER TABLE public.team_discovery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_hides            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_discovery_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_saved_filters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_discovery_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_ranking_configs  ENABLE ROW LEVEL SECURITY;

-- ── team_discovery_preferences ────────────────────────────────
CREATE POLICY "disc_prefs_select" ON public.team_discovery_preferences FOR SELECT TO authenticated
  USING (is_team_member(team_id) OR (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.status = 'active' AND t.is_discoverable)
  ));

CREATE POLICY "disc_prefs_upsert" ON public.team_discovery_preferences FOR INSERT TO authenticated
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "disc_prefs_update" ON public.team_discovery_preferences FOR UPDATE TO authenticated
  USING (is_team_member(team_id));

-- ── discovery_hides ───────────────────────────────────────────
CREATE POLICY "disc_hides_select" ON public.discovery_hides FOR SELECT TO authenticated
  USING (is_team_member(actor_team_id));

CREATE POLICY "disc_hides_insert" ON public.discovery_hides FOR INSERT TO authenticated
  WITH CHECK (is_team_member(actor_team_id));

CREATE POLICY "disc_hides_delete" ON public.discovery_hides FOR DELETE TO authenticated
  USING (is_team_member(actor_team_id));

-- ── saved_discovery_items ─────────────────────────────────────
CREATE POLICY "saved_items_select" ON public.saved_discovery_items FOR SELECT TO authenticated
  USING (is_team_member(actor_team_id));

CREATE POLICY "saved_items_insert" ON public.saved_discovery_items FOR INSERT TO authenticated
  WITH CHECK (is_team_member(actor_team_id) AND saved_by_player_id = my_player_id());

CREATE POLICY "saved_items_delete" ON public.saved_discovery_items FOR DELETE TO authenticated
  USING (is_team_member(actor_team_id));

-- ── discovery_events ──────────────────────────────────────────
CREATE POLICY "disc_events_insert" ON public.discovery_events FOR INSERT TO authenticated
  WITH CHECK (is_team_member(actor_team_id) AND actor_player_id = my_player_id());

-- Users don't read their own raw events; analytics via admin only

-- ── team_saved_filters ────────────────────────────────────────
CREATE POLICY "saved_filters_select" ON public.team_saved_filters FOR SELECT TO authenticated
  USING (is_team_member(team_id));

CREATE POLICY "saved_filters_upsert" ON public.team_saved_filters FOR INSERT TO authenticated
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "saved_filters_update" ON public.team_saved_filters FOR UPDATE TO authenticated
  USING (is_team_member(team_id));

CREATE POLICY "saved_filters_delete" ON public.team_saved_filters FOR DELETE TO authenticated
  USING (is_team_member(team_id));

-- ── featured_discovery_items ──────────────────────────────────
-- All authenticated users can see featured items
CREATE POLICY "featured_items_select" ON public.featured_discovery_items FOR SELECT TO authenticated
  USING (true);

-- ── discovery_ranking_configs ─────────────────────────────────
-- All authenticated users can read ranking configs (transparency)
CREATE POLICY "ranking_configs_select" ON public.discovery_ranking_configs FOR SELECT TO authenticated
  USING (true);
