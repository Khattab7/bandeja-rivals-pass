-- ============================================================
-- Migration 008: Quests and Gamification
-- Run AFTER 007_leaderboards.sql
-- ============================================================

-- ============================================================
-- quest_templates
-- Repeatable definitions authored by admins
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_templates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name                      TEXT NOT NULL,
  description               TEXT,
  scope                     TEXT NOT NULL
                            CHECK (scope IN ('player', 'team', 'area_city', 'season', 'event_tournament', 'sponsor')),
  quest_type                TEXT NOT NULL,  -- e.g. 'win_x_matches', 'beat_expected_x_times', 'reach_top_10', etc.
  difficulty                TEXT NOT NULL DEFAULT 'medium'
                            CHECK (difficulty IN ('easy', 'medium', 'hard', 'elite')),
  access_level              TEXT NOT NULL DEFAULT 'all_users'
                            CHECK (access_level IN ('free', 'paid_member', 'all_users')),

  -- Objective configuration (e.g. {"target": 3, "type": "wins"})
  objective_json            JSONB NOT NULL,

  -- Who sees/participates (country, city, area, gender, rating_min/max, paid_only, etc.)
  target_filters_json       JSONB,

  -- Reward configuration (can be overridden per instance)
  reward_config_json        JSONB,

  -- Timing and repeat behavior
  time_period               TEXT NOT NULL DEFAULT 'one_time'
                            CHECK (time_period IN ('daily', 'weekly', 'monthly', 'seasonal', 'one_time', 'custom')),
  repeat_config_json        JSONB,           -- { frequency, auto_generate_next, ... }
  default_deadline_time     TIME,            -- admin-selected, Egypt time
  default_timezone          TEXT NOT NULL DEFAULT 'Africa/Cairo',

  -- Linked leaderboard
  creates_linked_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,

  -- Social behavior
  social_feed_posting       BOOLEAN NOT NULL DEFAULT TRUE,
  follower_notifications    BOOLEAN NOT NULL DEFAULT TRUE,
  external_sharing_enabled  BOOLEAN NOT NULL DEFAULT TRUE,

  -- Budget and completion caps (defaults; overridden per instance)
  default_reward_budget     INTEGER,         -- null = unlimited
  default_max_completions   INTEGER,         -- null = unlimited

  -- Status
  status                    TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'pending_approval', 'approved', 'live', 'paused', 'completed', 'expired', 'cancelled')),

  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qt_status      ON public.quest_templates(status);
CREATE INDEX IF NOT EXISTS idx_qt_scope       ON public.quest_templates(scope);
CREATE INDEX IF NOT EXISTS idx_qt_quest_type  ON public.quest_templates(quest_type);

-- ============================================================
-- quest_instances
-- A live occurrence of a quest template
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_instances (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id                 UUID NOT NULL REFERENCES public.quest_templates(id) ON DELETE CASCADE,

  name                        TEXT NOT NULL,
  description                 TEXT,

  -- Time bounds
  starts_at                   TIMESTAMPTZ NOT NULL,
  ends_at                     TIMESTAMPTZ NOT NULL,
  deadline_timezone           TEXT NOT NULL DEFAULT 'Africa/Cairo',

  -- Status
  status                      TEXT NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled', 'live', 'paused', 'completed', 'expired', 'cancelled', 'frozen')),

  -- Budget / completion caps
  reward_budget_total         INTEGER,        -- null = unlimited
  reward_budget_used          INTEGER NOT NULL DEFAULT 0,
  max_completions             INTEGER,        -- null = unlimited
  completions_count           INTEGER NOT NULL DEFAULT 0,

  -- Linked leaderboard (auto-created if template.creates_linked_leaderboard = true)
  linked_leaderboard_config_id UUID REFERENCES public.leaderboard_configs(id) ON DELETE SET NULL,

  -- Freeze state (for prize distributions)
  frozen_at                   TIMESTAMPTZ,
  frozen_by                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Visibility override (hide when reward pool full)
  hide_when_pool_full         BOOLEAN NOT NULL DEFAULT FALSE,

  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qi_template    ON public.quest_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_qi_status      ON public.quest_instances(status);
CREATE INDEX IF NOT EXISTS idx_qi_starts_at   ON public.quest_instances(starts_at);
CREATE INDEX IF NOT EXISTS idx_qi_ends_at     ON public.quest_instances(ends_at);

-- ============================================================
-- quest_participants
-- One row per player or team per quest instance
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_participants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_instance_id     UUID NOT NULL REFERENCES public.quest_instances(id) ON DELETE CASCADE,

  -- Either player or team participation
  player_id             UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Progress
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'claimed', 'expired', 'disqualified', 'reversed')),
  progress_current      INTEGER NOT NULL DEFAULT 0,
  progress_target       INTEGER NOT NULL,
  progress_json         JSONB,               -- detailed per-objective progress if multi-step
  completed_at          TIMESTAMPTZ,
  claimed_at            TIMESTAMPTZ,

  -- Reward lock state (if membership expired before claim)
  reward_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  reward_locked_reason  TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (quest_instance_id, player_id),
  UNIQUE (quest_instance_id, team_id),
  CHECK (
    (player_id IS NOT NULL AND team_id IS NULL) OR
    (team_id   IS NOT NULL AND player_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_qp_quest     ON public.quest_participants(quest_instance_id);
CREATE INDEX IF NOT EXISTS idx_qp_player    ON public.quest_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_qp_team      ON public.quest_participants(team_id);
CREATE INDEX IF NOT EXISTS idx_qp_status    ON public.quest_participants(status);

-- ============================================================
-- quest_progress_events
-- Immutable ledger of progress increments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_progress_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_instance_id       UUID NOT NULL REFERENCES public.quest_instances(id) ON DELETE CASCADE,
  quest_participant_id    UUID NOT NULL REFERENCES public.quest_participants(id) ON DELETE CASCADE,

  source_type             TEXT NOT NULL
                          CHECK (source_type IN (
                            'match_processed', 'challenge_sent', 'challenge_accepted',
                            'leaderboard_refresh', 'bars_earned', 'admin_adjustment', 'reversal'
                          )),
  source_id               UUID,              -- match_id, challenge_id, leaderboard_entry_id etc.

  progress_delta          INTEGER NOT NULL,  -- positive = gain, negative = reversal
  progress_before         INTEGER NOT NULL,
  progress_after          INTEGER NOT NULL,

  event_metadata          JSONB,             -- extra context: opponent_team_id, bars_amount, etc.

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qpe_instance       ON public.quest_progress_events(quest_instance_id);
CREATE INDEX IF NOT EXISTS idx_qpe_participant     ON public.quest_progress_events(quest_participant_id);
CREATE INDEX IF NOT EXISTS idx_qpe_source         ON public.quest_progress_events(source_type, source_id);

-- ============================================================
-- quest_rewards
-- Rewards defined per quest instance
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_instance_id   UUID NOT NULL REFERENCES public.quest_instances(id) ON DELETE CASCADE,
  reward_type         TEXT NOT NULL CHECK (reward_type IN ('bars', 'badge', 'status', 'no_reward')),
  reward_amount       INTEGER,               -- for bars
  badge_key           TEXT,                  -- for badge rewards
  bars_include_locked BOOLEAN NOT NULL DEFAULT TRUE,  -- if false = active members only
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_instance ON public.quest_rewards(quest_instance_id);

-- ============================================================
-- quest_claims
-- Manual claim records (one per participant)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_claims (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_instance_id       UUID NOT NULL REFERENCES public.quest_instances(id) ON DELETE CASCADE,
  quest_participant_id    UUID NOT NULL UNIQUE REFERENCES public.quest_participants(id) ON DELETE CASCADE,
  claimed_by_player_id    UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,

  status                  TEXT NOT NULL DEFAULT 'claimed'
                          CHECK (status IN ('claimed', 'locked', 'reversed')),

  -- Snapshot of what was awarded
  reward_result_json      JSONB,

  -- Bars ledger entry created (if bars reward)
  bars_ledger_id          UUID,

  claimed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at             TIMESTAMPTZ,
  reversed_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversal_reason         TEXT
);

CREATE INDEX IF NOT EXISTS idx_qcl_instance     ON public.quest_claims(quest_instance_id);
CREATE INDEX IF NOT EXISTS idx_qcl_player       ON public.quest_claims(claimed_by_player_id);

-- ============================================================
-- quest_admin_approvals
-- Approval audit trail per template or instance
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quest_admin_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID REFERENCES public.quest_templates(id) ON DELETE CASCADE,
  instance_id         UUID REFERENCES public.quest_instances(id) ON DELETE CASCADE,
  approval_status     TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes        TEXT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (template_id IS NOT NULL OR instance_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_qaa_template ON public.quest_admin_approvals(template_id);
CREATE INDEX IF NOT EXISTS idx_qaa_instance ON public.quest_admin_approvals(instance_id);
CREATE INDEX IF NOT EXISTS idx_qaa_status   ON public.quest_admin_approvals(approval_status);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.quest_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_instances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_progress_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_rewards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_claims           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_admin_approvals  ENABLE ROW LEVEL SECURITY;

-- Players: see approved/live quest templates and instances
CREATE POLICY "quest_templates_read" ON public.quest_templates FOR SELECT TO authenticated
  USING (status IN ('approved', 'live', 'completed'));

CREATE POLICY "quest_instances_read" ON public.quest_instances FOR SELECT TO authenticated
  USING (status IN ('live', 'paused', 'completed', 'frozen', 'expired'));

-- Players: see quest rewards for readable instances
CREATE POLICY "quest_rewards_read" ON public.quest_rewards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quest_instances qi
      WHERE qi.id = quest_instance_id AND qi.status IN ('live', 'paused', 'completed', 'frozen', 'expired')
    )
  );

-- Players: read own participation
CREATE POLICY "quest_participants_read" ON public.quest_participants FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid())
    OR
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      JOIN public.player_profiles pp ON pp.id = tm.player_id
      WHERE pp.user_id = auth.uid()
    )
  );

-- Players: read own progress events
CREATE POLICY "quest_progress_events_read" ON public.quest_progress_events FOR SELECT TO authenticated
  USING (
    quest_participant_id IN (
      SELECT qp.id FROM public.quest_participants qp
      WHERE qp.player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid())
    )
  );

-- Players: read own claims
CREATE POLICY "quest_claims_read" ON public.quest_claims FOR SELECT TO authenticated
  USING (
    claimed_by_player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid())
  );

-- Players: insert own claim
CREATE POLICY "quest_claims_insert" ON public.quest_claims FOR INSERT TO authenticated
  WITH CHECK (
    claimed_by_player_id IN (SELECT id FROM public.player_profiles WHERE user_id = auth.uid())
  );

-- Admin full access
CREATE POLICY "admin_quest_templates"       ON public.quest_templates        FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_instances"       ON public.quest_instances        FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_participants"    ON public.quest_participants      FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_progress"        ON public.quest_progress_events  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_rewards"         ON public.quest_rewards          FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_claims"          ON public.quest_claims           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_quest_approvals"       ON public.quest_admin_approvals  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE TRIGGER set_quest_templates_updated_at
  BEFORE UPDATE ON public.quest_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_quest_instances_updated_at
  BEFORE UPDATE ON public.quest_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_quest_participants_updated_at
  BEFORE UPDATE ON public.quest_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Seed app_settings for quests (if not already present)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('QUEST_SAME_OPPONENT_WEEKLY_COUNT_LIMIT', '2',             'Max matches vs same team per week that count toward quest progress'),
  ('QUEST_SAME_OPPONENT_LIMIT_WINDOW_DAYS',  '7',             'Window in days for same-opponent quest limit'),
  ('QUEST_DEFAULT_TIMEZONE',                 '"Africa/Cairo"',  'Default timezone for quest deadlines and display'),
  ('QUEST_AUTO_REPEAT_ENABLED',              'true',          'Auto-generate next instance from repeating quest templates'),
  ('QUEST_SOCIAL_FEED_POSTING_ENABLED',      'true',          'Post to social feed on quest completion'),
  ('QUEST_FOLLOWER_NOTIFICATIONS_ENABLED',   'true',          'Notify followers when someone completes a quest'),
  ('QUEST_EXTERNAL_SHARING_ENABLED',         'true',          'Allow external sharing of completed quests'),
  ('QUEST_REWARD_BUDGET_ENFORCEMENT_ENABLED','true',          'Enforce reward budget cap per quest instance'),
  ('QUEST_REQUIRES_APPROVAL_BEFORE_GO_LIVE', 'true',          'Quest templates must be approved before going live'),
  ('QUEST_LINKED_LEADERBOARD_CREATION_ENABLED','true',        'Auto-create leaderboard config for quests with creates_linked_leaderboard=true'),
  ('QUEST_AI_DRAFT_GENERATION_ENABLED',      'false',         'Allow AI to generate draft quest templates (requires AI module)'),
  ('QUEST_AI_RECOMMENDATIONS_ENABLED',       'false',         'Allow AI to recommend quests to players (requires AI module)')
ON CONFLICT (key) DO NOTHING;
