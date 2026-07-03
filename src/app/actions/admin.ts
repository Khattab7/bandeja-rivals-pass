'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const meta = user.app_metadata as { role?: string } | null;
  if (meta?.role !== 'admin') throw new Error('Not admin');
  return user;
}

// ── Players ──────────────────────────────────────────────────

export async function adminGetPlayers(search?: string) {
  await assertAdmin();
  const service = createServiceClient();
  let q = service
    .from('player_profiles')
    .select('id, first_name, last_name, display_name, username, city, current_rating, is_suspended, is_banned, onboarding_completed, match_ready, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,display_name.ilike.%${search}%,username.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return { players: [], error: error.message };
  return { players: data ?? [] };
}

export async function adminSuspendPlayer(playerId: string, suspended: boolean, reason?: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from('player_profiles')
    .update({ is_suspended: suspended, suspension_reason: suspended ? (reason ?? null) : null })
    .eq('id', playerId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function adminBanPlayer(playerId: string, banned: boolean, reason?: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from('player_profiles')
    .update({ is_banned: banned, banned_reason: banned ? (reason ?? null) : null })
    .eq('id', playerId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function adminSetPlayerRating(playerId: string, newRating: number, reason: string) {
  await assertAdmin();
  const service = createServiceClient();

  const { data: profile } = await service.from('player_profiles').select('current_rating').eq('id', playerId).single();
  if (!profile) return { success: false, error: 'Player not found' };

  const change = newRating - profile.current_rating;

  await service.from('player_profiles').update({ current_rating: newRating }).eq('id', playerId);
  await service.from('rating_events').insert({
    player_id: playerId,
    event_type: 'admin_correction',
    rating_before: profile.current_rating,
    rating_change: change,
    rating_after: newRating,
    visible_to_player: false,
    algorithm_version: 'admin_override',
    notes: reason,
  } as never);

  return { success: true };
}

// ── Matches ──────────────────────────────────────────────────

export async function adminGetMatches(statusFilter?: string) {
  await assertAdmin();
  const service = createServiceClient();
  let q = service
    .from('matches')
    .select('id, match_type, status, city, area, scheduled_date, created_at, team_a_id, team_b_id, source_type')
    .order('created_at', { ascending: false })
    .limit(100);
  if (statusFilter && statusFilter !== 'all') q = q.eq('status', statusFilter as never);
  const { data: matches, error } = await q;
  if (error) return { matches: [], error: error.message };

  const teamIds = [...new Set([...(matches ?? []).map((m) => m.team_a_id), ...(matches ?? []).map((m) => m.team_b_id)])];
  const { data: teams } = teamIds.length > 0
    ? await service.from('teams').select('id, name, auto_name').in('id', teamIds)
    : { data: [] };
  const teamNameById: Record<string, string> = {};
  for (const t of teams ?? []) teamNameById[t.id] = t.name ?? t.auto_name ?? 'Unknown';

  return {
    matches: (matches ?? []).map((m) => ({
      ...m,
      team_a_name: teamNameById[m.team_a_id] ?? '—',
      team_b_name: teamNameById[m.team_b_id] ?? '—',
    })),
  };
}

export async function adminVoidMatch(matchId: string, reason: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { error } = await service.from('matches').update({ status: 'voided' }).eq('id', matchId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── App Settings ─────────────────────────────────────────────

export async function adminGetSettings() {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service.from('app_settings').select('key, value, description').order('key');
  if (error) return { settings: [], error: error.message };
  return { settings: data ?? [] };
}

export async function adminUpdateSetting(key: string, value: string) {
  await assertAdmin();
  const service = createServiceClient();
  let jsonValue: unknown;
  try { jsonValue = JSON.parse(value); } catch { jsonValue = value; }
  const { error } = await service
    .from('app_settings')
    .update({ value: jsonValue })
    .eq('key', key);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Bars ─────────────────────────────────────────────────────

export async function adminGetBarsLedger(search?: string) {
  await assertAdmin();
  const service = createServiceClient();

  let playerIds: string[] = [];
  if (search) {
    const { data: profiles } = await service
      .from('player_profiles')
      .select('id')
      .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,display_name.ilike.%${search}%,username.ilike.%${search}%`)
      .limit(20);
    playerIds = (profiles ?? []).map((p) => p.id);
    if (playerIds.length === 0) return { entries: [] };
  }

  let q = service
    .from('bars_ledger')
    .select('id, player_id, amount, status, source_type, was_paid_at_submission, locked_reason, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (playerIds.length > 0) q = q.in('player_id', playerIds);

  const { data: entries, error } = await q;
  if (error) return { entries: [], error: error.message };

  const pidSet = [...new Set((entries ?? []).map((e) => e.player_id))];
  const { data: profiles } = pidSet.length > 0
    ? await service.from('player_profiles').select('id, first_name, last_name, display_name, username').in('id', pidSet)
    : { data: [] };
  const nameById: Record<string, string> = {};
  for (const p of profiles ?? []) nameById[p.id] = (p.display_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) || p.username || 'Player';

  return {
    entries: (entries ?? []).map((e) => ({ ...e, player_name: nameById[e.player_id] ?? '—' })),
  };
}

export async function adminAdjustBars(playerId: string, amount: number, reason: string) {
  await assertAdmin();
  if (!reason.trim()) return { success: false, error: 'Reason is required' };
  const service = createServiceClient();

  const { error } = await service.from('bars_ledger').insert({
    player_id: playerId,
    amount: Math.abs(amount),
    status: amount >= 0 ? 'active' : 'reversed',
    source_type: amount >= 0 ? 'admin_adjustment' : 'admin_reversal',
    was_paid_at_submission: true,
    locked_reason: amount < 0 ? reason : null,
  });

  if (error) return { success: false, error: error.message };

  // Update cached balance in player_stats
  const delta = amount;
  try { await service.rpc('increment_bars_balance' as never, { p_player_id: playerId, p_delta: delta } as never); } catch { /* RPC may not exist */ }
  // Fallback: recalculate from ledger
  const { data: active } = await service
    .from('bars_ledger')
    .select('amount')
    .eq('player_id', playerId)
    .eq('status', 'active');
  const newBalance = (active ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  await service.from('player_stats').update({ bars_active_balance: newBalance }).eq('player_id', playerId);

  return { success: true };
}

// ── Quest Admin Builder ───────────────────────────────────────

export async function adminGetQuestTemplates() {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from('quest_templates')
    .select('id, name, quest_type, difficulty, access_level, status, objective_json, is_repeating, repeat_frequency, created_at')
    .order('created_at', { ascending: false });
  if (error) return { templates: [], error: error.message };
  return { templates: data ?? [] };
}

export async function adminCreateQuestTemplate(input: {
  name: string;
  description: string;
  quest_type: string;
  difficulty: string;
  access_level: string;
  objective_target: number;
  is_repeating: boolean;
  repeat_frequency?: string;
}) {
  await assertAdmin();
  const service = createServiceClient();

  const requiresApproval = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'QUEST_REQUIRES_APPROVAL_BEFORE_GO_LIVE')
    .single();
  const needsApproval = String(requiresApproval.data?.value) === 'true';

  const { data, error } = await service.from('quest_templates').insert({
    name: input.name,
    description: input.description,
    quest_type: input.quest_type,
    difficulty: input.difficulty,
    access_level: input.access_level,
    status: needsApproval ? 'draft' : 'approved',
    objective_json: { target: input.objective_target, quest_type: input.quest_type },
    is_repeating: input.is_repeating,
    repeat_frequency: input.repeat_frequency ?? null,
    created_by: null,
  } as never).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function adminApproveQuestTemplate(templateId: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { error } = await service.from('quest_templates').update({ status: 'approved' }).eq('id', templateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function adminGetQuestInstances() {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from('quest_instances')
    .select('id, name, description, status, starts_at, ends_at, reward_budget_total, reward_budget_used, max_completions, completions_count, template_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { instances: [], error: error.message };
  return { instances: data ?? [] };
}

export async function adminCreateQuestInstance(input: {
  templateId: string;
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  reward_amount: number;
  reward_budget_total: number;
  max_completions: number | null;
}) {
  await assertAdmin();
  const service = createServiceClient();

  const { data: instance, error } = await service.from('quest_instances').insert({
    template_id: input.templateId,
    name: input.name,
    description: input.description,
    status: 'live',
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    reward_budget_total: input.reward_budget_total,
    reward_budget_used: 0,
    max_completions: input.max_completions,
    completions_count: 0,
    created_by: null,
  }).select('id').single();

  if (error) return { success: false, error: error.message };

  // Create associated reward
  await service.from('quest_rewards').insert({
    quest_instance_id: instance.id,
    reward_type: 'bars',
    reward_amount: input.reward_amount,
  });

  return { success: true, id: instance.id };
}

export async function adminEndQuestInstance(instanceId: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { error } = await service.from('quest_instances').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', instanceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Global rating adjustment ──────────────────────────────────

export async function adminPreviewGlobalAdjustment(amount: number) {
  await assertAdmin();
  const service = createServiceClient();
  const { count } = await service.from('player_profiles').select('id', { count: 'exact', head: true }).eq('is_banned', false);
  return { affectedCount: count ?? 0 };
}

export async function adminApplyGlobalAdjustment(amount: number, reason: string) {
  await assertAdmin();
  if (!reason.trim()) return { success: false, error: 'Reason required' };
  const service = createServiceClient();

  const { data: players } = await service.from('player_profiles').select('id, current_rating').eq('is_banned', false);
  if (!players?.length) return { success: false, error: 'No players found' };

  const events = players.map((p) => ({
    player_id: p.id,
    event_type: 'global_adjustment',
    rating_before: p.current_rating,
    rating_change: amount,
    rating_after: p.current_rating + amount,
    visible_to_player: true,
    algorithm_version: 'global_adjustment',
    notes: reason,
  }));

  for (let i = 0; i < players.length; i += 50) {
    await service.from('player_profiles').upsert(
      players.slice(i, i + 50).map((p) => ({ id: p.id, current_rating: p.current_rating + amount })) as never[]
    );
    await service.from('rating_events').insert(events.slice(i, i + 50) as never[]);
  }

  try {
    await service.from('global_rating_adjustments' as never).insert({
      adjustment_amount: amount,
      affected_players_count: players.length,
      reason,
      notification_message: `BANDEJA has applied a global rating adjustment of ${amount > 0 ? '+' : ''}${amount} points.`,
    } as never);
  } catch { /* table may not exist yet */ }

  return { success: true, affected: players.length };
}
