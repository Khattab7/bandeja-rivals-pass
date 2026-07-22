-- ============================================================
-- Migration 016: Fix match_players INSERT policy
-- Run in Supabase SQL Editor AFTER 015_explore.sql
-- ============================================================
-- The original policy only passes if the user is already in match_players
-- (is_match_participant), which is always false when creating the initial
-- rows for a brand-new match. This change also allows any team member of
-- the match's two teams to insert rows, which is needed when a challenge
-- is accepted and the match is being set up.
-- ============================================================

DROP POLICY IF EXISTS "match_players_insert" ON public.match_players;

CREATE POLICY "match_players_insert" ON public.match_players FOR INSERT TO authenticated
  WITH CHECK (
    -- Already a participant (for later updates / re-inserts)
    is_match_participant(match_id)
    OR
    -- Member of one of the teams in the match (for initial row creation)
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (is_team_member(m.team_a_id) OR is_team_member(m.team_b_id))
    )
  );
