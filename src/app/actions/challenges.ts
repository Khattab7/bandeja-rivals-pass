'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { sendNotificationToMany, getTeamRecipients } from '@/lib/notifications';

export interface SendChallengeData {
  challenging_team_id: string;
  challenged_team_id: string;
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime?: string;
  city?: string;
  area?: string;
  message?: string;
}

export interface ChallengeResult {
  challenge_id?: string;
  error?: string;
}

export async function sendChallenge(data: SendChallengeData): Promise<ChallengeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  // Verify sender is on the challenging team
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', data.challenging_team_id)
    .eq('player_id', profile.id)
    .single();
  if (!membership) return { error: 'You are not a member of the challenging team.' };

  // Verify both teams are active
  const { data: challengingTeam } = await supabase
    .from('teams')
    .select('status')
    .eq('id', data.challenging_team_id)
    .single();
  if (challengingTeam?.status !== 'active') return { error: 'Your team must be active to send challenges.' };

  const { data: challengedTeam } = await supabase
    .from('teams')
    .select('status, is_discoverable')
    .eq('id', data.challenged_team_id)
    .single();
  if (challengedTeam?.status !== 'active') return { error: 'The challenged team is not active.' };

  // Check for existing pending challenge between same teams (either direction)
  const { data: existing } = await supabase
    .from('team_challenges')
    .select('id')
    .or(`and(challenging_team_id.eq.${data.challenging_team_id},challenged_team_id.eq.${data.challenged_team_id}),and(challenging_team_id.eq.${data.challenged_team_id},challenged_team_id.eq.${data.challenging_team_id})`)
    .in('status', ['pending', 'countered'])
    .limit(1)
    .maybeSingle();

  if (existing) return { error: 'There is already a pending challenge between these teams.' };

  // Get expiration from settings
  const { data: expirySetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'TEAM_CHALLENGE_EXPIRATION_HOURS')
    .single();
  const expiryHours = expirySetting ? Number(expirySetting.value) : 72;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const { data: challenge, error } = await supabase
    .from('team_challenges')
    .insert({
      challenging_team_id: data.challenging_team_id,
      challenged_team_id: data.challenged_team_id,
      sender_player_id: profile.id,
      match_type: data.match_type,
      proposed_datetime: data.proposed_datetime ?? null,
      city: data.city ?? null,
      area: data.area ?? null,
      message: data.message ?? null,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Notify challenged team: challenge received
  try {
    const challengedRecipients = await getTeamRecipients(data.challenged_team_id);
    const { data: challengingTeamName } = await supabase
      .from('teams')
      .select('name, auto_name')
      .eq('id', data.challenging_team_id)
      .single();
    const teamName = challengingTeamName?.name ?? challengingTeamName?.auto_name ?? 'A team';
    await sendNotificationToMany(challengedRecipients, {
      type_key: 'challenge_received',
      category: 'challenge',
      priority: 'high',
      title: 'Challenge Received',
      body: `${teamName} challenged your team to a ${data.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'} match.`,
      related_entity_type: 'challenge',
      related_entity_id: challenge.id,
      is_pinned: true,
      pinned_until_action: true,
      actions: [{
        action_key: 'view_challenge',
        action_label: 'View Challenge',
        action_url: '/matches',
        requires_extra_confirmation: true,
      }],
    });
  } catch (_) {}

  return { challenge_id: challenge.id };
}

export async function respondToChallenge(
  challenge_id: string,
  response: 'accepted' | 'rejected'
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const { data: challenge } = await supabase
    .from('team_challenges')
    .select('id, challenged_team_id, challenging_team_id, match_type, status, proposed_datetime, city, area, message')
    .eq('id', challenge_id)
    .single();
  if (!challenge) return { error: 'Challenge not found.' };
  if (challenge.status !== 'pending') return { error: 'Challenge is no longer pending.' };

  // Verify responder is on the challenged team
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', challenge.challenged_team_id)
    .eq('player_id', profile.id)
    .single();
  if (!membership) return { error: 'You are not a member of the challenged team.' };

  if (response === 'rejected') {
    await supabase
      .from('team_challenges')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', challenge_id);
    return {};
  }

  // Accept → create match
  // Copy scheduling info proposed by the challenger
  const hasSchedule = !!challenge.proposed_datetime;
  const scheduledDate = challenge.proposed_datetime
    ? new Date(challenge.proposed_datetime).toISOString().split('T')[0]
    : null;

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({
      match_type: challenge.match_type,
      status: hasSchedule ? 'scheduled' : 'scheduled_tbd',
      source_type: 'team_challenge',
      source_id: challenge_id,
      team_a_id: challenge.challenging_team_id,
      team_b_id: challenge.challenged_team_id,
      created_by: profile.id,
      city: challenge.city ?? null,
      area: challenge.area ?? null,
      scheduled_date: scheduledDate,
    })
    .select('id')
    .single();

  if (matchErr) return { error: matchErr.message };

  // Lock players into match_players
  const { data: teamAMembers } = await supabase
    .from('team_members')
    .select('player_id')
    .eq('team_id', challenge.challenging_team_id);

  const { data: teamBMembers } = await supabase
    .from('team_members')
    .select('player_id')
    .eq('team_id', challenge.challenged_team_id);

  // Get ratings for all 4 players
  const allPlayerIds = [
    ...(teamAMembers ?? []).map((m) => m.player_id),
    ...(teamBMembers ?? []).map((m) => m.player_id),
  ];
  const { data: playerRatings } = await supabase
    .from('player_profiles')
    .select('id, current_rating')
    .in('id', allPlayerIds);

  const ratingById: Record<string, number> = {};
  for (const p of playerRatings ?? []) ratingById[p.id] = p.current_rating;

  const matchPlayerRows = [
    ...(teamAMembers ?? []).map((m, i) => ({
      match_id: match.id,
      team_id: challenge.challenging_team_id,
      player_id: m.player_id,
      side: 'A' as const,
      slot: (i === 0 ? 'player_1' : 'player_2') as 'player_1' | 'player_2',
      player_rating_at_match_creation: ratingById[m.player_id] ?? 500,
    })),
    ...(teamBMembers ?? []).map((m, i) => ({
      match_id: match.id,
      team_id: challenge.challenged_team_id,
      player_id: m.player_id,
      side: 'B' as const,
      slot: (i === 0 ? 'player_1' : 'player_2') as 'player_1' | 'player_2',
      player_rating_at_match_creation: ratingById[m.player_id] ?? 500,
    })),
  ];

  await supabase.from('match_players').insert(matchPlayerRows);

  // Update challenge
  await supabase
    .from('team_challenges')
    .update({
      status: 'match_created',
      match_id: match.id,
      responded_at: new Date().toISOString(),
    })
    .eq('id', challenge_id);

  return {};
}

export interface DiscoveryCandidate {
  team_id: string;
  team_name: string;
  public_team_id: string | null;
  team_rating: number;
  wins: number;
  losses: number;
  cached_recent_form: string | null;
  home_city: string | null;
  home_area: string | null;
  // Expected score preview (computed client-side from my_team_rating)
  steps: number;
  // Match label
  label: string;
}

export async function getDiscoveryFeed(actor_team_id: string): Promise<{
  candidates: DiscoveryCandidate[];
  myTeamRating: number;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { candidates: [], myTeamRating: 500, error: 'Profile not found.' };

  // Verify actor team membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('player_id')
    .eq('team_id', actor_team_id)
    .eq('player_id', profile.id)
    .single();
  if (!membership) return { candidates: [], myTeamRating: 500, error: 'Not a member of this team.' };

  // Get my team rating
  const { data: myTeam } = await supabase
    .from('teams')
    .select('cached_current_team_rating, status')
    .eq('id', actor_team_id)
    .single();

  if (myTeam?.status !== 'active') {
    return { candidates: [], myTeamRating: 500, error: 'Your team must be active to browse.' };
  }
  const myTeamRating = myTeam.cached_current_team_rating ?? 500;

  // Get teams I've blocked or that blocked me
  const { data: myBlocks } = await supabase
    .from('team_blocks')
    .select('blocked_team_id')
    .eq('blocker_team_id', actor_team_id);
  const { data: blockedBy } = await supabase
    .from('team_blocks')
    .select('blocker_team_id')
    .eq('blocked_team_id', actor_team_id);

  // Get teams I've hidden
  const { data: myHides } = await supabase
    .from('discovery_hides')
    .select('target_team_id')
    .eq('actor_team_id', actor_team_id);

  const excludedIds = new Set<string>([
    actor_team_id,
    ...(myBlocks ?? []).map((b) => b.blocked_team_id),
    ...(blockedBy ?? []).map((b) => b.blocker_team_id),
    ...(myHides ?? []).map((h) => h.target_team_id),
  ]);

  // Get all teams the player is on (exclude all own teams)
  const { data: myTeams } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('player_id', profile.id);
  for (const t of myTeams ?? []) excludedIds.add(t.team_id);

  // Get active, discoverable teams sorted by rating proximity
  const { data: candidates, error } = await supabase
    .from('teams')
    .select('id, name, auto_name, public_team_id, cached_current_team_rating, home_city, home_area')
    .eq('status', 'active')
    .eq('is_discoverable', true)
    .not('id', 'in', `(${[...excludedIds].join(',')})`)
    .not('cached_current_team_rating', 'is', null)
    .order('cached_current_team_rating', { ascending: true })
    .limit(50);

  if (error) return { candidates: [], myTeamRating, error: error.message };

  // Get stats for candidates
  const candidateIds = (candidates ?? []).map((t) => t.id);
  const { data: statsRows } = candidateIds.length > 0
    ? await supabase
        .from('team_stats')
        .select('team_id, wins, losses, cached_recent_form')
        .in('team_id', candidateIds)
    : { data: [] };

  const statsByTeam: Record<string, { wins: number; losses: number; cached_recent_form: string | null }> = {};
  for (const s of statsRows ?? []) statsByTeam[s.team_id] = s;

  const { ratingDifferenceToSteps, matchLabel } = await import('@/lib/bandeja-rating');

  const result: DiscoveryCandidate[] = (candidates ?? []).map((t) => {
    const theirRating = t.cached_current_team_rating ?? 500;
    const diff = myTeamRating - theirRating;
    const steps = ratingDifferenceToSteps(diff);
    const myTeamIsFavorite = steps === 0 ? null : diff > 0;
    const stats = statsByTeam[t.id];

    return {
      team_id: t.id,
      team_name: t.name ?? t.auto_name ?? 'Unnamed Team',
      public_team_id: t.public_team_id,
      team_rating: theirRating,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      cached_recent_form: stats?.cached_recent_form ?? null,
      home_city: t.home_city,
      home_area: t.home_area,
      steps,
      label: matchLabel(steps, myTeamIsFavorite),
    };
  });

  // Sort by rating proximity (closest first)
  result.sort((a, b) => Math.abs(a.team_rating - myTeamRating) - Math.abs(b.team_rating - myTeamRating));

  return { candidates: result, myTeamRating };
}
