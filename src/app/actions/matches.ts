'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { sendNotificationToMany, getTeamRecipients } from '@/lib/notifications';

// ── Score helpers ───────────────────────────────────────────────
// Valid winner-games and loser-games combinations
export const VALID_SCORES: Array<{ winnerGames: number; loserGames: number; label: string }> = [
  { winnerGames: 6, loserGames: 0, label: '6-0' },
  { winnerGames: 6, loserGames: 1, label: '6-1' },
  { winnerGames: 6, loserGames: 2, label: '6-2' },
  { winnerGames: 6, loserGames: 3, label: '6-3' },
  { winnerGames: 6, loserGames: 4, label: '6-4' },
  { winnerGames: 7, loserGames: 5, label: '7-5' },
  { winnerGames: 7, loserGames: 6, label: '7-6' },
];

function getScenarioIndex(winnerSide: 'A' | 'B', winnerGames: number, loserGames: number): number | null {
  const key = `${winnerGames}-${loserGames}`;
  if (winnerSide === 'A') {
    const map: Record<string, number> = { '6-0': 1, '6-1': 2, '6-2': 3, '6-3': 4, '6-4': 5, '7-5': 6, '7-6': 7 };
    return map[key] ?? null;
  } else {
    const map: Record<string, number> = { '7-6': 8, '7-5': 9, '6-4': 10, '6-3': 11, '6-2': 12, '6-1': 13, '6-0': 14 };
    return map[key] ?? null;
  }
}

function scenarioLabel(index: number): string {
  const labels: Record<number, string> = {
    1:'A 6-0', 2:'A 6-1', 3:'A 6-2', 4:'A 6-3', 5:'A 6-4', 6:'A 7-5', 7:'A 7-6',
    8:'B 7-6', 9:'B 7-5', 10:'B 6-4', 11:'B 6-3', 12:'B 6-2', 13:'B 6-1', 14:'B 6-0',
  };
  return labels[index] ?? String(index);
}

// ── Score set input ─────────────────────────────────────────────
export interface SetInput {
  winnerSide: 'my_team' | 'opponent';  // resolved to A/B in the action
  winnerGames: number;
  loserGames: number;
}

export interface SubmitScoreData {
  match_id: string;
  score_format: 'one_set' | 'best_of_3';
  sets: SetInput[];  // 1-3 entries
}

export interface SubmitScoreResult {
  submission_id?: string;
  error?: string;
}

export async function submitScore(data: SubmitScoreData): Promise<SubmitScoreResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found.' };

  // Load match
  const { data: match } = await supabase
    .from('matches')
    .select('id, match_type, status, team_a_id, team_b_id, first_score_submitted_at, rating_snapshot_json')
    .eq('id', data.match_id)
    .single();
  if (!match) return { error: 'Match not found.' };

  const nonSubmittable = ['confirmed', 'auto_approved', 'processed', 'voided', 'cancelled', 'disputed'];
  if (nonSubmittable.includes(match.status)) {
    return { error: 'This match cannot accept a new score submission.' };
  }

  // Verify player is in this match and get their side
  const { data: mySlot } = await supabase
    .from('match_players')
    .select('side, team_id')
    .eq('match_id', data.match_id)
    .eq('player_id', profile.id)
    .single();
  if (!mySlot) return { error: 'You are not a participant in this match.' };

  const mySide = mySlot.side as 'A' | 'B';
  const myTeamId = mySlot.team_id;

  // Block same-team duplicate (one submission per team)
  const { data: existingSub } = await supabase
    .from('match_score_submissions')
    .select('id, status')
    .eq('match_id', data.match_id)
    .eq('submitted_by_team_id', myTeamId)
    .not('status', 'in', '("withdrawn","superseded")')
    .maybeSingle();

  if (existingSub) return { error: 'Your team has already submitted a score for this match.' };

  // Resolve set winner sides
  const resolvedSets = data.sets.map((s) => ({
    ...s,
    resolvedWinnerSide: s.winnerSide === 'my_team' ? mySide : (mySide === 'A' ? 'B' : 'A'),
  }));

  // Validate sets
  if (data.score_format === 'best_of_3') {
    if (resolvedSets.length < 2 || resolvedSets.length > 3) {
      return { error: 'Best of 3 requires 2 or 3 sets.' };
    }
    const aWins = resolvedSets.filter((s) => s.resolvedWinnerSide === 'A').length;
    const bWins = resolvedSets.filter((s) => s.resolvedWinnerSide === 'B').length;
    const matchWinner = aWins === 2 ? 'A' : bWins === 2 ? 'B' : null;
    if (!matchWinner) return { error: 'Invalid best-of-3: no team has 2 wins.' };
    // Final set winner must be match winner
    const lastSet = resolvedSets[resolvedSets.length - 1];
    if (lastSet.resolvedWinnerSide !== matchWinner) {
      return { error: 'Invalid best-of-3: last set must be won by the match winner.' };
    }
  }

  // Last set = equivalent actual score
  const lastSet = resolvedSets[resolvedSets.length - 1];
  const equivalentScenarioIndex = getScenarioIndex(
    lastSet.resolvedWinnerSide as 'A' | 'B',
    lastSet.winnerGames,
    lastSet.loserGames
  );
  if (!equivalentScenarioIndex) return { error: 'Invalid score combination.' };

  const matchWinnerSide = lastSet.resolvedWinnerSide as 'A' | 'B';

  // If this is the FIRST submission: build and store rating snapshot
  const isFirstSubmission = !match.first_score_submitted_at;
  let ratingSnapshot = match.rating_snapshot_json as Record<string, unknown> | null;

  if (isFirstSubmission) {
    const { data: players } = await supabase
      .from('match_players')
      .select('player_id, side, slot, player_rating_at_match_creation')
      .eq('match_id', data.match_id);

    // Fetch current ratings at submission time
    const playerIds = (players ?? []).map((p) => p.player_id);
    const { data: currentRatings } = await supabase
      .from('player_profiles')
      .select('id, current_rating')
      .in('id', playerIds);

    const ratingNow: Record<string, number> = {};
    for (const p of currentRatings ?? []) ratingNow[p.id] = p.current_rating;

    // Update player_rating_at_score_submission in match_players
    for (const p of players ?? []) {
      await supabase
        .from('match_players')
        .update({ player_rating_at_score_submission: ratingNow[p.player_id] ?? p.player_rating_at_match_creation })
        .eq('match_id', data.match_id)
        .eq('player_id', p.player_id);
    }

    const aPlayers = (players ?? []).filter((p) => p.side === 'A');
    const bPlayers = (players ?? []).filter((p) => p.side === 'B');
    const teamARating = aPlayers.length === 2
      ? (ratingNow[aPlayers[0].player_id] + ratingNow[aPlayers[1].player_id]) / 2
      : ratingNow[aPlayers[0]?.player_id] ?? 500;
    const teamBRating = bPlayers.length === 2
      ? (ratingNow[bPlayers[0].player_id] + ratingNow[bPlayers[1].player_id]) / 2
      : ratingNow[bPlayers[0]?.player_id] ?? 500;

    const { calculateExpectedScore } = await import('@/lib/bandeja-rating');
    const expected = calculateExpectedScore(teamARating, teamBRating);

    ratingSnapshot = {
      team_a_rating: teamARating,
      team_b_rating: teamBRating,
      players: (players ?? []).map((p) => ({
        player_id: p.player_id,
        side: p.side,
        slot: p.slot,
        rating: ratingNow[p.player_id] ?? p.player_rating_at_match_creation,
      })),
      expected_scenario_index: expected.expectedScenarioIndex,
      expected_label: expected.expectedLabel,
      steps: expected.steps,
      favored_side: expected.favoredSide ?? 'balanced',
      algorithm_version: '1.0',
    };

    await supabase
      .from('matches')
      .update({
        rating_snapshot_json: ratingSnapshot,
        first_score_submitted_at: new Date().toISOString(),
        status: 'awaiting_confirmation',
      })
      .eq('id', data.match_id);
  }

  // Insert submission
  const { data: submission, error: subErr } = await supabase
    .from('match_score_submissions')
    .insert({
      match_id: data.match_id,
      submitted_by_player_id: profile.id,
      submitted_by_team_id: myTeamId,
      submission_type: match.status === 'awaiting_confirmation' ? 'alternative' : 'original',
      score_format: data.score_format,
      equivalent_actual_score_scenario_index: equivalentScenarioIndex,
      equivalent_actual_score_label: scenarioLabel(equivalentScenarioIndex),
      winning_side: matchWinnerSide,
      status: 'pending',
    })
    .select('id')
    .single();

  if (subErr) return { error: subErr.message };

  // Insert individual sets
  const setRows = resolvedSets.map((s, i) => {
    const scenIdx = getScenarioIndex(s.resolvedWinnerSide as 'A' | 'B', s.winnerGames, s.loserGames);
    return {
      score_submission_id: submission.id,
      set_number: i + 1,
      winning_side: s.resolvedWinnerSide,
      winner_games: s.winnerGames,
      loser_games: s.loserGames,
      scenario_index: scenIdx,
      score_label: `${s.winnerGames}-${s.loserGames}`,
    };
  });
  await supabase.from('match_score_sets').insert(setRows);

  // Update match status if alternative submission
  if (match.status === 'awaiting_confirmation') {
    await supabase
      .from('matches')
      .update({ status: 'alternative_score_submitted' })
      .eq('id', data.match_id);
  }

  // Notify opponent team: score confirmation required
  const opponentTeamId = mySide === 'A' ? match.team_b_id : match.team_a_id;
  try {
    const opponentRecipients = await getTeamRecipients(opponentTeamId);
    await sendNotificationToMany(opponentRecipients, {
      type_key: 'score_confirmation_required',
      category: 'score_confirmation',
      priority: 'critical',
      title: 'Score Submitted — Confirm?',
      body: `Your opponent submitted a score: ${scenarioLabel(equivalentScenarioIndex)}. Please confirm or reject.`,
      related_entity_type: 'match',
      related_entity_id: data.match_id,
      is_pinned: true,
      pinned_until_action: true,
      actions: [{
        action_key: 'view_match',
        action_label: 'Review Score',
        action_url: `/matches/${data.match_id}`,
      }],
    });
  } catch (_) { /* notification failures must not fail the core action */ }

  return { submission_id: submission.id };
}

export async function confirmScore(submission_id: string): Promise<{ match_id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found.' };

  const { data: sub } = await supabase
    .from('match_score_submissions')
    .select('id, match_id, submitted_by_team_id, status')
    .eq('id', submission_id)
    .single();
  if (!sub) return { error: 'Submission not found.' };
  if (sub.status !== 'pending') return { error: 'Submission is no longer pending.' };

  // Confirmer must be on the OTHER team
  const { data: mySlot } = await supabase
    .from('match_players')
    .select('team_id')
    .eq('match_id', sub.match_id)
    .eq('player_id', profile.id)
    .single();
  if (!mySlot) return { error: 'You are not a participant in this match.' };
  if (mySlot.team_id === sub.submitted_by_team_id) {
    return { error: 'You cannot confirm your own team\'s submission.' };
  }

  // Mark submission confirmed
  await supabase
    .from('match_score_submissions')
    .update({
      status: 'confirmed',
      confirmed_by_player_id: profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', submission_id);

  // Mark match confirmed
  await supabase
    .from('matches')
    .update({ status: 'confirmed' })
    .eq('id', sub.match_id);

  // Trigger rating processing for rated matches
  const { data: confirmedMatch } = await supabase
    .from('matches')
    .select('match_type, team_a_id, team_b_id')
    .eq('id', sub.match_id)
    .single();
  if (confirmedMatch?.match_type === 'rivals_rated') {
    const { processApprovedRatedMatch } = await import('@/app/actions/processing');
    await processApprovedRatedMatch(sub.match_id);
  }

  // Notify submitter team: score confirmed
  try {
    const submitterRecipients = await getTeamRecipients(sub.submitted_by_team_id);
    await sendNotificationToMany(submitterRecipients, {
      type_key: 'score_confirmed',
      category: 'score_confirmation',
      priority: 'high',
      title: 'Score Confirmed',
      body: 'Your opponent confirmed the match score. Results are being processed.',
      related_entity_type: 'match',
      related_entity_id: sub.match_id,
    });
  } catch (_) {}

  return { match_id: sub.match_id };
}

export async function rejectScore(
  submission_id: string,
  dispute_text?: string
): Promise<{ match_id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found.' };

  const { data: sub } = await supabase
    .from('match_score_submissions')
    .select('id, match_id, submitted_by_team_id, submission_type, status')
    .eq('id', submission_id)
    .single();
  if (!sub) return { error: 'Submission not found.' };
  if (sub.status !== 'pending') return { error: 'Submission is no longer pending.' };

  const { data: mySlot } = await supabase
    .from('match_players')
    .select('team_id')
    .eq('match_id', sub.match_id)
    .eq('player_id', profile.id)
    .single();
  if (!mySlot) return { error: 'You are not a participant in this match.' };

  // Rejecting the original → becomes awaiting alternative
  // Rejecting an alternative → goes to disputed
  const isAlternative = sub.submission_type === 'alternative';
  const newMatchStatus = isAlternative ? 'disputed' : 'awaiting_confirmation';

  await supabase
    .from('match_score_submissions')
    .update({
      status: 'rejected',
      rejected_by_player_id: profile.id,
      rejected_at: new Date().toISOString(),
      dispute_text: dispute_text ?? null,
    })
    .eq('id', submission_id);

  await supabase
    .from('matches')
    .update({ status: newMatchStatus })
    .eq('id', sub.match_id);

  // Notify submitter team of rejection or dispute
  try {
    const submitterRecipients = await getTeamRecipients(sub.submitted_by_team_id);
    const isDispute = isAlternative;
    await sendNotificationToMany(submitterRecipients, {
      type_key: isDispute ? 'dispute_opened' : 'score_rejected',
      category: 'score_confirmation',
      priority: 'critical',
      title: isDispute ? 'Dispute Opened' : 'Score Rejected',
      body: isDispute
        ? 'Your opponent rejected the alternative score. An admin will review the dispute.'
        : 'Your opponent rejected the submitted score. They can submit their own version.',
      related_entity_type: 'match',
      related_entity_id: sub.match_id,
      is_pinned: isDispute,
    });
  } catch (_) {}

  return { match_id: sub.match_id };
}

export async function withdrawSubmission(submission_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found.' };

  const { data: sub } = await supabase
    .from('match_score_submissions')
    .select('id, match_id, submitted_by_player_id, status')
    .eq('id', submission_id)
    .single();
  if (!sub) return { error: 'Submission not found.' };
  if (sub.submitted_by_player_id !== profile.id) return { error: 'You can only withdraw your own submission.' };
  if (sub.status !== 'pending') return { error: 'Submission is no longer pending.' };

  await supabase
    .from('match_score_submissions')
    .update({ status: 'withdrawn' })
    .eq('id', submission_id);

  // Revert match to scheduled_tbd
  await supabase
    .from('matches')
    .update({ status: 'scheduled_tbd' })
    .eq('id', sub.match_id);

  return {};
}

export async function autoApproveIfExpired(match_id: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: match } = await supabase
    .from('matches')
    .select('id, status, first_score_submitted_at')
    .eq('id', match_id)
    .single();

  if (!match || match.status !== 'awaiting_confirmation' || !match.first_score_submitted_at) {
    return false;
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'SCORE_AUTO_APPROVAL_DELAY_HOURS')
    .single();
  const delayHours = setting ? Number(setting.value) : 24;

  const deadline = new Date(match.first_score_submitted_at);
  deadline.setHours(deadline.getHours() + delayHours);

  if (new Date() < deadline) return false;

  await supabase
    .from('matches')
    .update({ status: 'auto_approved' })
    .eq('id', match_id);

  // Trigger processing
  const { data: autoMatch } = await supabase
    .from('matches')
    .select('match_type')
    .eq('id', match_id)
    .single();
  if (autoMatch?.match_type === 'rivals_rated') {
    const { processApprovedRatedMatch } = await import('@/app/actions/processing');
    await processApprovedRatedMatch(match_id);
  }

  return true;
}
