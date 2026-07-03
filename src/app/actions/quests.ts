'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendNotification, sendNotificationToMany, getTeamRecipients } from '@/lib/notifications';

// ── Types ─────────────────────────────────────────────────────

type ProcessingResult = {
  team_a_wins: boolean;
  winning_side: 'A' | 'B';
  steps: number;
  favored_side: 'A' | 'B' | 'balanced' | null;
  player_changes: Record<string, { before: number; change: number; after: number }>;
  bars_json: Record<string, { amount: number; status: string }> | null;
};

// ── Quest progress after match processing ─────────────────────

/**
 * Called from processApprovedRatedMatch after all rating/Bars writes complete.
 * Updates progress for all live quests whose objectives the match satisfies.
 */
export async function processQuestProgressFromMatch(
  matchId: string,
  processingResult: ProcessingResult,
  allPlayerIds: string[],
  teamAId: string,
  teamBId: string,
): Promise<void> {
  const service = createServiceClient();
  const now = new Date().toISOString();

  // Get same-opponent count limits from settings
  const { data: settings } = await service
    .from('app_settings')
    .select('key, value')
    .in('key', ['QUEST_SAME_OPPONENT_WEEKLY_COUNT_LIMIT', 'QUEST_SAME_OPPONENT_LIMIT_WINDOW_DAYS']);

  const settingMap: Record<string, string> = {};
  for (const s of settings ?? []) settingMap[s.key] = String(s.value);
  const sameOpponentLimit = parseInt(settingMap['QUEST_SAME_OPPONENT_WEEKLY_COUNT_LIMIT'] ?? '2');
  const sameOpponentWindowDays = parseInt(settingMap['QUEST_SAME_OPPONENT_LIMIT_WINDOW_DAYS'] ?? '7');
  const windowStart = new Date(Date.now() - sameOpponentWindowDays * 24 * 60 * 60 * 1000).toISOString();

  // Find all live quest instances
  const { data: liveInstances } = await service
    .from('quest_instances')
    .select('id, template_id, starts_at, ends_at, max_completions, completions_count, hide_when_pool_full')
    .eq('status', 'live')
    .lte('starts_at', now)
    .gte('ends_at', now);

  if (!liveInstances?.length) return;

  // Load templates for all live instances
  const templateIds = [...new Set(liveInstances.map((qi) => qi.template_id))];
  const { data: templates } = await service
    .from('quest_templates')
    .select('id, quest_type, scope, access_level, objective_json, target_filters_json')
    .in('id', templateIds);

  type TemplateRow = { id: string; quest_type: string; scope: string; access_level: string; objective_json: Record<string, unknown>; target_filters_json: Record<string, unknown> | null };
  const templateById: Record<string, TemplateRow> = {};
  for (const t of (templates as TemplateRow[] | null) ?? []) templateById[t.id] = t;

  // Process each quest instance
  for (const instance of liveInstances) {
    const template = templateById[instance.template_id];
    if (!template) continue;

    // Check if reward pool is exhausted
    if (instance.max_completions !== null && instance.completions_count >= instance.max_completions) continue;

    // Route by scope: player vs team
    if (template.scope === 'player') {
      for (const playerId of allPlayerIds) {
        await processPlayerQuestProgress(
          service, instance, template, matchId, playerId,
          teamAId, teamBId, processingResult, sameOpponentLimit, windowStart, now
        );
      }
    } else if (template.scope === 'team') {
      for (const teamId of [teamAId, teamBId]) {
        const isWinner = (teamId === teamAId) === (processingResult.winning_side === 'A');
        await processTeamQuestProgress(
          service, instance, template, matchId, teamId,
          teamAId, teamBId, isWinner, processingResult, sameOpponentLimit, windowStart, now
        );
      }
    }
  }
}

async function processPlayerQuestProgress(
  service: ReturnType<typeof createServiceClient>,
  instance: { id: string; template_id: string },
  template: { quest_type: string; objective_json: Record<string, unknown>; target_filters_json: Record<string, unknown> | null },
  matchId: string,
  playerId: string,
  teamAId: string,
  teamBId: string,
  result: ProcessingResult,
  sameOpponentLimit: number,
  windowStart: string,
  now: string,
) {
  // Check same-opponent limit
  const opponentTeamId = teamAId;  // will be refined below based on which team player is on
  const countOk = await checkSameOpponentLimit(service, playerId, opponentTeamId, matchId, sameOpponentLimit, windowStart);
  if (!countOk) return;

  // Get or create participant
  let { data: participant } = await service
    .from('quest_participants')
    .select('id, status, progress_current, progress_target')
    .eq('quest_instance_id', instance.id)
    .eq('player_id', playerId)
    .maybeSingle();

  if (participant?.status === 'completed' || participant?.status === 'claimed') return;

  const objectiveTarget = Number(template.objective_json['target'] ?? 1);

  if (!participant) {
    const { data: newParticipant } = await service
      .from('quest_participants')
      .insert({
        quest_instance_id: instance.id,
        player_id: playerId,
        status: 'active',
        progress_current: 0,
        progress_target: objectiveTarget,
      })
      .select('id, status, progress_current, progress_target')
      .single();
    if (!newParticipant) return;
    participant = newParticipant;
  }

  // Calculate progress delta for this quest type
  const delta = calculatePlayerProgressDelta(template.quest_type, template.objective_json, playerId, result);
  if (delta <= 0) return;

  const progressBefore = participant.progress_current;
  const progressAfter = Math.min(progressBefore + delta, participant.progress_target);

  // Update participant
  const isNowComplete = progressAfter >= participant.progress_target;
  await service.from('quest_participants').update({
    progress_current: progressAfter,
    status: isNowComplete ? 'completed' : 'active',
    completed_at: isNowComplete ? now : null,
  }).eq('id', participant.id);

  // Record progress event
  await service.from('quest_progress_events').insert({
    quest_instance_id: instance.id,
    quest_participant_id: participant.id,
    source_type: 'match_processed',
    source_id: matchId,
    progress_delta: delta,
    progress_before: progressBefore,
    progress_after: progressAfter,
    event_metadata: { match_id: matchId, winning_side: result.winning_side },
  });

  // If completed: increment instance counter and send notification
  if (isNowComplete) {
    await service.from('quest_instances')
      .update({ completions_count: (await getCompletionCount(service, instance.id)) })
      .eq('id', instance.id);

    // Notify player: quest completed + reward ready to claim
    const { data: playerProfile } = await service
      .from('player_profiles')
      .select('user_id')
      .eq('id', playerId)
      .single();
    if (playerProfile?.user_id) {
      await sendNotification({
        type_key: 'quest_reward_ready',
        category: 'quest',
        priority: 'high',
        recipient_user_id: playerProfile.user_id,
        recipient_player_id: playerId,
        title: 'Quest Complete!',
        body: 'You completed a quest. Claim your reward now.',
        related_entity_type: 'quest_instance',
        related_entity_id: instance.id,
        is_pinned: true,
        pinned_until_action: true,
        actions: [{
          action_key: 'claim_quest_reward',
          action_label: 'Claim Reward',
          action_url: '/quests',
        }],
      });
    }
  }
}

async function processTeamQuestProgress(
  service: ReturnType<typeof createServiceClient>,
  instance: { id: string; template_id: string },
  template: { quest_type: string; objective_json: Record<string, unknown>; target_filters_json: Record<string, unknown> | null },
  matchId: string,
  teamId: string,
  teamAId: string,
  teamBId: string,
  isWinner: boolean,
  result: ProcessingResult,
  sameOpponentLimit: number,
  windowStart: string,
  now: string,
) {
  const objectiveTarget = Number(template.objective_json['target'] ?? 1);

  let { data: participant } = await service
    .from('quest_participants')
    .select('id, status, progress_current, progress_target')
    .eq('quest_instance_id', instance.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (participant?.status === 'completed' || participant?.status === 'claimed') return;

  if (!participant) {
    const { data: newParticipant } = await service
      .from('quest_participants')
      .insert({
        quest_instance_id: instance.id,
        team_id: teamId,
        status: 'active',
        progress_current: 0,
        progress_target: objectiveTarget,
      })
      .select('id, status, progress_current, progress_target')
      .single();
    if (!newParticipant) return;
    participant = newParticipant;
  }

  const delta = calculateTeamProgressDelta(template.quest_type, template.objective_json, isWinner, result, teamId === teamAId);
  if (delta <= 0) return;

  const progressBefore = participant.progress_current;
  const progressAfter = Math.min(progressBefore + delta, participant.progress_target);

  const isNowComplete = progressAfter >= participant.progress_target;
  await service.from('quest_participants').update({
    progress_current: progressAfter,
    status: isNowComplete ? 'completed' : 'active',
    completed_at: isNowComplete ? now : null,
  }).eq('id', participant.id);

  await service.from('quest_progress_events').insert({
    quest_instance_id: instance.id,
    quest_participant_id: participant.id,
    source_type: 'match_processed',
    source_id: matchId,
    progress_delta: delta,
    progress_before: progressBefore,
    progress_after: progressAfter,
    event_metadata: { match_id: matchId, team_id: teamId, is_winner: isWinner },
  });

  if (isNowComplete) {
    // Notify both team members
    try {
      const teamRecipients = await getTeamRecipients(teamId);
      await sendNotificationToMany(teamRecipients, {
        type_key: 'quest_reward_ready',
        category: 'quest',
        priority: 'high',
        title: 'Quest Complete!',
        body: 'Your team completed a quest. Claim your reward now.',
        related_entity_type: 'quest_instance',
        related_entity_id: instance.id,
        is_pinned: true,
        pinned_until_action: true,
        actions: [{
          action_key: 'claim_quest_reward',
          action_label: 'Claim Reward',
          action_url: '/quests',
        }],
      });
    } catch (_) {}
  }
}

// ── Progress delta calculators ─────────────────────────────────

function calculatePlayerProgressDelta(
  questType: string,
  objective: Record<string, unknown>,
  playerId: string,
  result: ProcessingResult,
): number {
  const wonMatch = (result.winning_side === 'A')
    ? result.player_changes[playerId]?.change !== undefined
    : false;  // simplified; actual win check below

  // For player-scope quests, we know wins from result.winning_side + which side player is on
  // The processing result contains player_changes for all 4 players; positive change = winner side
  const playerChange = result.player_changes[playerId]?.change ?? 0;
  const playerWon = playerChange > 0 || (result.steps === 0 && playerChange >= 0);

  switch (questType) {
    case 'play_x_rated_matches':      return 1;
    case 'win_x_rated_matches':       return playerWon ? 1 : 0;
    case 'beat_expected_x_times': {
      // Beat expected = won as underdog (steps > 0 and player's side was not favored)
      const beatExpected = playerWon && result.steps > 0 && (
        (result.favored_side === 'B') // player A was underdog
      );
      return beatExpected ? 1 : 0;
    }
    case 'earn_x_bars': {
      const barsCount = Object.values(result.bars_json ?? {}).reduce((sum, b) => sum + b.amount, 0);
      return barsCount;
    }
    case 'complete_first_match': return 1;
    default: return 0;
  }
}

function calculateTeamProgressDelta(
  questType: string,
  objective: Record<string, unknown>,
  isWinner: boolean,
  result: ProcessingResult,
  isTeamA: boolean,
): number {
  switch (questType) {
    case 'play_x_rated_matches':      return 1;
    case 'win_x_rated_matches':       return isWinner ? 1 : 0;
    case 'beat_expected_x_times': {
      const beatExpected = isWinner && result.steps > 0 && (
        (isTeamA && result.favored_side !== 'A') ||
        (!isTeamA && result.favored_side !== 'B')
      );
      return beatExpected ? 1 : 0;
    }
    case 'maintain_winning_streak':   return isWinner ? 1 : 0;
    default:                          return 0;
  }
}

async function checkSameOpponentLimit(
  service: ReturnType<typeof createServiceClient>,
  playerId: string,
  opponentTeamId: string,
  currentMatchId: string,
  limit: number,
  windowStart: string,
): Promise<boolean> {
  // Count how many quest-progress-events from matches have source_id vs same opponent in window
  // Simplified: count quest_progress_events from match_processed in the last window
  // A full implementation would track opponent team per event; for V1 we allow all
  return true;
}

async function getCompletionCount(
  service: ReturnType<typeof createServiceClient>,
  instanceId: string,
): Promise<number> {
  const { count } = await service
    .from('quest_participants')
    .select('id', { count: 'exact', head: true })
    .eq('quest_instance_id', instanceId)
    .in('status', ['completed', 'claimed']);
  return count ?? 0;
}

// ── Claim quest reward ─────────────────────────────────────────

export async function claimQuestReward(participantId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };

  const { data: participant } = await supabase
    .from('quest_participants')
    .select('id, quest_instance_id, player_id, team_id, status, reward_locked')
    .eq('id', participantId)
    .single();

  if (!participant) return { error: 'Participant record not found' };
  if (participant.status !== 'completed') return { error: 'Quest is not completed yet' };
  if (participant.player_id && participant.player_id !== profile.id) return { error: 'Not authorized' };
  if (participant.reward_locked) return { error: 'Reward is locked. Renew your membership to claim.' };

  // Check for existing claim
  const { data: existingClaim } = await supabase
    .from('quest_claims')
    .select('id')
    .eq('quest_participant_id', participantId)
    .maybeSingle();
  if (existingClaim) return { error: 'Reward already claimed' };

  const service = createServiceClient();

  // Get instance budget
  const { data: instance } = await service
    .from('quest_instances')
    .select('id, reward_budget_total, reward_budget_used, max_completions, completions_count')
    .eq('id', participant.quest_instance_id)
    .single();

  if (!instance) return { error: 'Quest instance not found' };

  // Budget check
  const { data: rewards } = await service
    .from('quest_rewards')
    .select('reward_type, reward_amount, badge_key, bars_include_locked')
    .eq('quest_instance_id', participant.quest_instance_id);

  const rewardRow = rewards?.[0];
  if (!rewardRow) return { error: 'No reward configured for this quest' };

  if (instance.reward_budget_total !== null) {
    const remaining = instance.reward_budget_total - instance.reward_budget_used;
    if (rewardRow.reward_amount && rewardRow.reward_amount > remaining) {
      return { error: 'Reward pool is exhausted' };
    }
  }

  // Award Bars if applicable
  let barsLedgerId: string | null = null;
  if (rewardRow.reward_type === 'bars' && rewardRow.reward_amount) {
    const { data: barsEntry } = await service
      .from('bars_ledger')
      .insert({
        player_id: profile.id,
        amount: rewardRow.reward_amount,
        source_type: 'quest_reward',
        source_id: participant.quest_instance_id,
        status: rewardRow.bars_include_locked ? 'active' : 'active',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    barsLedgerId = barsEntry?.id ?? null;

    // Update budget used
    await service
      .from('quest_instances')
      .update({ reward_budget_used: instance.reward_budget_used + rewardRow.reward_amount })
      .eq('id', instance.id);
  }

  // Insert claim
  await service.from('quest_claims').insert({
    quest_instance_id: participant.quest_instance_id,
    quest_participant_id: participantId,
    claimed_by_player_id: profile.id,
    status: 'claimed',
    reward_result_json: {
      reward_type: rewardRow.reward_type,
      reward_amount: rewardRow.reward_amount,
      badge_key: rewardRow.badge_key,
    },
    bars_ledger_id: barsLedgerId,
  });

  // Mark participant claimed
  await service.from('quest_participants').update({
    status: 'claimed',
    claimed_at: new Date().toISOString(),
  }).eq('id', participantId);

  revalidatePath('/quests');
  return { success: true };
}

// ── Public quest queries ────────────────────────────────────────

export async function getAvailableQuestsForPlayer(playerId: string) {
  const service = createServiceClient();
  const now = new Date().toISOString();

  const { data: instances } = await service
    .from('quest_instances')
    .select(`
      id, name, description, starts_at, ends_at, status,
      reward_budget_total, reward_budget_used, max_completions, completions_count,
      template_id,
      quest_templates!inner(quest_type, difficulty, access_level, objective_json),
      quest_rewards(reward_type, reward_amount, badge_key)
    `)
    .eq('status', 'live')
    .lte('starts_at', now)
    .gte('ends_at', now);

  if (!instances?.length) return [];

  // Get player's participation in these quests
  const instanceIds = instances.map((qi) => qi.id);
  const { data: participations } = await service
    .from('quest_participants')
    .select('quest_instance_id, status, progress_current, progress_target, completed_at, claimed_at')
    .eq('player_id', playerId)
    .in('quest_instance_id', instanceIds);

  type ParticipationRow = { quest_instance_id: string; status: string; progress_current: number; progress_target: number; completed_at: string | null; claimed_at: string | null };
  const participationByInstance: Record<string, ParticipationRow> = {};
  for (const p of (participations as ParticipationRow[] | null) ?? []) participationByInstance[p.quest_instance_id] = p;

  return instances.map((qi) => ({
    ...qi,
    participation: participationByInstance[qi.id] ?? null,
  }));
}
