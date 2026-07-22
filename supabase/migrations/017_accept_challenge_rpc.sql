-- ============================================================
-- Migration 017: SECURITY DEFINER RPC for accepting a challenge
-- Run in Supabase SQL Editor AFTER 016_match_players_insert_policy.sql
-- ============================================================
-- Creates a single atomic function that:
--   1. Validates the caller is on the challenged team
--   2. Creates the match
--   3. Locks both teams' players into match_players
--   4. Marks the challenge as match_created
-- SECURITY DEFINER runs as the function owner, bypassing all RLS.
-- Security is enforced inside the function via auth.uid() checks.
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_team_challenge(p_challenge_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id      UUID;
  v_challenge       RECORD;
  v_match_id        UUID;
  v_scheduled_date  DATE;
BEGIN
  -- Resolve current user's player profile
  SELECT id INTO v_profile_id
  FROM player_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Player profile not found';
  END IF;

  -- Load the challenge
  SELECT * INTO v_challenge
  FROM team_challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.status != 'pending' THEN
    RAISE EXCEPTION 'Challenge is no longer pending';
  END IF;

  -- Security: caller must be on the challenged team
  IF NOT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN player_profiles pp ON pp.id = tm.player_id
    WHERE tm.team_id = v_challenge.challenged_team_id
      AND pp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of the challenged team';
  END IF;

  -- Derive scheduled date from proposed_datetime
  v_scheduled_date := CASE
    WHEN v_challenge.proposed_datetime IS NOT NULL
    THEN (v_challenge.proposed_datetime AT TIME ZONE 'UTC')::DATE
    ELSE NULL
  END;

  -- Create the match
  INSERT INTO matches (
    match_type, status, source_type, source_id,
    team_a_id, team_b_id, created_by,
    city, area, scheduled_date
  ) VALUES (
    v_challenge.match_type,
    CASE WHEN v_challenge.proposed_datetime IS NOT NULL THEN 'scheduled' ELSE 'scheduled_tbd' END,
    'team_challenge',
    p_challenge_id,
    v_challenge.challenging_team_id,
    v_challenge.challenged_team_id,
    v_profile_id,
    v_challenge.city,
    v_challenge.area,
    v_scheduled_date
  )
  RETURNING id INTO v_match_id;

  -- Lock both teams' players into match_players
  INSERT INTO match_players (
    match_id, team_id, player_id, side, slot,
    player_rating_at_match_creation
  )
  SELECT
    v_match_id,
    sub.team_id,
    sub.player_id,
    CASE WHEN sub.team_id = v_challenge.challenging_team_id THEN 'A' ELSE 'B' END,
    CASE WHEN sub.rn = 1 THEN 'player_1' ELSE 'player_2' END,
    COALESCE(pp.current_rating, 500)
  FROM (
    SELECT
      tm.team_id,
      tm.player_id,
      ROW_NUMBER() OVER (PARTITION BY tm.team_id ORDER BY tm.player_id) AS rn
    FROM team_members tm
    WHERE tm.team_id IN (
      v_challenge.challenging_team_id,
      v_challenge.challenged_team_id
    )
  ) sub
  JOIN player_profiles pp ON pp.id = sub.player_id;

  -- Mark challenge as accepted
  UPDATE team_challenges
  SET
    status       = 'match_created',
    match_id     = v_match_id,
    responded_at = NOW()
  WHERE id = p_challenge_id;

  RETURN v_match_id;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.accept_team_challenge(UUID) TO authenticated;
