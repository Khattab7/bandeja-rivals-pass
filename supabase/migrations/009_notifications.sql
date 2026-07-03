-- ============================================================
-- Migration 009: Notifications and Messaging
-- Run AFTER 008_quests.sql
-- V1 active channels: in_app + email (architecture-ready: whatsapp, browser_push, mobile_push)
-- ============================================================

-- ============================================================
-- notification_types
-- Master registry of every notification type in the system
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_types (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key                      TEXT NOT NULL UNIQUE,
  category                      TEXT NOT NULL
                                CHECK (category IN (
                                  'account_security','membership_pass','team','challenge','open_match',
                                  'match','score_confirmation','rating_bars_streaks','leaderboard',
                                  'quest','social','ai','admin_announcement','system'
                                )),
  priority                      TEXT NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('critical','high','normal','low')),

  is_enabled                    BOOLEAN NOT NULL DEFAULT TRUE,
  is_mandatory                  BOOLEAN NOT NULL DEFAULT FALSE,  -- if true, user cannot disable

  -- Which channels this type supports (architecture-ready columns for future channels)
  supports_in_app               BOOLEAN NOT NULL DEFAULT TRUE,
  supports_email                BOOLEAN NOT NULL DEFAULT TRUE,
  supports_whatsapp             BOOLEAN NOT NULL DEFAULT FALSE,
  supports_browser_push         BOOLEAN NOT NULL DEFAULT FALSE,
  supports_mobile_push          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Default channel on/off for new users
  default_in_app_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  default_email_enabled         BOOLEAN NOT NULL DEFAULT FALSE,  -- email off by default unless critical
  default_whatsapp_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  default_browser_push_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  default_mobile_push_enabled   BOOLEAN NOT NULL DEFAULT FALSE,

  instant_or_digest             TEXT NOT NULL DEFAULT 'instant'
                                CHECK (instant_or_digest IN ('instant','digest','both')),

  requires_action               BOOLEAN NOT NULL DEFAULT FALSE,
  requires_extra_confirmation   BOOLEAN NOT NULL DEFAULT FALSE,

  description                   TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nt_category  ON public.notification_types(category);
CREATE INDEX IF NOT EXISTS idx_nt_priority  ON public.notification_types(priority);
CREATE INDEX IF NOT EXISTS idx_nt_mandatory ON public.notification_types(is_mandatory);

-- ============================================================
-- notification_templates
-- Admin-editable content per type × channel × locale
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key                TEXT NOT NULL REFERENCES public.notification_types(type_key) ON DELETE CASCADE,
  channel                 TEXT NOT NULL CHECK (channel IN ('in_app','email','whatsapp','browser_push','mobile_push')),
  locale                  TEXT NOT NULL DEFAULT 'en',

  title_template          TEXT,
  body_template           TEXT NOT NULL,
  action_label_template   TEXT,

  -- JSON schema describing allowed {{variables}} in templates
  variables_schema        JSONB,

  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  version                 INTEGER NOT NULL DEFAULT 1,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (type_key, channel, locale, version)
);

CREATE INDEX IF NOT EXISTS idx_ntpl_type_key ON public.notification_templates(type_key);
CREATE INDEX IF NOT EXISTS idx_ntpl_channel  ON public.notification_templates(channel);

-- ============================================================
-- notifications
-- Canonical record (one per recipient per event)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key                TEXT NOT NULL,
  category                TEXT NOT NULL,

  recipient_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_player_id     UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,

  title                   TEXT,
  body                    TEXT NOT NULL,
  priority                TEXT NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('critical','high','normal','low')),

  -- Related entity (match, team, quest, etc.)
  related_entity_type     TEXT,
  related_entity_id       UUID,

  -- Metadata (arbitrary context)
  metadata                JSONB,

  -- Read / inbox state
  is_read                 BOOLEAN NOT NULL DEFAULT FALSE,
  read_at                 TIMESTAMPTZ,
  is_archived             BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at             TIMESTAMPTZ,
  is_deleted_by_user      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at              TIMESTAMPTZ,

  -- Pin state (stays pinned until acted on)
  is_pinned               BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_until_action     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Action state
  action_state            TEXT NOT NULL DEFAULT 'none'
                          CHECK (action_state IN ('none','pending_action','action_completed','action_expired','action_unavailable','action_cancelled')),

  expires_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient    ON public.notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_player       ON public.notifications(recipient_player_id);
CREATE INDEX IF NOT EXISTS idx_notif_type_key     ON public.notifications(type_key);
CREATE INDEX IF NOT EXISTS idx_notif_unread       ON public.notifications(recipient_user_id, is_read) WHERE is_deleted_by_user = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_pinned       ON public.notifications(recipient_user_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notif_created      ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_entity       ON public.notifications(related_entity_type, related_entity_id);

-- ============================================================
-- notification_deliveries
-- Per-channel delivery tracking for each notification
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id       UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('in_app','email','whatsapp','browser_push','mobile_push')),

  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','queued','sent','delivered','failed','read','clicked','action_completed')),
  provider              TEXT,               -- 'in_app' | 'resend' | 'sendgrid' | etc.
  provider_message_id   TEXT,

  attempt_count         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at       TIMESTAMPTZ,
  next_retry_at         TIMESTAMPTZ,
  error_code            TEXT,
  error_message         TEXT,

  sent_at               TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nd_notification  ON public.notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_nd_channel       ON public.notification_deliveries(channel);
CREATE INDEX IF NOT EXISTS idx_nd_status        ON public.notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_nd_retry         ON public.notification_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- ============================================================
-- notification_preferences
-- Per user per type: which channels are on/off
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type_key              TEXT NOT NULL,

  in_app_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  browser_push_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  mobile_push_enabled   BOOLEAN NOT NULL DEFAULT FALSE,

  digest_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  muted_until           TIMESTAMPTZ,        -- null = not muted

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, type_key)
);

CREATE INDEX IF NOT EXISTS idx_np_user     ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_np_type_key ON public.notification_preferences(type_key);

-- ============================================================
-- notification_actions
-- Action buttons attached to actionable notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_actions (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id               UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,

  action_key                    TEXT NOT NULL,   -- e.g. 'accept_invite', 'confirm_score', 'claim_reward'
  action_label                  TEXT NOT NULL,
  action_url                    TEXT,
  backend_action                TEXT,            -- server-side function key
  payload_json                  JSONB,

  requires_extra_confirmation   BOOLEAN NOT NULL DEFAULT FALSE,
  status                        TEXT NOT NULL DEFAULT 'available'
                                CHECK (status IN ('available','completed','expired','unavailable','cancelled')),

  completed_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at                  TIMESTAMPTZ,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_na_notification ON public.notification_actions(notification_id);
CREATE INDEX IF NOT EXISTS idx_na_status       ON public.notification_actions(status);

-- ============================================================
-- notification_batches
-- Digest batches (daily/weekly)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_type            TEXT NOT NULL CHECK (batch_type IN ('daily_digest','weekly_digest')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','failed','cancelled')),

  notification_ids      UUID[],              -- notifications included in this batch
  title                 TEXT,
  body                  TEXT,

  scheduled_for         TIMESTAMPTZ NOT NULL,
  sent_at               TIMESTAMPTZ,
  error_message         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nb_user          ON public.notification_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_nb_status        ON public.notification_batches(status);
CREATE INDEX IF NOT EXISTS idx_nb_scheduled     ON public.notification_batches(scheduled_for);

-- ============================================================
-- admin_announcements
-- Manual announcements created by admins
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,

  -- Target audience filters
  target_filters_json   JSONB,     -- { country, city, paid_only, rating_min/max, etc. }

  channels              TEXT[] NOT NULL DEFAULT ARRAY['in_app'],  -- ['in_app','email']

  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','scheduled','sent','cancelled','failed')),
  scheduled_for         TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  audience_count        INTEGER,

  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aa_status      ON public.admin_announcements(status);
CREATE INDEX IF NOT EXISTS idx_aa_created_by  ON public.admin_announcements(created_by);

-- ============================================================
-- notification_audit_logs
-- Audit trail for sensitive notification events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_audit_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id       UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  delivery_id           UUID REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,

  event_type            TEXT NOT NULL,  -- 'sent', 'read', 'action_completed', 'delivery_failed', 'template_edited', etc.
  actor_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  related_entity_type   TEXT,
  related_entity_id     UUID,
  metadata              JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nal_notification ON public.notification_audit_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_nal_recipient    ON public.notification_audit_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_nal_event        ON public.notification_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_nal_created      ON public.notification_audit_logs(created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.notification_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_actions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_announcements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit_logs      ENABLE ROW LEVEL SECURITY;

-- Notification types: all authenticated users read
CREATE POLICY "nt_read" ON public.notification_types FOR SELECT TO authenticated USING (is_enabled = TRUE);

-- Templates: all authenticated users read active templates
CREATE POLICY "ntpl_read" ON public.notification_templates FOR SELECT TO authenticated USING (is_active = TRUE);

-- Notifications: own only
CREATE POLICY "notif_read"    ON public.notifications FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY "notif_update"  ON public.notifications FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid());

-- Notification deliveries: own only (via join on notification)
CREATE POLICY "nd_read" ON public.notification_deliveries FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = notification_id AND n.recipient_user_id = auth.uid())
  );

-- Preferences: own only
CREATE POLICY "np_read"    ON public.notification_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "np_insert"  ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "np_update"  ON public.notification_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Actions: own only
CREATE POLICY "na_read"   ON public.notification_actions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = notification_id AND n.recipient_user_id = auth.uid())
  );
CREATE POLICY "na_update" ON public.notification_actions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = notification_id AND n.recipient_user_id = auth.uid())
  );

-- Batches: own only
CREATE POLICY "nb_read" ON public.notification_batches FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Announcements: all authenticated users read sent ones
CREATE POLICY "aa_read" ON public.admin_announcements FOR SELECT TO authenticated USING (status = 'sent');

-- Audit logs: admin only
CREATE POLICY "nal_admin" ON public.notification_audit_logs FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin full access
CREATE POLICY "admin_notif_types"     ON public.notification_types         FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_notif_templates" ON public.notification_templates      FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_notifications"   ON public.notifications               FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_nd"              ON public.notification_deliveries      FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_np"              ON public.notification_preferences     FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_na"              ON public.notification_actions         FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_nb"              ON public.notification_batches         FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_aa"              ON public.admin_announcements          FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE TRIGGER set_nt_updated_at
  BEFORE UPDATE ON public.notification_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_ntpl_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_nd_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_np_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_aa_updated_at
  BEFORE UPDATE ON public.admin_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Seed notification types
-- ============================================================
INSERT INTO public.notification_types
  (type_key, category, priority, is_mandatory, requires_action, requires_extra_confirmation, default_email_enabled, instant_or_digest)
VALUES
  -- Account & Security (mandatory)
  ('email_verification',          'account_security',   'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('security_alert',              'account_security',   'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('membership_activated',        'membership_pass',    'high',     FALSE, FALSE, FALSE, TRUE,  'instant'),
  ('membership_expiry_warning',   'membership_pass',    'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('membership_expired',          'membership_pass',    'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  -- Team
  ('team_invite_received',        'team',               'high',     FALSE, TRUE,  FALSE, FALSE, 'instant'),
  ('team_invite_accepted',        'team',               'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('team_invite_rejected',        'team',               'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('team_captain_changed',        'team',               'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('team_archived',               'team',               'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  -- Challenge
  ('challenge_received',          'challenge',          'high',     FALSE, TRUE,  TRUE,  FALSE, 'instant'),
  ('challenge_accepted',          'challenge',          'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('challenge_rejected',          'challenge',          'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('challenge_expired',           'challenge',          'low',      FALSE, FALSE, FALSE, FALSE, 'instant'),
  -- Match
  ('match_created',               'match',              'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('match_cancelled',             'match',              'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('no_show_reported',            'match',              'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  -- Score confirmation (mandatory)
  ('score_submitted',             'score_confirmation', 'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('score_confirmation_required', 'score_confirmation', 'critical', TRUE,  TRUE,  TRUE,  TRUE,  'instant'),
  ('score_confirmed',             'score_confirmation', 'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('score_rejected',              'score_confirmation', 'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('alternative_score_submitted', 'score_confirmation', 'critical', TRUE,  TRUE,  TRUE,  TRUE,  'instant'),
  ('score_auto_approved',         'score_confirmation', 'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('dispute_opened',              'score_confirmation', 'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  ('dispute_resolved',            'score_confirmation', 'critical', TRUE,  FALSE, FALSE, TRUE,  'instant'),
  -- Rating / Bars / Streaks
  ('rating_updated',              'rating_bars_streaks','high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('bars_awarded',                'rating_bars_streaks','high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('bars_locked',                 'rating_bars_streaks','normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('bars_expired',                'rating_bars_streaks','normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('winning_streak_updated',      'rating_bars_streaks','normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('beat_expected_streak_updated','rating_bars_streaks','normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('match_processing_summary',    'rating_bars_streaks','high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  -- Leaderboard
  ('entered_top_10',              'leaderboard',        'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('lost_top_10',                 'leaderboard',        'low',      FALSE, FALSE, FALSE, FALSE, 'digest'),
  ('became_number_1',             'leaderboard',        'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('lost_number_1',               'leaderboard',        'normal',   FALSE, FALSE, FALSE, FALSE, 'digest'),
  ('leaderboard_season_winner',   'leaderboard',        'high',     FALSE, FALSE, FALSE, TRUE,  'instant'),
  -- Quest
  ('quest_available',             'quest',              'normal',   FALSE, FALSE, FALSE, FALSE, 'digest'),
  ('quest_progress_milestone',    'quest',              'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('quest_completed',             'quest',              'high',     FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('quest_reward_ready',          'quest',              'high',     FALSE, TRUE,  FALSE, FALSE, 'instant'),
  ('quest_reward_claimed',        'quest',              'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('quest_expired',               'quest',              'low',      FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('quest_reward_pool_full',      'quest',              'low',      FALSE, FALSE, FALSE, FALSE, 'instant'),
  -- Social
  ('new_follower',                'social',             'low',      FALSE, FALSE, FALSE, FALSE, 'digest'),
  ('quest_completed_followed',    'social',             'low',      FALSE, FALSE, FALSE, FALSE, 'digest'),
  -- Admin
  ('admin_announcement',          'admin_announcement', 'normal',   FALSE, FALSE, FALSE, FALSE, 'instant'),
  ('admin_action_on_account',     'admin_announcement', 'critical', TRUE,  FALSE, FALSE, TRUE,  'instant')
ON CONFLICT (type_key) DO NOTHING;

-- ============================================================
-- Seed app_settings for notifications
-- ============================================================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('NOTIFICATION_RETENTION_DAYS',                '90',                'Days to retain notification records before automatic cleanup'),
  ('DIGEST_ENABLED',                             'true',              'Whether daily/weekly digest batching is active'),
  ('DIGEST_FREQUENCY',                           'weekly',            'Digest frequency: daily or weekly'),
  ('DIGEST_SEND_TIME',                           '09:00',             'Time of day to send digests (Egypt time)'),
  ('DIGEST_TIMEZONE',                            'Africa/Cairo',      'Timezone for digest scheduling'),
  ('CRITICAL_NOTIFICATION_MAX_RETRIES',          '3',                 'Max retry attempts for failed critical notification deliveries'),
  ('CRITICAL_NOTIFICATION_RETRY_DELAY_MINUTES',  '10',                'Delay in minutes between delivery retry attempts'),
  ('EMAIL_NOTIFICATIONS_ENABLED',                'false',             'Master switch for email notifications (set true when email provider is configured)'),
  ('WHATSAPP_NOTIFICATIONS_ENABLED',             'false',             'Master switch for WhatsApp notifications (architecture-ready, not live in V1)'),
  ('BROWSER_PUSH_ENABLED',                       'false',             'Master switch for browser push notifications (architecture-ready, not live in V1)'),
  ('MOBILE_PUSH_ENABLED',                        'false',             'Master switch for mobile push notifications (architecture-ready, not live in V1)'),
  ('AI_PROACTIVE_NOTIFICATIONS_ENABLED',         'false',             'Allow AI to send proactive notifications (requires AI module)'),
  ('AI_PROACTIVE_NOTIFICATIONS_AVAILABILITY',    'disabled',          'Audience for AI proactive notifications: all / paid_member / disabled'),
  ('ADMIN_ANNOUNCEMENTS_ENABLED',                'true',              'Enable admin announcement feature'),
  ('MANDATORY_NOTIFICATION_OVERRIDE_ENABLED',    'true',              'Allow admins to force-mandate additional notification types')
ON CONFLICT (key) DO NOTHING;
