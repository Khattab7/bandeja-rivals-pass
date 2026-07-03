-- ============================================================
-- Migration 010: Fixes and backfills
-- Run AFTER 009_notifications.sql
-- ============================================================

-- Add 'quest_reward' to bars_ledger.source_type check constraint
-- The quest module (008) awards Bars via source_type='quest_reward' but the
-- original check constraint in 006 didn't include it.
ALTER TABLE public.bars_ledger
  DROP CONSTRAINT IF EXISTS bars_ledger_source_type_check;

ALTER TABLE public.bars_ledger
  ADD CONSTRAINT bars_ledger_source_type_check
  CHECK (source_type IN (
    'match_reward',
    'admin_adjustment',
    'admin_reversal',
    'unlock_locked_bars',
    'redemption',
    'quest_reward'
  ));

-- Admin policy on player_profiles (allows admin to read/write all profiles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_profiles' AND policyname = 'player_profiles_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "player_profiles_admin_all" ON public.player_profiles FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches' AND policyname = 'matches_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "matches_admin_all" ON public.matches FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on bars_ledger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bars_ledger' AND policyname = 'bars_ledger_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "bars_ledger_admin_all" ON public.bars_ledger FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on player_stats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_stats' AND policyname = 'player_stats_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "player_stats_admin_all" ON public.player_stats FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on rating_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rating_events' AND policyname = 'rating_events_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "rating_events_admin_all" ON public.rating_events FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on open_matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'open_matches' AND policyname = 'open_matches_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "open_matches_admin_all" ON public.open_matches FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on quest_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quest_templates' AND policyname = 'quest_templates_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "quest_templates_admin_all" ON public.quest_templates FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on quest_instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quest_instances' AND policyname = 'quest_instances_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "quest_instances_admin_all" ON public.quest_instances FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;

-- Admin policy on teams
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'teams' AND policyname = 'teams_admin_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "teams_admin_all" ON public.teams FOR ALL TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
    $p$;
  END IF;
END $$;
