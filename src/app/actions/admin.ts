'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendNotification } from '@/lib/notifications';

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

// ── Announcements ─────────────────────────────────────────────

export type AnnouncementAudience = 'all' | 'paid' | 'free' | 'city' | 'specific';

export async function adminSearchPlayersForAnnouncement(query: string) {
  await assertAdmin();
  if (!query.trim()) return { players: [] };
  const service = createServiceClient();
  const q = query.trim();

  // Search by name / username
  const { data: byName } = await service
    .from('player_profiles')
    .select('id, user_id, first_name, last_name, display_name, username')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%,username.ilike.%${q}%`)
    .eq('onboarding_completed', true)
    .limit(10);

  // Search by phone via members table
  const { data: byPhone } = await service
    .from('members')
    .select('id, phone, name')
    .ilike('phone', `%${q}%`)
    .limit(10);

  let byPhonePlayers: typeof byName = [];
  if (byPhone?.length) {
    const memberIds = byPhone.map((m) => m.id);
    const { data } = await service
      .from('player_profiles')
      .select('id, user_id, first_name, last_name, display_name, username')
      .in('member_id', memberIds)
      .eq('onboarding_completed', true);
    byPhonePlayers = data ?? [];
  }

  // Merge and deduplicate by player id
  const seen = new Set<string>();
  const merged = [...(byName ?? []), ...byPhonePlayers].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return {
    players: merged.map((p) => ({
      player_id: p.id,
      user_id: p.user_id,
      display_name: (p.display_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) || p.username || 'Player',
    })),
  };
}

async function resolveAudienceUserIds(
  audience: AnnouncementAudience,
  city?: string,
  specificPlayerIds?: string[],
): Promise<Array<{ user_id: string; player_id: string }>> {
  const service = createServiceClient();

  if (audience === 'specific') {
    if (!specificPlayerIds?.length) return [];
    const { data } = await service
      .from('player_profiles')
      .select('id, user_id')
      .in('id', specificPlayerIds);
    return (data ?? []).map((p) => ({ user_id: p.user_id, player_id: p.id }));
  }

  if (audience === 'paid') {
    // Players with an active member record
    const { data } = await service
      .from('player_profiles')
      .select('id, user_id, member_id')
      .eq('onboarding_completed', true)
      .not('member_id', 'is', null);
    const memberIds = (data ?? []).map((p) => p.member_id).filter(Boolean) as string[];
    if (!memberIds.length) return [];
    const { data: activeMembers } = await service
      .from('members')
      .select('id')
      .in('id', memberIds)
      .eq('is_active', true);
    const activeMemberIds = new Set((activeMembers ?? []).map((m) => m.id));
    return (data ?? [])
      .filter((p) => p.member_id && activeMemberIds.has(p.member_id))
      .map((p) => ({ user_id: p.user_id, player_id: p.id }));
  }

  if (audience === 'free') {
    const { data } = await service
      .from('player_profiles')
      .select('id, user_id, member_id')
      .eq('onboarding_completed', true);
    const memberIds = (data ?? []).filter((p) => p.member_id).map((p) => p.member_id) as string[];
    let activeMemberIds = new Set<string>();
    if (memberIds.length) {
      const { data: activeMembers } = await service
        .from('members').select('id').in('id', memberIds).eq('is_active', true);
      activeMemberIds = new Set((activeMembers ?? []).map((m) => m.id));
    }
    return (data ?? [])
      .filter((p) => !p.member_id || !activeMemberIds.has(p.member_id))
      .map((p) => ({ user_id: p.user_id, player_id: p.id }));
  }

  if (audience === 'city' && city) {
    const { data } = await service
      .from('player_profiles')
      .select('id, user_id')
      .eq('onboarding_completed', true)
      .ilike('city', city);
    return (data ?? []).map((p) => ({ user_id: p.user_id, player_id: p.id }));
  }

  // 'all'
  const { data } = await service
    .from('player_profiles')
    .select('id, user_id')
    .eq('onboarding_completed', true);
  return (data ?? []).map((p) => ({ user_id: p.user_id, player_id: p.id }));
}

export async function adminPreviewAnnouncement(audience: AnnouncementAudience, city?: string, specificPlayerIds?: string[]) {
  await assertAdmin();
  const recipients = await resolveAudienceUserIds(audience, city, specificPlayerIds);
  return { count: recipients.length };
}

export async function adminSendAnnouncement(params: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  city?: string;
  specificPlayerIds?: string[];
}) {
  const user = await assertAdmin();
  const { title, body, audience, city, specificPlayerIds } = params;
  if (!title.trim() || !body.trim()) return { success: false, error: 'Title and body are required.' };

  const service = createServiceClient();
  const recipients = await resolveAudienceUserIds(audience, city, specificPlayerIds);

  const targetFilters: Record<string, unknown> = { audience };
  if (city) targetFilters.city = city;
  if (specificPlayerIds?.length) targetFilters.player_ids = specificPlayerIds;

  // Insert announcement record
  const { data: ann, error: annErr } = await service
    .from('admin_announcements')
    .insert({
      title: title.trim(),
      body: body.trim(),
      target_filters_json: targetFilters,
      channels: ['in_app'],
      status: 'sent',
      sent_at: new Date().toISOString(),
      audience_count: recipients.length,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (annErr) return { success: false, error: annErr.message };

  // Fan out in-app notifications (batched to avoid timeout on large audiences)
  let sent = 0;
  for (const r of recipients) {
    try {
      await sendNotification({
        type_key: 'admin_announcement',
        category: 'admin_announcement',
        priority: 'normal',
        recipient_user_id: r.user_id,
        recipient_player_id: r.player_id,
        title: title.trim(),
        body: body.trim(),
        related_entity_type: 'admin_announcement',
        related_entity_id: ann.id,
      });
      sent++;
    } catch { /* continue on individual failure */ }
  }

  return { success: true, sent, total: recipients.length };
}

export async function adminGetAnnouncementStats(announcementId: string) {
  await assertAdmin();
  const service = createServiceClient();

  const { data: notifs } = await service
    .from('notifications')
    .select('id, is_read')
    .eq('related_entity_id', announcementId)
    .eq('related_entity_type', 'admin_announcement');

  const total = notifs?.length ?? 0;
  const inAppRead = notifs?.filter((n) => n.is_read).length ?? 0;
  const notifIds = notifs?.map((n) => n.id) ?? [];

  if (notifIds.length === 0) return { total: 0, inAppRead: 0, pushDelivered: 0, pushTapped: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deliveries } = await (service as any)
    .from('notification_deliveries')
    .select('status, clicked_at')
    .in('notification_id', notifIds)
    .eq('channel', 'browser_push');

  const pushDelivered = (deliveries as { status: string; clicked_at: string | null }[] | null)
    ?.filter((d) => d.status === 'delivered').length ?? 0;
  const pushTapped = (deliveries as { status: string; clicked_at: string | null }[] | null)
    ?.filter((d) => d.clicked_at !== null).length ?? 0;

  return { total, inAppRead, pushDelivered, pushTapped };
}

export async function adminTestPush(): Promise<{
  vapidConfigured: boolean;
  missingVars: string[];
  subscriptionCount: number;
  results: { endpoint: string; status: 'sent' | 'failed'; error?: string; statusCode?: number }[];
}> {
  const user = await assertAdmin();
  const service = createServiceClient();

  const contact = process.env.VAPID_CONTACT?.trim() ?? '';
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? '';
  const priv = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';

  const missingVars: string[] = [];
  if (!contact) missingVars.push('VAPID_CONTACT');
  if (!pub) missingVars.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  if (!priv) missingVars.push('VAPID_PRIVATE_KEY');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (service as any)
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id);

  const subscriptionCount = (subs as unknown[])?.length ?? 0;

  if (missingVars.length > 0 || subscriptionCount === 0) {
    return { vapidConfigured: missingVars.length === 0, missingVars, subscriptionCount, results: [] };
  }

  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(contact, pub, priv);

  type Sub = { endpoint: string; p256dh: string; auth: string };
  const results = await Promise.all((subs as Sub[]).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'BANDEJA', body: 'Push test — working!', tag: 'push-test', url: '/admin' }),
      );
      return { endpoint: sub.endpoint.slice(-30), status: 'sent' as const };
    } catch (err: unknown) {
      const e = err as { message?: string; statusCode?: number };
      return { endpoint: sub.endpoint.slice(-30), status: 'failed' as const, error: e.message, statusCode: e.statusCode };
    }
  }));

  return { vapidConfigured: true, missingVars: [], subscriptionCount, results };
}

export async function adminGetAnnouncements() {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from('admin_announcements')
    .select('id, title, body, target_filters_json, status, sent_at, audience_count, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return { announcements: [], error: error.message };
  return { announcements: data ?? [] };
}
