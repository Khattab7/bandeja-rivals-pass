-- ============================================================
-- Migration 012: Rivals Pass benefits in app_settings
-- Purpose: Move pass benefits out of code into admin-editable settings.
--          Both the /pass page and AI system prompt read from here at runtime.
-- ============================================================

INSERT INTO public.app_settings (key, value, description) VALUES
(
  'RIVALS_PASS_PARTNER_BENEFITS',
  '[{"pct":"10%","label":"OFF COURT BOOKINGS","sub":"at partner venues"},{"pct":"10%","label":"OFF PADEL BALLS & GRIPS","sub":"at partner stores"},{"pct":"20%","label":"OFF RIVALS MONTHLY FINALE","sub":"registration fee"}]',
  'Partner discount benefits shown on the Rivals Pass page and communicated by the AI. JSON array of {pct, label, sub} objects.'
),
(
  'RIVALS_PASS_PLATFORM_BENEFITS',
  '["Active Bars earning: Bars from wins, streaks, and quests go straight to your active balance. Free players accumulate locked Bars they cannot use until they upgrade.","Retroactive Bars unlock: upgrading from free unlocks all non-expired locked Bars you earned while free.","Bars redemption: spend active Bars on rewards such as court bookings and gear.","Leaderboard eligibility: appear on city and global leaderboards. Free players are excluded.","Priority matchmaking: your open match posts are boosted and shown first to other players.","Paid quests: access to exclusive member-only quest challenges with active Bars rewards.","Apple Wallet pass: a digital membership card that venue staff can scan at partner courts."]',
  'In-app platform benefits of the Rivals Pass communicated by the AI. JSON array of plain text strings.'
)
ON CONFLICT (key) DO NOTHING;
