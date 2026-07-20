'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ── Types matching actual DB schema ───────────────────────────

type PlayerStatsRow = {
  player_id: string;
  rated_matches_played: number;
  wins: number;
  losses: number;
  current_winning_streak: number;
  best_winning_streak: number;
  current_beat_expected_streak: number;
  best_beat_expected_streak: number;
  bars_active_balance: number;
  bars_total_earned: number;
};

type TeamStatsRow = {
  team_id: string;
  rated_matches: number;
  wins: number;
  losses: number;
  current_win_streak: number;
  best_win_streak: number;
};

type LeaderboardConfig = {
  id: string;
  entity_type: 'player' | 'team';
  metric_key: string;
  time_window: string;
  scope_type: string;
  scope_city: string | null;
  scope_country: string | null;
  min_rated_matches: number;
  minimum_ranked_entities: number;
};

// ── Main refresh function ─────────────────────────────────────

export async function refreshLeaderboard(configId: string): Promise<{ success: boolean; error?: string; count?: number }> {
  const service = createServiceClient();

  const { data: config, error: configErr } = await service
    .from('leaderboard_configs')
    .select('id, entity_type, metric_key, time_window, scope_type, scope_city, scope_country, min_rated_matches, minimum_ranked_entities, is_active, is_frozen')
    .eq('id', configId)
    .single();

  if (configErr || !config) return { success: false, error: 'Config not found' };
  if (!config.is_active) return { success: false, error: 'Leaderboard is not active' };
  if (config.is_frozen) return { success: false, error: 'Leaderboard is frozen' };

  const now = new Date();
  const windowStart = getWindowStart(config.time_window, now);

  let rankedEntries: Array<{ entity_id: string; metric_value: number }> = [];

  if (config.entity_type === 'player') {
    rankedEntries = await buildPlayerEntries(service, config as LeaderboardConfig, windowStart);
  } else {
    rankedEntries = await buildTeamEntries(service, config as LeaderboardConfig);
  }

  if (rankedEntries.length < config.minimum_ranked_entities) {
    await service.from('leaderboard_configs').update({ last_refreshed_at: now.toISOString() }).eq('id', configId);
    return { success: true, count: 0 };
  }

  // Load previous ranks for rank_change tracking
  const { data: prevEntries } = await service
    .from('leaderboard_entries')
    .select('player_id, team_id, rank')
    .eq('config_id', configId);

  const prevRankByEntity: Record<string, number> = {};
  for (const e of prevEntries ?? []) {
    const key = e.player_id ?? e.team_id ?? '';
    if (key) prevRankByEntity[key] = e.rank;
  }

  // Assign ranks
  const upsertRows = rankedEntries.map((entry, i) => {
    const rank = i + 1;
    const prevRank = prevRankByEntity[entry.entity_id] ?? null;
    return {
      config_id: configId,
      entity_type: config.entity_type,
      ...(config.entity_type === 'player'
        ? { player_id: entry.entity_id, team_id: null }
        : { team_id: entry.entity_id, player_id: null }),
      rank,
      previous_rank: prevRank,
      metric_value: entry.metric_value,
      is_active_eligible: true,
      hidden_by_admin: false,
      refreshed_at: now.toISOString(),
    };
  });

  await service.from('leaderboard_entries').delete().eq('config_id', configId);

  if (upsertRows.length > 0) {
    const { error: insertErr } = await service.from('leaderboard_entries').insert(upsertRows);
    if (insertErr) return { success: false, error: insertErr.message };
  }

  // Daily snapshot
  const { data: snapshot } = await service
    .from('leaderboard_snapshots')
    .insert({ config_id: configId, snapshot_type: 'daily', entry_count: upsertRows.length })
    .select('id')
    .single();

  if (snapshot && upsertRows.length > 0) {
    const snapEntries = upsertRows.map((r) => ({
      snapshot_id: snapshot.id,
      entity_type: config.entity_type,
      player_id: config.entity_type === 'player' ? r.player_id : null,
      team_id: config.entity_type === 'team' ? r.team_id : null,
      rank: r.rank,
      metric_value: r.metric_value,
    }));
    await service.from('leaderboard_snapshot_entries').insert(snapEntries);
  }

  await service.from('leaderboard_configs').update({ last_refreshed_at: now.toISOString() }).eq('id', configId);

  // Notify entities whose rank improved since the last refresh
  try {
    const improved = upsertRows.filter(
      (r) => r.previous_rank !== null && r.rank < r.previous_rank
    );
    if (improved.length > 0) {
      const { sendNotification, getTeamRecipients } = await import('@/lib/notifications');
      if (config.entity_type === 'player') {
        const playerIds = improved.map((r) => r.player_id).filter(Boolean) as string[];
        const { data: profiles } = await service
          .from('player_profiles')
          .select('id, user_id')
          .in('id', playerIds);
        for (const p of profiles ?? []) {
          const entry = improved.find((r) => r.player_id === p.id);
          if (!entry) continue;
          const moved = entry.previous_rank! - entry.rank;
          await sendNotification({
            type_key: 'leaderboard_rank_improved',
            category: 'leaderboard',
            priority: 'normal',
            recipient_user_id: p.user_id,
            recipient_player_id: p.id,
            title: 'Leaderboard Rank Up',
            body: `You moved up ${moved} spot${moved > 1 ? 's' : ''} to #${entry.rank} on the leaderboard.`,
            related_entity_type: 'leaderboard_config',
            related_entity_id: configId,
          });
        }
      } else {
        // Team leaderboard: notify all team members
        const { sendNotificationToMany } = await import('@/lib/notifications');
        for (const entry of improved) {
          if (!entry.team_id) continue;
          const moved = entry.previous_rank! - entry.rank;
          const recipients = await getTeamRecipients(entry.team_id);
          await sendNotificationToMany(recipients, {
            type_key: 'leaderboard_rank_improved',
            category: 'leaderboard',
            priority: 'normal',
            title: 'Leaderboard Rank Up',
            body: `Your team moved up ${moved} spot${moved > 1 ? 's' : ''} to #${entry.rank} on the leaderboard.`,
            related_entity_type: 'leaderboard_config',
            related_entity_id: configId,
          });
        }
      }
    }
  } catch (_) {}

  return { success: true, count: upsertRows.length };
}

// ── Refresh all active leaderboards ───────────────────────────

export async function refreshAllLeaderboards(): Promise<{ refreshed: number; errors: string[] }> {
  const service = createServiceClient();
  const { data: configs } = await service
    .from('leaderboard_configs')
    .select('id')
    .eq('is_active', true)
    .eq('is_frozen', false);

  if (!configs?.length) return { refreshed: 0, errors: [] };

  let refreshed = 0;
  const errors: string[] = [];

  for (const cfg of configs) {
    const result = await refreshLeaderboard(cfg.id);
    if (result.success) refreshed++;
    else errors.push(`${cfg.id}: ${result.error}`);
  }

  revalidatePath('/leaderboards');
  return { refreshed, errors };
}

// ── Manual trigger (admin) ────────────────────────────────────

export async function manualRefreshLeaderboard(configId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthenticated' };
  const meta = user.app_metadata as { role?: string } | null;
  if (meta?.role !== 'admin') return { success: false, error: 'Not admin' };
  const result = await refreshLeaderboard(configId);
  revalidatePath('/leaderboards');
  return result;
}

// ── Build player entries ──────────────────────────────────────

async function buildPlayerEntries(
  service: ReturnType<typeof createServiceClient>,
  config: LeaderboardConfig,
  windowStart: Date | null,
): Promise<Array<{ entity_id: string; metric_value: number }>> {
  const minMatches = config.min_rated_matches;

  // Query player_stats with actual column names
  const { data: allStats } = await service
    .from('player_stats')
    .select('player_id, rated_matches_played, wins, losses, current_winning_streak, best_winning_streak, current_beat_expected_streak, best_beat_expected_streak, bars_active_balance, bars_total_earned')
    .gte('rated_matches_played', minMatches);

  if (!allStats?.length) return [];

  const playerIds = allStats.map((s) => s.player_id);

  // For current_rating metric: get from player_profiles
  let ratingByPlayer: Record<string, number> = {};
  if (config.metric_key === 'current_rating') {
    const { data: profiles } = await service
      .from('player_profiles')
      .select('id, current_rating')
      .in('id', playerIds);
    for (const p of profiles ?? []) ratingByPlayer[p.id] = p.current_rating;
  }

  // For rating gain: compute from rating_events in window
  let ratingGainByPlayer: Record<string, number> = {};
  if (config.metric_key === 'rating_gain_total' && windowStart) {
    const { data: ratingEvents } = await service
      .from('rating_events')
      .select('player_id, rating_change')
      .in('player_id', playerIds)
      .eq('event_type', 'match_result')
      .gte('created_at', windowStart.toISOString())
      .gt('rating_change', 0);  // only positive gains
    for (const e of ratingEvents ?? []) {
      ratingGainByPlayer[e.player_id] = (ratingGainByPlayer[e.player_id] ?? 0) + e.rating_change;
    }
  }

  // Visibility overrides
  const { data: overrides } = await service
    .from('leaderboard_visibility_overrides')
    .select('player_id')
    .eq('entity_type', 'player')
    .eq('is_hidden', true)
    .or(`leaderboard_config_id.eq.${config.id},leaderboard_config_id.is.null`);
  const hiddenPlayerIds = new Set((overrides ?? []).map((o) => o.player_id).filter(Boolean));

  return allStats
    .filter((s) => !hiddenPlayerIds.has(s.player_id))
    .map((s) => {
      const value = getPlayerMetricValue(s as PlayerStatsRow, config.metric_key, ratingByPlayer, ratingGainByPlayer);
      return { entity_id: s.player_id, metric_value: value };
    })
    .filter((e) => e.metric_value > 0 || config.metric_key === 'current_rating')
    .sort((a, b) => b.metric_value - a.metric_value);
}

// ── Build team entries ────────────────────────────────────────

async function buildTeamEntries(
  service: ReturnType<typeof createServiceClient>,
  config: LeaderboardConfig,
): Promise<Array<{ entity_id: string; metric_value: number }>> {
  const { data: allStats } = await service
    .from('team_stats')
    .select('team_id, rated_matches, wins, losses, current_win_streak, best_win_streak')
    .gte('rated_matches', config.min_rated_matches);

  if (!allStats?.length) return [];

  const teamIds = allStats.map((s) => s.team_id);

  // current_team_rating comes from teams table
  let ratingByTeam: Record<string, number> = {};
  if (config.metric_key === 'current_team_rating' || config.metric_key === 'team_performance_score') {
    const { data: teams } = await service
      .from('teams')
      .select('id, cached_current_team_rating')
      .in('id', teamIds);
    for (const t of teams ?? []) ratingByTeam[t.id] = t.cached_current_team_rating ?? 500;
  }

  const { data: overrides } = await service
    .from('leaderboard_visibility_overrides')
    .select('team_id')
    .eq('entity_type', 'team')
    .eq('is_hidden', true)
    .or(`leaderboard_config_id.eq.${config.id},leaderboard_config_id.is.null`);
  const hiddenTeamIds = new Set((overrides ?? []).map((o) => o.team_id).filter(Boolean));

  return allStats
    .filter((s) => !hiddenTeamIds.has(s.team_id))
    .map((s) => {
      const value = getTeamMetricValue(s as TeamStatsRow, config.metric_key, ratingByTeam);
      return { entity_id: s.team_id, metric_value: value };
    })
    .sort((a, b) => b.metric_value - a.metric_value);
}

// ── Metric calculators ────────────────────────────────────────

function getPlayerMetricValue(
  stats: PlayerStatsRow,
  metricKey: string,
  ratingByPlayer: Record<string, number>,
  ratingGainByPlayer: Record<string, number>,
): number {
  switch (metricKey) {
    case 'current_rating':                      return ratingByPlayer[stats.player_id] ?? 0;
    case 'rating_gain_total':                   return ratingGainByPlayer[stats.player_id] ?? 0;
    case 'current_winning_streak':              return stats.current_winning_streak;
    case 'best_winning_streak':                 return stats.best_winning_streak;
    case 'current_beat_expected_streak':        return stats.current_beat_expected_streak;
    case 'best_beat_expected_streak':           return stats.best_beat_expected_streak;
    case 'rated_match_activity':                return stats.rated_matches_played;
    case 'bars_active_balance':                 return stats.bars_active_balance;
    case 'bars_total_earned_including_locked':  return stats.bars_total_earned;
    default:                                    return 0;
  }
}

function getTeamMetricValue(
  stats: TeamStatsRow,
  metricKey: string,
  ratingByTeam: Record<string, number>,
): number {
  const winRate = stats.rated_matches > 0 ? stats.wins / stats.rated_matches : 0;
  const rating = ratingByTeam[stats.team_id] ?? 500;
  switch (metricKey) {
    case 'current_team_rating':         return rating;
    case 'team_performance_score':      return rating * 0.6 + winRate * 100 * 0.4;
    case 'win_rate':                    return winRate * 100;
    case 'current_winning_streak':      return stats.current_win_streak;
    default:                            return 0;
  }
}

// ── Time window helper ────────────────────────────────────────

function getWindowStart(window: string, now: Date): Date | null {
  switch (window) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'weekly': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'monthly': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    default:
      return null;
  }
}
