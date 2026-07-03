-- ============================================================
-- Migration 007: Leaderboards, Rankings, and Seasons
-- Run AFTER 006_processing.sql
-- ============================================================

-- ============================================================
-- seasons
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_status ON public.seasons(status);

-- ============================================================
-- leaderboard_configs
-- One row per distinct leaderboard (metric × scope × time window)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  slug                        TEXT NOT NULL UNIQUE,
  entity_type                 TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),

  -- What is being ranked
  metric_key                  TEXT NOT NULL,  -- see metric_key values in spec

  -- Time window
  time_window                 TEXT NOT NULL DEFAULT 'all_time'
                              CHECK (time_window IN ('today', 'weekly', 'monthly', 'season', 'all_time', 'custom')),
  custom_starts_at            TIMESTAMPTZ,
  custom_ends_at              TIMESTAMPTZ,
  season_id                   UUID REFERENCES public.seasons(id) ON DELETE SET NULL,

  -- Geographic scope
  scope_type                  TEXT NOT NULL DEFAULT 'global'
                              CHECK (scope_type IN ('global', 'country', 'city', 'area', 'venue', 'custom')),
  scope_country               TEXT,
  scope_city                  TEXT,
  scope_area                  TEXT,
  scope_venue_id              UUID,

  -- Eligibility rules
  min_rated_matches           INTEGER NOT NULL DEFAULT 1,
  inactivity_threshold_days   INTEGER NOT NULL DEFAULT 30,  -- null = no inactivity hiding
  minimum_ranked_entities     INTEGER NOT NULL DEFAULT 1,   -- hide leaderboard if below this count

  -- Filters (JSON for extensibility: gender, rating_min/max, paid_only etc.)
  filters_json                JSONB,

  -- Tie-breaker order (JSON array of metric keys)
  tie_breakers_json           JSONB NOT NULL DEFAULT '["rated_wins","win_rate","matches_played","first_rated_match_date","created_at","id"]',

  -- Display and access
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured                 BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom                   BOOLEAN NOT NULL DEFAULT FALSE,
  is_frozen                   BOOLEAN NOT NULL DEFAULT FALSE,
  display_order               INTEGER NOT NULL DEFAULT 0,
  visible_to                  TEXT NOT NULL DEFAULT 'logged_in'
                              CHECK (visible_to IN ('logged_in', 'paid_only', 'admin_only', 'hidden')),

  -- Refresh tracking
  last_refreshed_at           TIMESTAMPTZ,
  last_refresh_triggered_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lb_configs_entity   ON public.leaderboard_configs(entity_type);
CREATE INDEX IF NOT EXISTS idx_lb_configs_metric    ON public.leaderboard_configs(metric_key);
CREATE INDEX IF NOT EXISTS idx_lb_configs_active    ON public.leaderboard_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_lb_configs_featured  ON public.leaderboard_configs(is_featured);

-- ============================================================
-- leaderboard_entries
-- Current standings after latest refresh (one per entity per config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id             UUID NOT NULL REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,
  entity_type           TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),
  player_id             UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES public.teams(id) ON DELETE CASCADE,

  rank                  INTEGER NOT NULL,
  previous_rank         INTEGER,
  rank_change           INTEGER GENERATED ALWAYS AS (
                          CASE WHEN previous_rank IS NULL THEN NULL
                               ELSE previous_rank - rank
                          END
                        ) STORED,

  metric_value          NUMERIC NOT NULL,
  tie_breaker_values_json JSONB,

  is_active_eligible    BOOLEAN NOT NULL DEFAULT TRUE,  -- false = hidden due to inactivity
  hidden_by_admin       BOOLEAN NOT NULL DEFAULT FALSE,

  refreshed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (config_id, player_id),
  UNIQUE (config_id, team_id),
  CHECK (
    (entity_type = 'player' AND player_id IS NOT NULL AND team_id IS NULL) OR
    (entity_type = 'team'   AND team_id   IS NOT NULL AND player_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lb_entries_config   ON public.leaderboard_entries(config_id);
CREATE INDEX IF NOT EXISTS idx_lb_entries_player   ON public.leaderboard_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_lb_entries_team     ON public.leaderboard_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_lb_entries_rank     ON public.leaderboard_entries(config_id, rank);

-- ============================================================
-- leaderboard_snapshots
-- One row per refresh event (daily, manual, season_final, freeze)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id       UUID NOT NULL REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,
  snapshot_type   TEXT NOT NULL CHECK (snapshot_type IN ('daily', 'manual', 'season_final', 'freeze')),
  snapshot_label  TEXT,
  entry_count     INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_config ON public.leaderboard_snapshots(config_id);
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_type   ON public.leaderboard_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_date   ON public.leaderboard_snapshots(created_at DESC);

-- ============================================================
-- leaderboard_snapshot_entries
-- Immutable ranked entries within each snapshot
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshot_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id   UUID NOT NULL REFERENCES public.leaderboard_snapshots(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),
  player_id     UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  team_id       UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  rank          INTEGER NOT NULL,
  metric_value  NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lb_snap_entries_snapshot ON public.leaderboard_snapshot_entries(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_lb_snap_entries_player   ON public.leaderboard_snapshot_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_lb_snap_entries_team     ON public.leaderboard_snapshot_entries(team_id);

-- ============================================================
-- custom_leaderboards
-- Extended metadata for admin-created custom leaderboards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_leaderboards (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_config_id     UUID NOT NULL UNIQUE REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,
  description               TEXT,
  prize_description         TEXT,
  sponsor_name              TEXT,
  starts_at                 TIMESTAMPTZ,
  ends_at                   TIMESTAMPTZ,
  included_entities_json    JSONB,  -- null = all eligible
  excluded_entities_json    JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- leaderboard_freezes
-- Records when/why a leaderboard was frozen
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_freezes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id             UUID NOT NULL REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,
  snapshot_id           UUID REFERENCES public.leaderboard_snapshots(id) ON DELETE SET NULL,
  frozen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason                TEXT,
  prize_distribution_notes TEXT
);

-- ============================================================
-- leaderboard_visibility_overrides
-- Admin manual hide without suspension
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_visibility_overrides (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type             TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),
  player_id               UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_id                 UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  leaderboard_config_id   UUID REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,  -- null = hide from all
  is_hidden               BOOLEAN NOT NULL DEFAULT TRUE,
  reason                  TEXT,
  expires_at              TIMESTAMPTZ,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (entity_type = 'player' AND player_id IS NOT NULL AND team_id IS NULL) OR
    (entity_type = 'team'   AND team_id   IS NOT NULL AND player_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lb_overrides_player ON public.leaderboard_visibility_overrides(player_id);
CREATE INDEX IF NOT EXISTS idx_lb_overrides_team   ON public.leaderboard_visibility_overrides(team_id);

-- ============================================================
-- leaderboard_notifications_log
-- Tracks rank-change notifications sent (prevents duplicates)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_notifications_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id           UUID NOT NULL REFERENCES public.leaderboard_configs(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),
  player_id           UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_id             UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  notification_type   TEXT NOT NULL,  -- 'entered_top_10', 'lost_top_10', 'became_number_1', etc.
  old_rank            INTEGER,
  new_rank            INTEGER,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lb_notif_log_player ON public.leaderboard_notifications_log(player_id);
CREATE INDEX IF NOT EXISTS idx_lb_notif_log_config ON public.leaderboard_notifications_log(config_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.seasons                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_configs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshot_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_leaderboards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_freezes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_notifications_log  ENABLE ROW LEVEL SECURITY;

-- Seasons: all authenticated users can read active/completed
CREATE POLICY "seasons_read" ON public.seasons FOR SELECT TO authenticated
  USING (status IN ('active', 'completed'));

-- Leaderboard configs: authenticated users see logged_in configs
CREATE POLICY "lb_configs_read" ON public.leaderboard_configs FOR SELECT TO authenticated
  USING (is_active = TRUE AND visible_to IN ('logged_in', 'paid_only'));

-- Leaderboard entries: authenticated users see active entries
CREATE POLICY "lb_entries_read" ON public.leaderboard_entries FOR SELECT TO authenticated
  USING (
    is_active_eligible = TRUE
    AND hidden_by_admin = FALSE
    AND EXISTS (
      SELECT 1 FROM public.leaderboard_configs c
      WHERE c.id = config_id AND c.is_active = TRUE AND c.visible_to IN ('logged_in', 'paid_only')
    )
  );

-- Snapshots: authenticated users can read
CREATE POLICY "lb_snapshots_read" ON public.leaderboard_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leaderboard_configs c
      WHERE c.id = config_id AND c.is_active = TRUE
    )
  );

CREATE POLICY "lb_snap_entries_read" ON public.leaderboard_snapshot_entries FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "custom_lb_read" ON public.custom_leaderboards FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "lb_freezes_read" ON public.leaderboard_freezes FOR SELECT TO authenticated
  USING (TRUE);

-- Visibility overrides: admin only
CREATE POLICY "lb_overrides_admin" ON public.leaderboard_visibility_overrides FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Notifications log: admin only
CREATE POLICY "lb_notif_log_admin" ON public.leaderboard_notifications_log FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin full access
CREATE POLICY "admins_all_seasons"       ON public.seasons                      FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_lb_configs"    ON public.leaderboard_configs           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_lb_entries"    ON public.leaderboard_entries           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_lb_snapshots"  ON public.leaderboard_snapshots         FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_lb_snap_ent"   ON public.leaderboard_snapshot_entries  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_custom_lb"     ON public.custom_leaderboards           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admins_all_lb_freezes"    ON public.leaderboard_freezes           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE TRIGGER set_seasons_updated_at
  BEFORE UPDATE ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_lb_configs_updated_at
  BEFORE UPDATE ON public.leaderboard_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Seed default leaderboard configs
-- ============================================================
INSERT INTO public.leaderboard_configs
  (name, slug, entity_type, metric_key, time_window, scope_type, display_order, is_featured)
VALUES
  -- Player leaderboards
  ('Overall Rating',          'player-rating-global',        'player', 'current_rating',                  'all_time', 'global', 10, TRUE),
  ('Weekly Rating Gain',      'player-rating-gain-weekly',   'player', 'rating_gain_total',               'weekly',   'global', 20, FALSE),
  ('Monthly Rating Gain',     'player-rating-gain-monthly',  'player', 'rating_gain_total',               'monthly',  'global', 30, FALSE),
  ('Winning Streak',          'player-win-streak-current',   'player', 'current_winning_streak',          'all_time', 'global', 40, FALSE),
  ('Best Winning Streak',     'player-win-streak-best',      'player', 'best_winning_streak',             'all_time', 'global', 50, FALSE),
  ('Beat-Expected Streak',    'player-beat-exp-streak',      'player', 'current_beat_expected_streak',    'all_time', 'global', 60, FALSE),
  ('Most Matches Played',     'player-activity-rated',       'player', 'rated_match_activity',            'all_time', 'global', 70, FALSE),
  ('Active Bars Balance',     'player-bars-active',          'player', 'bars_active_balance',             'all_time', 'global', 80, FALSE),
  ('Total Bars Earned',       'player-bars-total',           'player', 'bars_total_earned_including_locked','all_time','global',90, FALSE),
  -- Team leaderboards
  ('Top Teams by Rating',     'team-rating-global',          'team',   'current_team_rating',             'all_time', 'global', 100, TRUE),
  ('Team Performance',        'team-performance',            'team',   'team_performance_score',          'all_time', 'global', 110, FALSE),
  ('Team Win Rate',           'team-win-rate',               'team',   'win_rate',                        'all_time', 'global', 120, FALSE),
  ('Team Winning Streak',     'team-win-streak',             'team',   'current_winning_streak',          'all_time', 'global', 130, FALSE)
ON CONFLICT (slug) DO NOTHING;
