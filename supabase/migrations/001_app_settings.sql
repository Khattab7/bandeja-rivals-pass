-- ============================================================
-- Migration 001: app_settings
-- Run in Supabase SQL Editor
-- Purpose: Foundational admin-configurable settings table.
--          Every module reads defaults from here at runtime.
-- Dependencies: none
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admins can read and write all settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_app_settings"
  ON public.app_settings FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Authenticated users can read settings (needed for client-side feature flags)
CREATE POLICY "authenticated_read_app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Seed: Rating Algorithm (Module 00 / 06)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('DEFAULT_STARTING_RATING',        '500',    'Default player starting rating'),
  ('MIN_STARTING_RATING',            '300',    'Minimum starting rating from Rating Guess questionnaire'),
  ('MAX_STARTING_RATING',            '700',    'Maximum starting rating from Rating Guess questionnaire'),
  ('RATING_ALGORITHM_VERSION',       '"1.0"',  'Active rating algorithm version — bump when algorithm changes'),
  ('BANDEJA_BATTLE_BARS_REWARD',     '100',    'Total BANDEJA Bars awarded per processed rated match. Must be divisible by 4.'),
  ('LOW_RATING_ALERT_THRESHOLD',     '200',    'Notify admins when any player rating falls to or below this value')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Membership / Bars (Module 01)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('PENDING_BARS_VALIDITY_PERIOD_DAYS', '60',  'Days locked/pending Bars remain claimable before expiring. Clock starts at score submission date.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Onboarding / Profiles (Module 02)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('FOUNDING_RIVAL_BADGE_LIMIT', '100', 'Number of Founding Rival badges available. Claimed atomically via DB sequence.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Teams (Module 03)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('MAX_ACTIVE_TEAMS_FREE',              '3',             'Maximum simultaneous active teams for free players'),
  ('MAX_ACTIVE_TEAMS_PAID',              '10',            'Maximum simultaneous active teams for paid members'),
  ('TEAM_CHALLENGE_ACCEPTANCE_PERMISSION', '"captain_only"', 'Who can accept incoming challenges: captain_only | any_team_member | both_players_required'),
  ('DEFAULT_CHALLENGE_RATING_RANGE',     '100',           'Default ± rating range teams accept challenges from'),
  ('TEAM_CHALLENGE_EXPIRATION_HOURS',    '72',            'Hours before an unanswered team challenge auto-expires'),
  ('OPEN_MATCH_EXPIRATION_HOURS',        '168',           'Hours before an open match with no applications auto-expires (168 = 7 days)'),
  ('DAILY_PARTNER_INVITES_FREE',         '5',             'Max partner invitations a free player can send per day'),
  ('DAILY_PARTNER_INVITES_PAID',         '20',            'Max partner invitations a paid member can send per day'),
  ('DAILY_TEAM_CHALLENGES_FREE',         '5',             'Max team challenges a free player can send per day'),
  ('DAILY_TEAM_CHALLENGES_PAID',         '20',            'Max team challenges a paid member can send per day'),
  ('DAILY_OPEN_MATCH_APPS_FREE',         '5',             'Max open match applications a free player can send per day'),
  ('DAILY_OPEN_MATCH_APPS_PAID',         '20',            'Max open match applications a paid member can send per day'),
  ('DAILY_RIVALS_BATTLE_INVITES_FREE',   '3',             'Max Rivals Battle invitations a free player can send per day'),
  ('DAILY_RIVALS_BATTLE_INVITES_PAID',   '10',            'Max Rivals Battle invitations a paid member can send per day'),
  ('ANTI_SPAM_INVITE_COUNT',             '3',             'Max times a player can invite the same person within the spam window'),
  ('ANTI_SPAM_INVITE_WINDOW_DAYS',       '7',             'Rolling window in days for anti-spam invite counting'),
  ('TEAM_DISCOVERABILITY_DEFAULT',       'true',          'Whether new teams are discoverable by default')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Matchmaking / Discovery (Module 04)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('BALANCED_MATCH_RATING_WINDOW',       '30',    'Default ± rating window considered "balanced" in discovery feed'),
  ('PAID_RIVAL_DISCOVERY_BOOST_WEIGHT',  '0.1',   'Ranking weight boost for paid/RIVAL teams in discovery. Must not override match quality.'),
  ('AI_MATCH_EXPLANATION_AVAILABILITY',  '"all"', 'Who can see AI match explanations: all | paid_only | hidden | disabled')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Match Lifecycle (Module 05)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('SCORE_CONFIRMATION_REMINDER_DELAY_HOURS', '24',    'Hours after score submission before reminder is sent to confirming team'),
  ('SCORE_AUTO_APPROVAL_DELAY_HOURS',         '24',    'Hours after score submission before match is auto-approved if unconfirmed'),
  ('SCORE_SUBMISSION_WINDOW_HOURS',           '72',    'Hours after match scheduled time within which score must be submitted'),
  ('LATE_SCORE_SUBMISSION_BEHAVIOR',          '"block"', 'What happens after submission window closes: block | require_admin_review'),
  ('FRIENDLY_MATCH_SOCIAL_FEED_POSTING',      'false', 'Whether confirmed friendly matches auto-post to social feed'),
  ('MATCH_DETAIL_CHANGE_APPROVAL_REQUIRED',   'true',  'Whether proposed match detail changes require opponent approval'),
  ('ALLOW_BEST_OF_3_RATED_MATCHES',           'true',  'Allow best-of-3 format for rated matches'),
  ('ALLOW_ONE_SET_RATED_MATCHES',             'true',  'Allow one-set format for rated matches'),
  ('NO_SHOW_AFFECTS_DISCOVERY_RANKING',       'true',  'Whether reported no-shows negatively affect discovery ranking'),
  ('NO_SHOW_AFFECTS_RELIABILITY_SCORE',       'true',  'Whether reported no-shows affect player reliability stats')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Leaderboards (Module 07)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('MINIMUM_RATED_MATCHES_PLAYER_LEADERBOARD', '1',       'Minimum rated matches before player appears on rating leaderboards'),
  ('MINIMUM_RATED_MATCHES_TEAM_LEADERBOARD',   '1',       'Minimum rated matches together before team appears on team leaderboards'),
  ('ACTIVE_LEADERBOARD_INACTIVITY_DAYS',       '30',      'Days without a rated match before player is hidden from active leaderboards'),
  ('ALL_TIME_LEADERBOARDS_ENABLED',            'true',    'Whether all-time leaderboards are publicly visible'),
  ('MINIMUM_RANKED_PLAYERS_AREA_LEADERBOARD',  '10',      'Minimum ranked players required before an area leaderboard is shown publicly'),
  ('RATED_MATCH_ACTIVITY_WEIGHT',              '2',       'Activity points per confirmed rated match'),
  ('FRIENDLY_MATCH_ACTIVITY_WEIGHT',           '1',       'Activity points per confirmed friendly match'),
  ('NO_SHOW_ACTIVITY_PENALTY',                 '-2',      'Activity points deducted from responsible party per no-show'),
  ('CANCELLATION_ACTIVITY_PENALTY',            '-1',      'Activity points deducted from responsible party per cancellation'),
  ('LEADERBOARD_REFRESH_FREQUENCY',            '"daily"', 'How often leaderboards auto-refresh: daily'),
  ('MANUAL_LEADERBOARD_REFRESH_ENABLED',       'true',    'Whether admins can trigger a manual leaderboard refresh'),
  ('SEASON_LEADERBOARDS_ENABLED',              'true',    'Whether seasonal leaderboards are active'),
  ('CUSTOM_LEADERBOARDS_ENABLED',              'true',    'Whether admins can create custom leaderboards')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Quests / Gamification (Module 08)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('QUEST_SAME_OPPONENT_WEEKLY_COUNT_LIMIT', '2',               'Max matches vs same team per week that count toward quest progress'),
  ('QUEST_SAME_OPPONENT_LIMIT_WINDOW_DAYS',  '7',               'Rolling window in days for same-opponent quest limit'),
  ('QUEST_DEFAULT_TIMEZONE',                 '"Africa/Cairo"',  'Default timezone for quest deadlines'),
  ('QUEST_AUTO_REPEAT_ENABLED',              'true',            'Whether repeating quest templates auto-generate new instances'),
  ('QUEST_SOCIAL_FEED_POSTING_ENABLED',      'true',            'Whether quest completions auto-post to social feed'),
  ('QUEST_FOLLOWER_NOTIFICATIONS_ENABLED',   'true',            'Whether quest completions trigger notifications to followers'),
  ('QUEST_EXTERNAL_SHARING_ENABLED',         'true',            'Whether players can share quest achievements externally'),
  ('QUEST_REWARD_BUDGET_ENFORCEMENT_ENABLED','true',            'Whether total Bars budget caps are enforced per quest'),
  ('QUEST_REQUIRES_APPROVAL_BEFORE_GO_LIVE', 'true',            'Whether quests require admin approval before going live'),
  ('QUEST_LINKED_LEADERBOARD_CREATION_ENABLED', 'true',         'Whether quests can auto-create linked leaderboards'),
  ('QUEST_AI_DRAFT_GENERATION_ENABLED',      'true',            'Whether AI can generate draft quests for admin approval'),
  ('QUEST_AI_RECOMMENDATIONS_ENABLED',       'true',            'Whether AI can recommend quests to players')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: Notifications (Module 09)
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('NOTIFICATION_RETENTION_DAYS',              '90',             'Days to retain notifications before auto-archival'),
  ('DIGEST_ENABLED',                           'false',          'Whether digest notification batches are enabled'),
  ('DIGEST_FREQUENCY',                         '"daily"',        'Digest send frequency: daily | weekly'),
  ('DIGEST_SEND_TIME',                         '"09:00"',        'Time of day to send digest (HH:MM, Egypt time)'),
  ('DIGEST_TIMEZONE',                          '"Africa/Cairo"', 'Timezone for digest send time'),
  ('CRITICAL_NOTIFICATION_MAX_RETRIES',        '3',              'Max retry attempts for failed critical notifications'),
  ('CRITICAL_NOTIFICATION_RETRY_DELAY_MINUTES','15',             'Minutes between retry attempts for failed critical notifications'),
  ('EMAIL_NOTIFICATIONS_ENABLED',              'true',           'Whether email notifications are active'),
  ('WHATSAPP_NOTIFICATIONS_ENABLED',           'false',          'Whether WhatsApp notifications are active (architecture-ready, not live in V1)'),
  ('BROWSER_PUSH_ENABLED',                     'false',          'Whether browser push notifications are active (architecture-ready, not live in V1)'),
  ('MOBILE_PUSH_ENABLED',                      'false',          'Whether mobile push notifications are active (planned for later)'),
  ('AI_PROACTIVE_NOTIFICATIONS_ENABLED',       'false',          'Whether AI can proactively send notifications to players'),
  ('AI_PROACTIVE_NOTIFICATIONS_AVAILABILITY',  '"all"',          'Who receives AI proactive notifications: all | paid_only | disabled'),
  ('ADMIN_ANNOUNCEMENTS_ENABLED',              'true',           'Whether admins can send manual announcements'),
  ('MANDATORY_NOTIFICATION_OVERRIDE_ENABLED',  'true',           'Whether mandatory notifications can override user preferences')
ON CONFLICT (key) DO NOTHING;
