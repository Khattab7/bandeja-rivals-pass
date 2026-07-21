'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ratingDifferenceToSteps, matchLabel } from '@/lib/bandeja-rating';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────

export type TileAccessStatus =
  | 'available'
  | 'locked_paid'
  | 'locked_invitation'
  | 'locked_eligibility'
  | 'admin_testing';

export interface EligibilityRule {
  id: string;
  rule_key: string;
  rule_mode: 'mandatory' | 'notify_only' | 'not_used';
  operator: string | null;
  rule_value_json: unknown;
  priority: number;
}

export interface RankingRule {
  id: string;
  signal_key: string;
  weight: number;
  priority: number;
  direction: 'asc' | 'desc';
}

export interface ExploreTileCard {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  access_level: string;
  status: string;
  position_order: number;
  is_featured: boolean;
  is_sponsored: boolean;
  sponsor_name: string | null;
  sponsored_label: string | null;
  background_color: string;
  icon_key: string | null;
  max_visible_candidates: number | null;
  max_challenges_per_team: number | null;
  // Evaluated access
  access_status: TileAccessStatus;
  locked_reason: string | null;
  warn_messages: string[];
  eligibility_rules: EligibilityRule[];
  ranking_rules: RankingRule[];
  schedule: { starts_at: string | null; ends_at: string | null; timezone: string } | null;
  is_ready_tonight_tile: boolean;
}

export interface ExploreCandidate {
  team_id: string;
  team_name: string;
  team_rating: number;
  home_city: string | null;
  home_area: string | null;
  wins: number;
  losses: number;
  cached_recent_form: string | null;
  steps: number;
  label: string;
  is_ready: boolean;
  ranking_score: number;
}

// ── Helper: get current player + verify team membership ───────

async function getPlayerAndTeam(teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, member_id')
    .eq('user_id', user.id)
    .single();
  if (!profile) throw new Error('Profile not found');

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('player_id', profile.id)
    .single();
  if (!membership) throw new Error('Not a member of this team');

  const { data: myTeam } = await supabase
    .from('teams')
    .select('id, cached_current_team_rating, home_city, home_area, status')
    .eq('id', teamId)
    .single();
  if (!myTeam || myTeam.status !== 'active') throw new Error('Team not active');

  // Check paid membership
  let isPaidMember = false;
  if (profile.member_id) {
    const { data: member } = await supabase
      .from('members')
      .select('is_active, valid_until')
      .eq('id', profile.member_id)
      .single();
    isPaidMember = !!(member?.is_active && member.valid_until && new Date(member.valid_until) > new Date());
  }

  return { supabase, user, profile, myTeam, membership, isPaidMember };
}

// ── getExploreHome ────────────────────────────────────────────

export async function getExploreHome(teamId: string): Promise<{
  tiles: ExploreTileCard[];
  myTeamRating: number;
  isReadyTonight: boolean;
  error?: string;
}> {
  try {
    const { supabase, profile, myTeam, isPaidMember } = await getPlayerAndTeam(teamId);
    const myTeamRating = myTeam.cached_current_team_rating ?? 500;

    // Check + auto-expire ready status
    const { data: readyRow } = await supabase
      .from('team_ready_statuses')
      .select('id, expires_at')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .maybeSingle();

    let isReadyTonight = false;
    if (readyRow) {
      if (new Date(readyRow.expires_at) > new Date()) {
        isReadyTonight = true;
      } else {
        await supabase
          .from('team_ready_statuses')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', readyRow.id);
      }
    }

    // Team member genders (for gender-rule evaluation)
    const { data: teamMemberRows } = await supabase
      .from('team_members')
      .select('player_id')
      .eq('team_id', teamId);
    const memberIds = (teamMemberRows ?? []).map(m => m.player_id);

    const { data: memberProfiles } = memberIds.length > 0
      ? await supabase.from('player_profiles').select('id, gender').in('id', memberIds)
      : { data: [] };
    const genders = (memberProfiles ?? []).map(p => p.gender);

    // Teams we've played (for match_history rules)
    const { data: playedMatches } = await supabase
      .from('matches')
      .select('team_a_id, team_b_id')
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .not('status', 'in', '("voided","cancelled")');

    const playedTeamIds = new Set<string>();
    for (const m of playedMatches ?? []) {
      if (m.team_a_id !== teamId) playedTeamIds.add(m.team_a_id);
      if (m.team_b_id !== teamId) playedTeamIds.add(m.team_b_id);
    }

    // Load live/scheduled tiles
    const { data: tilesData } = await supabase
      .from('explore_tiles')
      .select('*')
      .in('status', ['live', 'scheduled'])
      .order('is_featured', { ascending: false })
      .order('position_order', { ascending: true });

    if (!tilesData || tilesData.length === 0) {
      return { tiles: [], myTeamRating, isReadyTonight };
    }

    const tileIds = tilesData.map(t => t.id);

    // Load rules, schedules, invitations
    const [eligRes, rankRes, schedRes, invRes] = await Promise.all([
      supabase.from('explore_tile_eligibility_rules').select('*').in('explore_tile_id', tileIds).eq('is_active', true),
      supabase.from('explore_tile_ranking_rules').select('*').in('explore_tile_id', tileIds).eq('is_active', true).order('priority'),
      supabase.from('explore_tile_schedules').select('*').in('explore_tile_id', tileIds),
      supabase.from('explore_tile_invitations').select('explore_tile_id, invited_team_id, invited_player_id, status, expires_at').in('explore_tile_id', tileIds).eq('status', 'active'),
    ]);

    const rulesByTile = new Map<string, typeof eligRes.data>();
    const rankingByTile = new Map<string, typeof rankRes.data>();
    type ScheduleRow = NonNullable<typeof schedRes.data>[0];
    const scheduleByTile = new Map<string, ScheduleRow>();
    const invitedTiles = new Set<string>();

    for (const r of eligRes.data ?? []) {
      if (!rulesByTile.has(r.explore_tile_id)) rulesByTile.set(r.explore_tile_id, []);
      rulesByTile.get(r.explore_tile_id)!.push(r);
    }
    for (const r of rankRes.data ?? []) {
      if (!rankingByTile.has(r.explore_tile_id)) rankingByTile.set(r.explore_tile_id, []);
      rankingByTile.get(r.explore_tile_id)!.push(r);
    }
    for (const s of schedRes.data ?? []) scheduleByTile.set(s.explore_tile_id, s);
    for (const inv of invRes.data ?? []) {
      const notExpired = !inv.expires_at || new Date(inv.expires_at) > new Date();
      if (!notExpired) continue;
      if (inv.invited_team_id === teamId || (inv.invited_player_id && memberIds.includes(inv.invited_player_id))) {
        invitedTiles.add(inv.explore_tile_id);
      }
    }

    const tiles: ExploreTileCard[] = tilesData.map(tile => {
      const rules = rulesByTile.get(tile.id) ?? [];
      const ranking = rankingByTile.get(tile.id) ?? [];
      const sched = scheduleByTile.get(tile.id) ?? null;
      const hasInvite = invitedTiles.has(tile.id);

      const isReadyTonightTile =
        rules.some(r => r.rule_key === 'ready_tonight') ||
        ranking.some(r => r.signal_key === 'ready_tonight');

      let accessStatus: TileAccessStatus = 'available';
      let lockedReason: string | null = null;
      const warnMessages: string[] = [];

      // Step 1: access_level gate
      if (tile.access_level === 'admin_testing_only') {
        accessStatus = 'admin_testing';
        lockedReason = 'Admin testing only.';
      } else if (
        (tile.access_level === 'paid_members_only' || tile.access_level === 'free_locked_preview') &&
        !isPaidMember
      ) {
        accessStatus = 'locked_paid';
        lockedReason = 'Upgrade to RIVAL to unlock.';
      } else if (tile.access_level === 'invitation_only' && !hasInvite) {
        accessStatus = 'locked_invitation';
        lockedReason = 'Invitation required.';
      }

      // Step 2: mandatory eligibility rules (only if access not already blocked)
      if (accessStatus === 'available') {
        for (const rule of rules.filter(r => r.rule_mode === 'mandatory')) {
          const val = rule.rule_value_json;
          if (rule.rule_key === 'my_rating_min' && typeof val === 'number') {
            if (myTeamRating < val) {
              accessStatus = 'locked_eligibility';
              lockedReason = `Your team's rating must be at least ${val} to enter.`;
              break;
            }
          }
          if (rule.rule_key === 'my_rating_max' && typeof val === 'number') {
            if (myTeamRating > val) {
              accessStatus = 'locked_eligibility';
              lockedReason = `Your team's rating must be ${val} or below to enter.`;
              break;
            }
          }
          if (rule.rule_key === 'gender_rule' && typeof val === 'string') {
            const allFemale = genders.every(g => g === 'female');
            const allMale = genders.every(g => g === 'male');
            const hasFemale = genders.some(g => g === 'female');
            const hasMale = genders.some(g => g === 'male');
            if (val === 'women_only' && !allFemale) {
              accessStatus = 'locked_eligibility';
              lockedReason = 'Both players must identify as female to enter.';
              break;
            }
            if (val === 'men_only' && !allMale) {
              accessStatus = 'locked_eligibility';
              lockedReason = 'Both players must identify as male to enter.';
              break;
            }
            if (val === 'mixed_required' && !(hasFemale && hasMale)) {
              accessStatus = 'locked_eligibility';
              lockedReason = 'Your team must have one male and one female player.';
              break;
            }
          }
          if (rule.rule_key === 'match_history' && val === 'rematches_only' && playedTeamIds.size === 0) {
            accessStatus = 'locked_eligibility';
            lockedReason = 'You need at least one completed match to access Rematches.';
            break;
          }
          if (rule.rule_key === 'paid_membership' && !isPaidMember) {
            accessStatus = 'locked_paid';
            lockedReason = 'Upgrade to RIVAL to unlock.';
            break;
          }
        }
      }

      // Step 3: notify-only rules (warnings)
      if (accessStatus === 'available') {
        for (const rule of rules.filter(r => r.rule_mode === 'notify_only')) {
          const val = rule.rule_value_json;
          if (rule.rule_key === 'city' && typeof val === 'string' && myTeam.home_city !== val) {
            warnMessages.push(`This tile focuses on ${val}. You can still enter, but most teams may prefer that area.`);
          }
        }
      }

      return {
        id: tile.id,
        title: tile.title,
        subtitle: tile.subtitle,
        description: tile.description,
        cover_image_url: tile.image_url ?? null,
        access_level: tile.access_level,
        status: tile.status,
        position_order: tile.position_order,
        is_featured: tile.is_featured,
        is_sponsored: tile.is_sponsored,
        sponsor_name: tile.sponsor_name,
        sponsored_label: tile.sponsored_label,
        background_color: tile.background_color ?? '#111111',
        icon_key: tile.icon_key,
        max_visible_candidates: tile.max_visible_candidates,
        max_challenges_per_team: tile.max_challenges_per_team,
        access_status: accessStatus,
        locked_reason: lockedReason,
        warn_messages: warnMessages,
        eligibility_rules: rules.map(r => ({
          id: r.id,
          rule_key: r.rule_key,
          rule_mode: r.rule_mode as 'mandatory' | 'notify_only' | 'not_used',
          operator: r.operator,
          rule_value_json: r.rule_value_json,
          priority: r.priority,
        })),
        ranking_rules: ranking.map(r => ({
          id: r.id,
          signal_key: r.signal_key,
          weight: Number(r.weight),
          priority: r.priority,
          direction: (r.direction ?? 'desc') as 'asc' | 'desc',
        })),
        schedule: sched ? { starts_at: sched.starts_at, ends_at: sched.ends_at, timezone: sched.timezone } : null,
        is_ready_tonight_tile: isReadyTonightTile,
      };
    });

    return { tiles, myTeamRating, isReadyTonight };
  } catch (e) {
    return { tiles: [], myTeamRating: 500, isReadyTonight: false, error: (e as Error).message };
  }
}

// ── startExploreSession ───────────────────────────────────────

export async function startExploreSession(
  tileId: string,
  teamId: string,
  configSnapshot: object,
): Promise<{ sessionId: string | null; error?: string }> {
  try {
    const { supabase, user } = await getPlayerAndTeam(teamId);
    const hash = crypto.createHash('sha256').update(JSON.stringify(configSnapshot)).digest('hex').slice(0, 16);
    const { data, error } = await supabase
      .from('explore_sessions')
      .insert({
        explore_tile_id: tileId,
        opened_by_user_id: user.id,
        selected_team_id: teamId,
        configuration_snapshot_json: configSnapshot as Record<string, unknown>,
        configuration_hash: hash,
      })
      .select('id')
      .single();
    if (error) return { sessionId: null, error: error.message };
    return { sessionId: data.id };
  } catch (e) {
    return { sessionId: null, error: (e as Error).message };
  }
}

// ── getExploreCandidates ──────────────────────────────────────

export async function getExploreCandidates(
  tileId: string,
  teamId: string,
  eligibilityRules: EligibilityRule[],
  rankingRules: RankingRule[],
  maxCandidates: number | null,
): Promise<{ candidates: ExploreCandidate[]; error?: string }> {
  try {
    const { supabase, myTeam } = await getPlayerAndTeam(teamId);
    const myRating = myTeam.cached_current_team_rating ?? 500;

    // Blocks/hides (same as normal discovery)
    const { data: myBlocks } = await supabase.from('team_blocks').select('blocked_team_id').eq('blocker_team_id', teamId);
    const { data: blockedBy } = await supabase.from('team_blocks').select('blocker_team_id').eq('blocked_team_id', teamId);
    const { data: myHides } = await supabase.from('discovery_hides').select('target_team_id').eq('actor_team_id', teamId);
    const { data: myTeams } = await supabase.from('team_members').select('team_id').eq(
      'player_id',
      (await supabase.from('player_profiles').select('id').eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '').single()).data?.id ?? ''
    );

    const excludedIds = new Set<string>([
      teamId,
      ...(myBlocks ?? []).map(b => b.blocked_team_id),
      ...(blockedBy ?? []).map(b => b.blocker_team_id),
      ...(myHides ?? []).map(h => h.target_team_id),
      ...(myTeams ?? []).map(t => t.team_id),
    ]);

    // Parse eligibility rules for candidate filtering
    const ratingMin = eligibilityRules.find(r => r.rule_key === 'rating_min' && r.rule_mode === 'mandatory')?.rule_value_json as number | undefined;
    const ratingMax = eligibilityRules.find(r => r.rule_key === 'rating_max' && r.rule_mode === 'mandatory')?.rule_value_json as number | undefined;
    const historyRule = eligibilityRules.find(r => r.rule_key === 'match_history' && r.rule_mode === 'mandatory')?.rule_value_json as string | undefined;
    const genderRule = eligibilityRules.find(r => r.rule_key === 'gender_rule' && r.rule_mode === 'mandatory')?.rule_value_json as string | undefined;
    const requireReady = eligibilityRules.some(r => r.rule_key === 'ready_tonight' && r.rule_mode === 'mandatory');

    // Match history for new_rivals / rematches_only
    let playedTeamIds = new Set<string>();
    if (historyRule) {
      const { data: played } = await supabase
        .from('matches')
        .select('team_a_id, team_b_id')
        .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
        .not('status', 'in', '("voided","cancelled")');
      for (const m of played ?? []) {
        if (m.team_a_id !== teamId) playedTeamIds.add(m.team_a_id);
        if (m.team_b_id !== teamId) playedTeamIds.add(m.team_b_id);
      }
    }

    // Ready teams (if needed)
    let readyTeamIds = new Set<string>();
    const needsReadyData = requireReady || rankingRules.some(r => r.signal_key === 'ready_tonight');
    if (needsReadyData) {
      const { data: readyRows } = await supabase
        .from('team_ready_statuses')
        .select('team_id, expires_at')
        .eq('status', 'active');
      for (const r of readyRows ?? []) {
        if (new Date(r.expires_at) > new Date()) readyTeamIds.add(r.team_id);
      }
    }

    // Build query for candidate teams
    let q = supabase
      .from('teams')
      .select('id, name, auto_name, cached_current_team_rating, home_city, home_area')
      .eq('status', 'active')
      .eq('is_discoverable', true)
      .not('cached_current_team_rating', 'is', null);

    if (excludedIds.size > 0) q = q.not('id', 'in', `(${[...excludedIds].join(',')})`);
    if (ratingMin !== undefined) q = q.gte('cached_current_team_rating', ratingMin);
    if (ratingMax !== undefined) q = q.lte('cached_current_team_rating', ratingMax);

    const { data: candidatesRaw } = await q.limit(200);

    // Apply history and ready filters
    let candidates = (candidatesRaw ?? []).filter(t => {
      if (historyRule === 'new_rivals' && playedTeamIds.has(t.id)) return false;
      if (historyRule === 'rematches_only' && !playedTeamIds.has(t.id)) return false;
      if (requireReady && !readyTeamIds.has(t.id)) return false;
      return true;
    });

    // Apply gender filter (requires fetching member genders per candidate)
    if (genderRule && genderRule !== 'any') {
      const candIds = candidates.map(c => c.id);
      const { data: candMembers } = candIds.length > 0
        ? await supabase.from('team_members').select('team_id, player_id').in('team_id', candIds)
        : { data: [] };
      const candPlayerIds = [...new Set((candMembers ?? []).map(m => m.player_id))];
      const { data: candProfiles } = candPlayerIds.length > 0
        ? await supabase.from('player_profiles').select('id, gender').in('id', candPlayerIds)
        : { data: [] };
      const genderByPlayer = new Map((candProfiles ?? []).map(p => [p.id, p.gender]));
      const membersByTeam = new Map<string, string[]>();
      for (const m of candMembers ?? []) {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
        membersByTeam.get(m.team_id)!.push(m.player_id);
      }
      candidates = candidates.filter(t => {
        const playerIds = membersByTeam.get(t.id) ?? [];
        const tGenders = playerIds.map(pid => genderByPlayer.get(pid) ?? null);
        if (genderRule === 'women_only') return tGenders.every(g => g === 'female');
        if (genderRule === 'men_only') return tGenders.every(g => g === 'male');
        if (genderRule === 'mixed_required') return tGenders.some(g => g === 'female') && tGenders.some(g => g === 'male');
        return true;
      });
    }

    // Load stats
    const finalCandIds = candidates.map(c => c.id);
    const { data: statsRows } = finalCandIds.length > 0
      ? await supabase.from('team_stats').select('team_id, wins, losses, cached_recent_form').in('team_id', finalCandIds)
      : { data: [] };
    const statsByTeam = new Map((statsRows ?? []).map(s => [s.team_id, s]));

    // Score and rank candidates
    const scored: ExploreCandidate[] = candidates.map(t => {
      const theirRating = t.cached_current_team_rating ?? 500;
      const diff = myRating - theirRating;
      const steps = ratingDifferenceToSteps(diff);
      const myTeamIsFavorite = steps === 0 ? null : diff > 0;
      const stats = statsByTeam.get(t.id);
      const isReady = readyTeamIds.has(t.id);

      let score = 0;
      for (const rule of rankingRules.sort((a, b) => a.priority - b.priority)) {
        const w = rule.weight;
        switch (rule.signal_key) {
          case 'rating_balance':
            score += w * Math.max(0, 1 - Math.abs(theirRating - myRating) / 500);
            break;
          case 'higher_rated_opponents':
            score += w * (theirRating / 1500);
            break;
          case 'lower_rated_opponents':
            score += w * (1 - theirRating / 1500);
            break;
          case 'same_area':
            if (t.home_city && t.home_city === myTeam.home_city) score += w;
            break;
          case 'ready_tonight':
            if (isReady) score += w;
            break;
          case 'never_played':
            if (!playedTeamIds.has(t.id)) score += w;
            break;
        }
      }

      return {
        team_id: t.id,
        team_name: t.name ?? t.auto_name ?? 'Unnamed',
        team_rating: theirRating,
        home_city: t.home_city,
        home_area: t.home_area,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        cached_recent_form: stats?.cached_recent_form ?? null,
        steps,
        label: matchLabel(steps, myTeamIsFavorite),
        is_ready: isReady,
        ranking_score: score,
      };
    });

    scored.sort((a, b) => b.ranking_score - a.ranking_score);

    const limit = maxCandidates ?? 50;
    return { candidates: scored.slice(0, limit) };
  } catch (e) {
    return { candidates: [], error: (e as Error).message };
  }
}

// ── recordExploreAction ───────────────────────────────────────

type ExploreActionType = 'impression' | 'open' | 'candidate_view' | 'pass' | 'save' | 'view_profile' | 'preview_match' | 'challenge' | 'mark_ready_tonight' | 'upgrade_click' | 'exit';

export async function recordExploreAction(
  sessionId: string,
  tileId: string,
  teamId: string,
  actionType: ExploreActionType,
  candidateTeamId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('explore_actions').insert({
      explore_session_id: sessionId,
      explore_tile_id: tileId,
      selected_team_id: teamId,
      candidate_team_id: candidateTeamId ?? null,
      action_type: actionType,
      metadata: metadata ?? null,
    });
  } catch { /* non-critical */ }
}

// ── sendChallengeFromExplore ──────────────────────────────────

export async function sendChallengeFromExplore(params: {
  sessionId: string;
  tileId: string;
  challengingTeamId: string;
  challengedTeamId: string;
  matchType: 'friendly' | 'rivals_rated';
  proposedDatetime?: string;
  city?: string;
  area?: string;
  message?: string;
}): Promise<{ challengeId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found.' };

  // Reuse existing challenge logic
  const { sendChallenge } = await import('@/app/actions/challenges');
  const result = await sendChallenge({
    challenging_team_id: params.challengingTeamId,
    challenged_team_id: params.challengedTeamId,
    match_type: params.matchType,
    proposed_datetime: params.proposedDatetime,
    city: params.city,
    area: params.area,
    message: params.message,
  });

  if (result.error) return { error: result.error };

  // Record attribution
  try {
    await supabase.from('explore_source_attributions').insert({
      explore_tile_id: params.tileId,
      explore_session_id: params.sessionId,
      source_entity_type: 'challenge',
      source_entity_id: result.challenge_id!,
      configuration_hash: '',
    });
    await recordExploreAction(params.sessionId, params.tileId, params.challengingTeamId, 'challenge', params.challengedTeamId);
  } catch { /* non-critical */ }

  return { challengeId: result.challenge_id };
}

// ── markTeamReadyTonight ──────────────────────────────────────

export async function markTeamReadyTonight(
  teamId: string,
  durationHours: number = 4,
): Promise<{ error?: string }> {
  try {
    const { supabase, profile } = await getPlayerAndTeam(teamId);

    // Cancel any existing active status first
    await supabase
      .from('team_ready_statuses')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('status', 'active');

    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('team_ready_statuses').insert({
      team_id: teamId,
      readiness_type: 'ready_tonight',
      status: 'active',
      expires_at: expiresAt,
      activated_by_player_id: profile.id,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── cancelTeamReadyTonight ────────────────────────────────────

export async function cancelTeamReadyTonight(teamId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await getPlayerAndTeam(teamId);
    await supabase
      .from('team_ready_statuses')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('status', 'active');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Admin: assertAdmin helper ─────────────────────────────────

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const meta = user.app_metadata as { role?: string } | null;
  if (meta?.role !== 'admin') throw new Error('Not admin');
  return user;
}

// ── Admin: list tiles ─────────────────────────────────────────

export async function adminListExploreTiles(): Promise<{
  tiles: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    status: string;
    access_level: string;
    position_order: number;
    is_featured: boolean;
    is_sponsored: boolean;
    created_at: string;
    eligibility_rules: EligibilityRule[];
    ranking_rules: RankingRule[];
    schedule: { starts_at: string | null; ends_at: string | null; timezone: string } | null;
    max_visible_candidates: number | null;
    max_challenges_per_team: number | null;
    background_color: string;
    description: string | null;
    cover_image_url: string | null;
  }>;
  error?: string;
}> {
  try {
    await assertAdmin();
    const service = createServiceClient();

    const { data: tiles, error } = await service
      .from('explore_tiles')
      .select('*')
      .not('status', 'in', '("archived","cancelled")')
      .order('position_order', { ascending: true });

    if (error) return { tiles: [], error: error.message };
    if (!tiles || tiles.length === 0) return { tiles: [] };

    const tileIds = tiles.map(t => t.id);
    const [eligRes, rankRes, schedRes] = await Promise.all([
      service.from('explore_tile_eligibility_rules').select('*').in('explore_tile_id', tileIds).eq('is_active', true).order('priority'),
      service.from('explore_tile_ranking_rules').select('*').in('explore_tile_id', tileIds).eq('is_active', true).order('priority'),
      service.from('explore_tile_schedules').select('*').in('explore_tile_id', tileIds),
    ]);

    const eligByTile = new Map<string, EligibilityRule[]>();
    const rankByTile = new Map<string, RankingRule[]>();
    const schedByTile = new Map<string, { starts_at: string | null; ends_at: string | null; timezone: string }>();

    for (const r of eligRes.data ?? []) {
      if (!eligByTile.has(r.explore_tile_id)) eligByTile.set(r.explore_tile_id, []);
      eligByTile.get(r.explore_tile_id)!.push({ id: r.id, rule_key: r.rule_key, rule_mode: r.rule_mode as 'mandatory' | 'notify_only' | 'not_used', operator: r.operator, rule_value_json: r.rule_value_json, priority: r.priority });
    }
    for (const r of rankRes.data ?? []) {
      if (!rankByTile.has(r.explore_tile_id)) rankByTile.set(r.explore_tile_id, []);
      rankByTile.get(r.explore_tile_id)!.push({ id: r.id, signal_key: r.signal_key, weight: Number(r.weight), priority: r.priority, direction: (r.direction ?? 'desc') as 'asc' | 'desc' });
    }
    for (const s of schedRes.data ?? []) schedByTile.set(s.explore_tile_id, { starts_at: s.starts_at, ends_at: s.ends_at, timezone: s.timezone });

    return {
      tiles: tiles.map(t => ({
        id: t.id,
        title: t.title,
        subtitle: t.subtitle,
        status: t.status,
        access_level: t.access_level,
        position_order: t.position_order,
        is_featured: t.is_featured,
        is_sponsored: t.is_sponsored,
        created_at: t.created_at,
        eligibility_rules: eligByTile.get(t.id) ?? [],
        ranking_rules: rankByTile.get(t.id) ?? [],
        schedule: schedByTile.get(t.id) ?? null,
        max_visible_candidates: t.max_visible_candidates,
        max_challenges_per_team: t.max_challenges_per_team,
        background_color: t.background_color ?? '#111111',
        description: t.description,
        cover_image_url: t.image_url ?? null,
      })),
    };
  } catch (e) {
    return { tiles: [], error: (e as Error).message };
  }
}

// ── Admin: create tile ────────────────────────────────────────

export interface CreateExploreTileInput {
  title: string;
  subtitle?: string;
  description?: string;
  background_color?: string;
  access_level: string;
  position_order?: number;
  is_featured?: boolean;
  max_visible_candidates?: number | null;
  max_challenges_per_team?: number | null;
  eligibility_rules?: Array<{
    rule_key: string;
    rule_mode: 'mandatory' | 'notify_only';
    rule_value_json: unknown;
    priority?: number;
  }>;
  ranking_rules?: Array<{
    signal_key: string;
    weight?: number;
    priority: number;
  }>;
  schedule?: { starts_at?: string; ends_at?: string; timezone?: string };
}

export async function adminCreateExploreTile(
  input: CreateExploreTileInput,
): Promise<{ tileId?: string; error?: string }> {
  try {
    const user = await assertAdmin();
    const service = createServiceClient();

    const { data: tile, error } = await service
      .from('explore_tiles')
      .insert({
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        background_color: input.background_color ?? '#111111',
        access_level: input.access_level as 'everyone' | 'paid_members_only' | 'free_locked_preview' | 'admin_testing_only' | 'invitation_only',
        status: 'draft',
        position_order: input.position_order ?? 100,
        is_featured: input.is_featured ?? false,
        max_visible_candidates: input.max_visible_candidates ?? null,
        max_challenges_per_team: input.max_challenges_per_team ?? null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) return { error: error.message };
    const tileId = tile.id;

    // Insert eligibility rules
    if (input.eligibility_rules && input.eligibility_rules.length > 0) {
      await service.from('explore_tile_eligibility_rules').insert(
        input.eligibility_rules.map((r, i) => ({
          explore_tile_id: tileId,
          rule_key: r.rule_key,
          rule_mode: r.rule_mode,
          rule_value_json: r.rule_value_json,
          priority: r.priority ?? i,
        }))
      );
    }

    // Insert ranking rules
    if (input.ranking_rules && input.ranking_rules.length > 0) {
      await service.from('explore_tile_ranking_rules').insert(
        input.ranking_rules.map((r, i) => ({
          explore_tile_id: tileId,
          signal_key: r.signal_key,
          weight: r.weight ?? 1,
          priority: r.priority ?? i,
          direction: 'desc',
        }))
      );
    }

    // Insert schedule
    if (input.schedule) {
      await service.from('explore_tile_schedules').insert({
        explore_tile_id: tileId,
        starts_at: input.schedule.starts_at ?? null,
        ends_at: input.schedule.ends_at ?? null,
        timezone: input.schedule.timezone ?? 'Africa/Cairo',
      });
    }

    return { tileId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Admin: update tile status / fields ────────────────────────

export async function adminUpdateExploreTile(
  tileId: string,
  updates: {
    title?: string;
    subtitle?: string | null;
    description?: string | null;
    access_level?: string;
    status?: string;
    position_order?: number;
    is_featured?: boolean;
    max_visible_candidates?: number | null;
    max_challenges_per_team?: number | null;
    background_color?: string;
    image_url?: string | null;
  },
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
    const service = createServiceClient();
    const { access_level, status, ...rest } = updates;
    const { error } = await service
      .from('explore_tiles')
      .update({
        ...rest,
        updated_at: new Date().toISOString(),
        ...(access_level !== undefined && {
          access_level: access_level as 'everyone' | 'paid_members_only' | 'free_locked_preview' | 'admin_testing_only' | 'invitation_only',
        }),
        ...(status !== undefined && {
          status: status as 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'live' | 'paused' | 'ended' | 'archived' | 'cancelled',
        }),
      })
      .eq('id', tileId);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Admin: delete a rule ──────────────────────────────────────

export async function adminDeleteExploreTileRule(
  ruleId: string,
  type: 'eligibility' | 'ranking',
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
    const service = createServiceClient();
    const table = type === 'eligibility' ? 'explore_tile_eligibility_rules' : 'explore_tile_ranking_rules';
    const { error } = await service.from(table).delete().eq('id', ruleId);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Admin: add a rule ─────────────────────────────────────────

export async function adminAddExploreTileRule(
  tileId: string,
  type: 'eligibility' | 'ranking',
  rule: {
    rule_key?: string;
    rule_mode?: 'mandatory' | 'notify_only';
    rule_value_json?: unknown;
    signal_key?: string;
    weight?: number;
    priority?: number;
  },
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
    const service = createServiceClient();
    if (type === 'eligibility') {
      const { error } = await service.from('explore_tile_eligibility_rules').insert({
        explore_tile_id: tileId,
        rule_key: rule.rule_key ?? '',
        rule_mode: rule.rule_mode ?? 'mandatory',
        rule_value_json: rule.rule_value_json ?? null,
        priority: rule.priority ?? 0,
      });
      if (error) return { error: error.message };
    } else {
      const { error } = await service.from('explore_tile_ranking_rules').insert({
        explore_tile_id: tileId,
        signal_key: rule.signal_key ?? '',
        weight: rule.weight ?? 1,
        priority: rule.priority ?? 0,
        direction: 'desc',
      });
      if (error) return { error: error.message };
    }
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
