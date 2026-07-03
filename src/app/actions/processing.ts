'use server';

import { createServiceClient } from '@/lib/supabase/server';
import {
  calculateExpectedScore,
  calculateRatingChange,
  calculateSteps0RatingChange,
  roundHalfUp,
} from '@/lib/bandeja-rating';

// ─────────────────────────────────────────────────────────────────────────────
// processApprovedRatedMatch
// Called after a rivals_rated match reaches confirmed / auto_approved status.
// Idempotent: exits immediately if already processed.
// ─────────────────────────────────────────────────────────────────────────────
export async function processApprovedRatedMatch(matchId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();

  // ── 1. Load match ──────────────────────────────────────────────────────────
  const { data: match } = await supabase
    .from('matches')
    .select('id, match_type, status, team_a_id, team_b_id, rating_snapshot_json, first_score_submitted_at')
    .eq('id', matchId)
    .single();

  if (!match) return { error: 'Match not found.' };
  if (match.match_type !== 'rivals_rated') return {};
  if (match.status === 'processed') return {};

  const processable = ['confirmed', 'auto_approved', 'admin_resolved'];
  if (!processable.includes(match.status)) {
    return { error: `Match status '${match.status}' is not processable.` };
  }

  // ── 2. Guard: already processed ────────────────────────────────────────────
  const { data: existingSummary } = await supabase
    .from('match_processing_summaries')
    .select('id')
    .eq('match_id', matchId)
    .maybeSingle();
  if (existingSummary) return {};

  // ── 3. Load the accepted score submission ──────────────────────────────────
  const { data: submission } = await supabase
    .from('match_score_submissions')
    .select('id, equivalent_actual_score_scenario_index, equivalent_actual_score_label, winning_side, score_format')
    .eq('match_id', matchId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // For auto_approved, the original pending submission becomes the accepted one
  const { data: submissionFallback } = !submission
    ? await supabase
        .from('match_score_submissions')
        .select('id, equivalent_actual_score_scenario_index, equivalent_actual_score_label, winning_side, score_format')
        .eq('match_id', matchId)
        .not('status', 'in', '("withdrawn","superseded","rejected")')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const acceptedSub = submission ?? submissionFallback;
  if (!acceptedSub) return { error: 'No valid score submission found for this match.' };

  const actualScenarioIndex = acceptedSub.equivalent_actual_score_scenario_index as number;
  const actualLabel = acceptedSub.equivalent_actual_score_label as string;
  const winningSide = acceptedSub.winning_side as 'A' | 'B';
  const losingSide: 'A' | 'B' = winningSide === 'A' ? 'B' : 'A';

  // ── 4. Rating snapshot ─────────────────────────────────────────────────────
  const snapshot = match.rating_snapshot_json as {
    team_a_rating: number;
    team_b_rating: number;
    steps: number;
    expected_scenario_index: number | null;
    favored_side: string | null;
    players: Array<{ player_id: string; side: 'A' | 'B'; slot: string; rating: number }>;
    algorithm_version: string;
  } | null;

  // If no snapshot (edge case: admin resolve without prior submission), recalculate
  let teamARating: number;
  let teamBRating: number;
  let snapshotPlayers: Array<{ player_id: string; side: 'A' | 'B'; rating: number }>;

  if (snapshot) {
    teamARating = snapshot.team_a_rating;
    teamBRating = snapshot.team_b_rating;
    snapshotPlayers = snapshot.players;
  } else {
    const { data: matchPlayers } = await supabase
      .from('match_players')
      .select('player_id, side, player_rating_at_match_creation')
      .eq('match_id', matchId);

    const aPlayers = (matchPlayers ?? []).filter((p) => p.side === 'A');
    const bPlayers = (matchPlayers ?? []).filter((p) => p.side === 'B');
    teamARating = aPlayers.length === 2
      ? (aPlayers[0].player_rating_at_match_creation + aPlayers[1].player_rating_at_match_creation) / 2
      : aPlayers[0]?.player_rating_at_match_creation ?? 500;
    teamBRating = bPlayers.length === 2
      ? (bPlayers[0].player_rating_at_match_creation + bPlayers[1].player_rating_at_match_creation) / 2
      : bPlayers[0]?.player_rating_at_match_creation ?? 500;
    snapshotPlayers = (matchPlayers ?? []).map((p) => ({
      player_id: p.player_id,
      side: p.side as 'A' | 'B',
      rating: p.player_rating_at_match_creation,
    }));
  }

  const expected = calculateExpectedScore(teamARating, teamBRating);
  const steps = expected.steps;
  const expectedScenarioIndex = expected.expectedScenarioIndex;
  const favoredSide = expected.favoredSide;

  // ── 5. Rating changes ──────────────────────────────────────────────────────
  let teamAChange: number;
  let teamBChange: number;

  if (steps === 0) {
    const changes = calculateSteps0RatingChange(actualScenarioIndex);
    teamAChange = changes.teamAChange;
    teamBChange = changes.teamBChange;
  } else {
    const changes = calculateRatingChange(actualScenarioIndex, expectedScenarioIndex!);
    teamAChange = changes.teamAChange;
    teamBChange = changes.teamBChange;
  }

  // Player-level changes: team change / 2, round-half-up, always a whole number
  const aPlayerChange = roundHalfUp(teamAChange / 2);
  const bPlayerChange = roundHalfUp(teamBChange / 2);

  // ── 6. Beat-expected logic ─────────────────────────────────────────────────
  let beatExpectedSide: 'A' | 'B' | null;
  if (steps === 0) {
    beatExpectedSide = winningSide;
  } else if (expectedScenarioIndex === null || actualScenarioIndex === expectedScenarioIndex) {
    beatExpectedSide = null; // exact expected
  } else {
    const scenarioDiff = actualScenarioIndex - expectedScenarioIndex;
    beatExpectedSide = scenarioDiff < 0 ? 'A' : 'B';
  }
  const isExactExpected = steps > 0 && beatExpectedSide === null;

  // ── 7. Update player ratings + write rating_events ─────────────────────────
  const firstScoreSubmittedAt = match.first_score_submitted_at
    ? new Date(match.first_score_submitted_at)
    : new Date();

  // Check membership status for each player (for Bars eligibility)
  const allPlayerIds = snapshotPlayers.map((p) => p.player_id);
  const { data: memberRows } = await supabase
    .from('player_profiles')
    .select('id, member_id, current_rating')
    .in('id', allPlayerIds);

  const profileById: Record<string, { member_id: string | null; current_rating: number }> = {};
  for (const p of memberRows ?? []) profileById[p.id] = { member_id: p.member_id, current_rating: p.current_rating };

  // Get member validity for Bars eligibility at submission time
  const memberIds = Object.values(profileById).map((p) => p.member_id).filter(Boolean) as string[];
  const { data: memberValidity } = memberIds.length > 0
    ? await supabase
        .from('members')
        .select('id, is_active, valid_until')
        .in('id', memberIds)
    : { data: [] };

  const memberValidityById: Record<string, { is_active: boolean; valid_until: string | null }> = {};
  for (const m of memberValidity ?? []) memberValidityById[m.id] = m;

  function wasPlayerPaidAtSubmission(playerId: string): boolean {
    const profile = profileById[playerId];
    if (!profile?.member_id) return false;
    const member = memberValidityById[profile.member_id];
    if (!member) return false;
    if (member.is_active) return true;
    if (member.valid_until) {
      return new Date(member.valid_until) >= firstScoreSubmittedAt;
    }
    return false;
  }

  // ── 8. Bars amounts ────────────────────────────────────────────────────────
  const { data: barsSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'BANDEJA_BATTLE_BARS_REWARD')
    .single();
  const barsReward = barsSetting ? Number(barsSetting.value) : 100;

  const { data: validitySetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'BARS_VALIDITY_DAYS')
    .single();
  const barsValidityDays = validitySetting ? Number(validitySetting.value) : 60;
  const barsExpiresAt = new Date(firstScoreSubmittedAt);
  barsExpiresAt.setDate(barsExpiresAt.getDate() + barsValidityDays);

  function getBarsAmount(side: 'A' | 'B'): number {
    if (steps === 0) {
      return side === winningSide ? barsReward / 2 : 0;
    }
    if (isExactExpected) {
      return side === winningSide ? barsReward * 0.75 / 2 : barsReward * 0.25 / 2;
    }
    const winnerShare = barsReward * 0.5 / 2;
    const beatExpShare = barsReward * 0.5 / 2;
    let amount = 0;
    if (side === winningSide) amount += winnerShare;
    if (side === beatExpectedSide) amount += beatExpShare;
    return amount;
  }

  const aBarsPerPlayer = getBarsAmount('A');
  const bBarsPerPlayer = getBarsAmount('B');

  // ── 9. Load player stats for streak updates ────────────────────────────────
  const { data: statsRows } = await supabase
    .from('player_stats')
    .select('player_id, current_winning_streak, best_winning_streak, current_beat_expected_streak, best_beat_expected_streak, times_beat_expected, upset_wins, wins, losses, rated_matches_played, matches_played, cached_recent_form, highest_rating_ever, lowest_rating_ever, bars_active_balance, bars_locked_pending, bars_total_earned, bars_lifetime_earned')
    .in('player_id', allPlayerIds);

  const statsById: Record<string, typeof statsRows extends Array<infer T> | null ? T : never> = {};
  for (const s of statsRows ?? []) statsById[s.player_id] = s;

  const playerChangesJson: Record<string, { before: number; change: number; after: number }> = {};
  const barsJson: Record<string, { amount: number; status: string }> = {};
  const streaksJson: Record<string, {
    win_streak_before: number; win_streak_after: number;
    beat_expected_streak_before: number; beat_expected_streak_after: number;
  }> = {};

  const now = new Date().toISOString();

  for (const p of snapshotPlayers) {
    const side = p.side;
    const playerChange = side === 'A' ? aPlayerChange : bPlayerChange;
    const ratingBefore = p.rating;
    const ratingAfter = ratingBefore + playerChange;
    const stats = statsById[p.player_id];

    // Update rating
    await supabase
      .from('player_profiles')
      .update({ current_rating: ratingAfter })
      .eq('id', p.player_id);

    // Insert rating event
    await supabase
      .from('rating_events')
      .insert({
        player_id: p.player_id,
        match_id: matchId,
        event_type: 'match_result',
        rating_before: ratingBefore,
        rating_change: playerChange,
        rating_after: ratingAfter,
        algorithm_version: snapshot?.algorithm_version ?? '1.0',
        visible_to_player: true,
      });

    // Streak calculations
    const isWinner = side === winningSide;
    const beatExpected = beatExpectedSide !== null && side === beatExpectedSide;

    const winStreakBefore = stats?.current_winning_streak ?? 0;
    const beatExpStreakBefore = stats?.current_beat_expected_streak ?? 0;

    let winStreakAfter: number;
    let beatExpStreakAfter: number;

    if (steps === 0) {
      winStreakAfter = isWinner ? winStreakBefore + 1 : 0;
      beatExpStreakAfter = isWinner ? beatExpStreakBefore + 1 : 0;
    } else if (isExactExpected) {
      winStreakAfter = isWinner ? winStreakBefore + 1 : 0;
      beatExpStreakAfter = 0; // both reset on exact expected
    } else {
      winStreakAfter = isWinner ? winStreakBefore + 1 : 0;
      beatExpStreakAfter = beatExpected ? beatExpStreakBefore + 1 : 0;
    }

    const newBestWinStreak = Math.max(stats?.best_winning_streak ?? 0, winStreakAfter);
    const newBestBeatExpStreak = Math.max(stats?.best_beat_expected_streak ?? 0, beatExpStreakAfter);
    const newHighest = Math.max(stats?.highest_rating_ever ?? ratingAfter, ratingAfter);
    const newLowest = Math.min(stats?.lowest_rating_ever ?? ratingAfter, ratingAfter);

    // Recent form: prepend 'W' or 'L', keep last 5
    const prevForm = stats?.cached_recent_form ?? '';
    const newForm = (isWinner ? 'W' : 'L') + prevForm.slice(0, 4);

    // Bars for this player
    const barsAmount = side === 'A' ? aBarsPerPlayer : bBarsPerPlayer;
    const wasPaid = wasPlayerPaidAtSubmission(p.player_id);
    const barsStatus = barsAmount === 0 ? null : (wasPaid ? 'active' : 'locked');

    if (barsAmount > 0 && barsStatus) {
      await supabase.from('bars_ledger').insert({
        player_id: p.player_id,
        match_id: matchId,
        amount: barsAmount,
        status: barsStatus,
        source_type: 'match_reward',
        source_id: matchId,
        was_paid_at_submission: wasPaid,
        expires_at: barsStatus === 'locked' ? barsExpiresAt.toISOString() : null,
      });
    }

    // Update player_stats
    const isUpset = !isWinner && beatExpected; // underdog beat stronger team
    await supabase
      .from('player_stats')
      .update({
        wins: (stats?.wins ?? 0) + (isWinner ? 1 : 0),
        losses: (stats?.losses ?? 0) + (!isWinner ? 1 : 0),
        matches_played: (stats?.matches_played ?? 0) + 1,
        rated_matches_played: (stats?.rated_matches_played ?? 0) + 1,
        current_winning_streak: winStreakAfter,
        best_winning_streak: newBestWinStreak,
        current_beat_expected_streak: beatExpStreakAfter,
        best_beat_expected_streak: newBestBeatExpStreak,
        times_beat_expected: (stats?.times_beat_expected ?? 0) + (beatExpected ? 1 : 0),
        upset_wins: (stats?.upset_wins ?? 0) + (isUpset ? 1 : 0),
        highest_rating_ever: newHighest,
        lowest_rating_ever: newLowest,
        cached_recent_form: newForm,
        bars_active_balance: (stats?.bars_active_balance ?? 0) + (barsStatus === 'active' ? barsAmount : 0),
        bars_locked_pending: (stats?.bars_locked_pending ?? 0) + (barsStatus === 'locked' ? barsAmount : 0),
        bars_total_earned: (stats?.bars_total_earned ?? 0) + barsAmount,
        bars_lifetime_earned: (stats?.bars_lifetime_earned ?? 0) + barsAmount,
        updated_at: now,
      })
      .eq('player_id', p.player_id);

    playerChangesJson[p.player_id] = { before: ratingBefore, change: playerChange, after: ratingAfter };
    if (barsAmount > 0) barsJson[p.player_id] = { amount: barsAmount, status: barsStatus! };
    streaksJson[p.player_id] = {
      win_streak_before: winStreakBefore,
      win_streak_after: winStreakAfter,
      beat_expected_streak_before: beatExpStreakBefore,
      beat_expected_streak_after: beatExpStreakAfter,
    };
  }

  // ── 10. Update team stats ──────────────────────────────────────────────────
  for (const side of ['A', 'B'] as const) {
    const teamId = side === 'A' ? match.team_a_id : match.team_b_id;
    const isTeamWinner = side === winningSide;
    const teamBeatExpected = beatExpectedSide !== null && side === beatExpectedSide;

    const { data: ts } = await supabase
      .from('team_stats')
      .select('wins, losses, current_win_streak, best_win_streak, current_beat_expected_streak, best_beat_expected_streak, times_beat_expected, upset_wins, matches_played, rated_matches, bars_earned_as_team, cached_recent_form')
      .eq('team_id', teamId)
      .single();

    const teamWinStreakBefore = ts?.current_win_streak ?? 0;
    const teamBeatExpStreakBefore = ts?.current_beat_expected_streak ?? 0;

    let teamWinStreakAfter: number;
    let teamBeatExpStreakAfter: number;

    if (steps === 0) {
      teamWinStreakAfter = isTeamWinner ? teamWinStreakBefore + 1 : 0;
      teamBeatExpStreakAfter = isTeamWinner ? teamBeatExpStreakBefore + 1 : 0;
    } else if (isExactExpected) {
      teamWinStreakAfter = isTeamWinner ? teamWinStreakBefore + 1 : 0;
      teamBeatExpStreakAfter = 0;
    } else {
      teamWinStreakAfter = isTeamWinner ? teamWinStreakBefore + 1 : 0;
      teamBeatExpStreakAfter = teamBeatExpected ? teamBeatExpStreakBefore + 1 : 0;
    }

    const teamChange = side === 'A' ? teamAChange : teamBChange;
    const teamRating = side === 'A' ? teamARating : teamBRating;
    const newTeamRating = Math.round(teamRating + teamChange);

    const prevTeamForm = ts?.cached_recent_form ?? '';
    const newTeamForm = (isTeamWinner ? 'W' : 'L') + prevTeamForm.slice(0, 4);
    const teamBarsThisMatch = side === 'A' ? aBarsPerPlayer * 2 : bBarsPerPlayer * 2;

    await supabase
      .from('team_stats')
      .update({
        wins: (ts?.wins ?? 0) + (isTeamWinner ? 1 : 0),
        losses: (ts?.losses ?? 0) + (!isTeamWinner ? 1 : 0),
        matches_played: (ts?.matches_played ?? 0) + 1,
        rated_matches: (ts?.rated_matches ?? 0) + 1,
        current_win_streak: teamWinStreakAfter,
        best_win_streak: Math.max(ts?.best_win_streak ?? 0, teamWinStreakAfter),
        current_beat_expected_streak: teamBeatExpStreakAfter,
        best_beat_expected_streak: Math.max(ts?.best_beat_expected_streak ?? 0, teamBeatExpStreakAfter),
        times_beat_expected: (ts?.times_beat_expected ?? 0) + (teamBeatExpected ? 1 : 0),
        upset_wins: (ts?.upset_wins ?? 0) + (!isTeamWinner && teamBeatExpected ? 1 : 0),
        cached_recent_form: newTeamForm,
        bars_earned_as_team: (ts?.bars_earned_as_team ?? 0) + teamBarsThisMatch,
        updated_at: now,
      })
      .eq('team_id', teamId);

    // Update team cached_current_team_rating
    await supabase
      .from('teams')
      .update({ cached_current_team_rating: newTeamRating })
      .eq('id', teamId);

    // Insert team_rating_snapshots
    const teamPlayers = snapshotPlayers.filter((p) => p.side === side);
    const p1 = teamPlayers[0];
    const p2 = teamPlayers[1];
    const playerChange = side === 'A' ? aPlayerChange : bPlayerChange;
    if (p1 && p2) {
      await supabase.from('team_rating_snapshots').insert({
        team_id: teamId,
        match_id: matchId,
        player1_id: p1.player_id,
        player2_id: p2.player_id,
        team_rating_before: Math.round(teamRating),
        team_rating_after: newTeamRating,
        player1_rating_before: p1.rating,
        player1_rating_after: p1.rating + playerChange,
        player2_rating_before: p2.rating,
        player2_rating_after: p2.rating + playerChange,
      });
    }
  }

  // ── 11. Generate plain-language explanation ────────────────────────────────
  const winnerLabel = winningSide === 'A' ? match.team_a_id : match.team_b_id;
  let explanationShort: string;
  let explanationDetailed: string;

  if (steps === 0) {
    const aChange = teamAChange > 0 ? `+${teamAChange}` : String(teamAChange);
    const bChange = teamBChange > 0 ? `+${teamBChange}` : String(teamBChange);
    explanationShort = `Balanced match. Winner gets full Bars reward. Team A ${aChange} / Team B ${bChange}.`;
    explanationDetailed = `The teams were balanced (steps = 0), so no expected score was set. Rating changes were assigned directly from the actual score (${actualLabel}). Team A: ${aChange} team points. Team B: ${bChange} team points.`;
  } else if (isExactExpected) {
    explanationShort = `Exact expected score. Winner earns 75% of Bars, loser earns 25%. No rating change from expectation.`;
    explanationDetailed = `The match result matched the expected score exactly (${actualLabel}). Team A ${teamAChange >= 0 ? '+' : ''}${teamAChange} / Team B ${teamBChange >= 0 ? '+' : ''}${teamBChange} team rating points.`;
  } else {
    const beatExpLabel = beatExpectedSide === winningSide ? 'The winning team also beat expectations' : 'The losing team beat expectations';
    const aChangeStr = teamAChange >= 0 ? `+${teamAChange}` : String(teamAChange);
    const bChangeStr = teamBChange >= 0 ? `+${teamBChange}` : String(teamBChange);
    explanationShort = `${beatExpLabel}. Team A ${aChangeStr} / Team B ${bChangeStr} team rating.`;
    explanationDetailed = `Expected: ${expected.expectedLabel ?? 'N/A'}. Actual: ${actualLabel}. Scenario difference: ${actualScenarioIndex - (expectedScenarioIndex ?? actualScenarioIndex)} steps. Team A: ${aChangeStr} / Team B: ${bChangeStr} team rating points.`;
  }

  // ── 12. Write processing summary ───────────────────────────────────────────
  await supabase.from('match_processing_summaries').insert({
    match_id: matchId,
    team_a_rating_snapshot: Math.round(teamARating),
    team_b_rating_snapshot: Math.round(teamBRating),
    steps,
    favored_side: favoredSide ?? 'balanced',
    expected_scenario_index: expectedScenarioIndex,
    expected_label: expected.expectedLabel,
    actual_scenario_index: actualScenarioIndex,
    actual_label: actualLabel,
    team_a_rating_change: teamAChange,
    team_b_rating_change: teamBChange,
    player_changes: playerChangesJson,
    bars_json: barsJson,
    streaks_json: streaksJson,
    explanation_short: explanationShort,
    explanation_detailed: explanationDetailed,
  });

  // ── 13. Mark match processed ────────────────────────────────────────────────
  await supabase
    .from('matches')
    .update({ status: 'processed' })
    .eq('id', matchId);

  // Lock onboarding answers after first rated match
  for (const p of snapshotPlayers) {
    await supabase
      .from('player_onboarding_answers')
      .update({ locked: true, locked_at: now })
      .eq('player_id', p.player_id)
      .eq('locked', false);
  }

  // ── 14. Quest progress ────────────────────────────────────────
  try {
    const { processQuestProgressFromMatch } = await import('@/app/actions/quests');
    const allPlayerIds = snapshotPlayers.map((p) => p.player_id);
    await processQuestProgressFromMatch(
      matchId,
      {
        team_a_wins: winningSide === 'A',
        winning_side: winningSide,
        steps,
        favored_side: favoredSide as 'A' | 'B' | 'balanced' | null,
        player_changes: playerChangesJson,
        bars_json: barsJson,
      },
      allPlayerIds,
      match.team_a_id,
      match.team_b_id,
    );
  } catch (_) {}

  // ── 15. Notify both teams: match processed ────────────────────
  try {
    const { sendNotificationToMany, getTeamRecipients } = await import('@/lib/notifications');
    const [teamARecipients, teamBRecipients] = await Promise.all([
      getTeamRecipients(match.team_a_id),
      getTeamRecipients(match.team_b_id),
    ]);
    const allRecipients = [...teamARecipients, ...teamBRecipients];
    await sendNotificationToMany(allRecipients, {
      type_key: 'match_processing_summary',
      category: 'rating_bars_streaks',
      priority: 'high',
      title: 'Match Processed',
      body: explanationShort,
      related_entity_type: 'match',
      related_entity_id: matchId,
      actions: [{
        action_key: 'view_match',
        action_label: 'View Results',
        action_url: `/matches/${matchId}`,
      }],
    });
  } catch (_) {}

  return {};
}
