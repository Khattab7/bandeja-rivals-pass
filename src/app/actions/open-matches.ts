'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendNotificationToMany, getTeamRecipients } from '@/lib/notifications';

// ── Types ────────────────────────────────────────────────────

export type OpenMatchCard = {
  id: string;
  public_open_id: string | null;
  team_id: string;
  team_name: string;
  team_rating: number;
  match_type: 'friendly' | 'rivals_rated';
  city: string;
  area: string | null;
  proposed_datetime: string;
  rating_min: number | null;
  rating_max: number | null;
  gender_preference: string | null;
  message: string | null;
  expires_at: string | null;
  my_application_status: string | null; // null = not applied
  my_application_id: string | null;
};

// ── Get open match feed for a team ───────────────────────────

export async function getOpenMatchFeed(teamId: string): Promise<{
  matches: OpenMatchCard[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { matches: [], error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { matches: [], error: 'Profile not found' };

  const now = new Date().toISOString();

  // Open matches from other teams, not expired, not filled/cancelled
  const { data: openMatches, error } = await supabase
    .from('open_matches')
    .select('id, public_open_id, team_id, match_type, city, area, proposed_datetime, rating_min, rating_max, gender_preference, message, expires_at, status')
    .eq('status', 'open')
    .neq('team_id', teamId)
    .gte('proposed_datetime', now)
    .order('proposed_datetime', { ascending: true })
    .limit(50);

  if (error) return { matches: [], error: error.message };
  if (!openMatches?.length) return { matches: [] };

  const teamIds = [...new Set(openMatches.map((m) => m.team_id))];
  const openMatchIds = openMatches.map((m) => m.id);

  // Load team names + ratings
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, auto_name, cached_current_team_rating')
    .in('id', teamIds);

  const teamById: Record<string, { name: string; rating: number }> = {};
  for (const t of teams ?? []) {
    teamById[t.id] = {
      name: t.name ?? t.auto_name ?? 'Unknown Team',
      rating: t.cached_current_team_rating ?? 500,
    };
  }

  // Load this team's applications
  const { data: myApps } = await supabase
    .from('open_match_applications')
    .select('id, open_match_id, status')
    .eq('applying_team_id', teamId)
    .in('open_match_id', openMatchIds);

  const appByMatch: Record<string, { id: string; status: string }> = {};
  for (const a of myApps ?? []) appByMatch[a.open_match_id] = { id: a.id, status: a.status };

  const matches: OpenMatchCard[] = openMatches.map((m) => ({
    id: m.id,
    public_open_id: m.public_open_id,
    team_id: m.team_id,
    team_name: teamById[m.team_id]?.name ?? 'Unknown Team',
    team_rating: teamById[m.team_id]?.rating ?? 500,
    match_type: m.match_type as 'friendly' | 'rivals_rated',
    city: m.city,
    area: m.area,
    proposed_datetime: m.proposed_datetime,
    rating_min: m.rating_min,
    rating_max: m.rating_max,
    gender_preference: m.gender_preference,
    message: m.message,
    expires_at: m.expires_at,
    my_application_status: appByMatch[m.id]?.status ?? null,
    my_application_id: appByMatch[m.id]?.id ?? null,
  }));

  return { matches };
}

// ── Create open match ─────────────────────────────────────────

export async function createOpenMatch(input: {
  teamId: string;
  match_type: 'friendly' | 'rivals_rated';
  city: string;
  area?: string;
  proposed_datetime: string;
  rating_min?: number;
  rating_max?: number;
  gender_preference?: string;
  message?: string;
  expires_at?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  // Verify caller is captain of the team
  const { data: team } = await supabase
    .from('teams')
    .select('id, captain_player_id, status')
    .eq('id', input.teamId)
    .single();

  if (!team) return { success: false, error: 'Team not found' };
  if (team.status !== 'active') return { success: false, error: 'Team is not active' };
  if (team.captain_player_id !== profile.id) return { success: false, error: 'Only the captain can create open matches' };

  // Generate public_open_id
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  const publicOpenId = `OM-${year}-${rand}`;

  const { data: created, error } = await supabase
    .from('open_matches')
    .insert({
      public_open_id: publicOpenId,
      team_id: input.teamId,
      created_by_player_id: profile.id,
      match_type: input.match_type,
      city: input.city,
      area: input.area ?? null,
      proposed_datetime: input.proposed_datetime,
      rating_min: input.rating_min ?? null,
      rating_max: input.rating_max ?? null,
      gender_preference: (input.gender_preference ?? null) as never,
      message: input.message ?? null,
      status: 'open',
      expires_at: input.expires_at ?? null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath('/play');
  return { success: true, id: created.id };
}

// ── Apply to open match ───────────────────────────────────────

export async function applyToOpenMatch(input: {
  openMatchId: string;
  teamId: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  // Confirm caller is on the applying team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('team_id', input.teamId)
    .eq('player_id', profile.id)
    .single();
  if (!membership) return { success: false, error: 'You are not on this team' };

  // Confirm open match is still open
  const { data: om } = await supabase
    .from('open_matches')
    .select('id, status, team_id, proposed_datetime')
    .eq('id', input.openMatchId)
    .single();
  if (!om) return { success: false, error: 'Open match not found' };
  if (om.status !== 'open') return { success: false, error: 'This open match is no longer available' };
  if (om.team_id === input.teamId) return { success: false, error: 'You cannot apply to your own open match' };

  const { error } = await supabase
    .from('open_match_applications')
    .insert({
      open_match_id: input.openMatchId,
      applying_team_id: input.teamId,
      applied_by_player_id: profile.id,
      message: input.message ?? null,
      status: 'pending',
    });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'You have already applied to this match' };
    return { success: false, error: error.message };
  }

  // Notify the open match creator team
  try {
    const recipients = await getTeamRecipients(om.team_id);
    await sendNotificationToMany(recipients, {
      type_key: 'open_match_application_received',
      category: 'match',
      title: 'New Match Application',
      body: 'A team has applied to your open match.',
      related_entity_type: 'open_match',
      related_entity_id: input.openMatchId,
      is_pinned: true,
      pinned_until_action: true,
    });
  } catch { /* non-blocking */ }

  revalidatePath('/play');
  return { success: true };
}

// ── Cancel my application ─────────────────────────────────────

export async function cancelOpenMatchApplication(applicationId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { error } = await supabase
    .from('open_match_applications')
    .update({ status: 'cancelled' })
    .eq('id', applicationId)
    .eq('applied_by_player_id', profile.id)
    .eq('status', 'pending');

  if (error) return { success: false, error: error.message };
  revalidatePath('/play');
  return { success: true };
}

// ── Get my open matches (captain view) ───────────────────────

export type MyOpenMatch = {
  id: string;
  public_open_id: string | null;
  match_type: 'friendly' | 'rivals_rated';
  city: string;
  area: string | null;
  proposed_datetime: string;
  rating_min: number | null;
  rating_max: number | null;
  message: string | null;
  status: string;
  expires_at: string | null;
  applications: Array<{
    id: string;
    applying_team_id: string;
    applying_team_name: string;
    applying_team_rating: number;
    message: string | null;
    status: string;
    created_at: string;
  }>;
};

export async function getMyOpenMatches(teamId: string): Promise<{ matches: MyOpenMatch[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { matches: [], error: 'Not authenticated' };

  const { data: openMatches, error } = await supabase
    .from('open_matches')
    .select('id, public_open_id, match_type, city, area, proposed_datetime, rating_min, rating_max, message, status, expires_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return { matches: [], error: error.message };
  if (!openMatches?.length) return { matches: [] };

  const matchIds = openMatches.map((m) => m.id);

  const { data: applications } = await supabase
    .from('open_match_applications')
    .select('id, open_match_id, applying_team_id, message, status, created_at')
    .in('open_match_id', matchIds)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  const applyingTeamIds = [...new Set((applications ?? []).map((a) => a.applying_team_id))];
  const { data: applyingTeams } = applyingTeamIds.length > 0
    ? await supabase
        .from('teams')
        .select('id, name, auto_name, cached_current_team_rating')
        .in('id', applyingTeamIds)
    : { data: [] };

  const teamById: Record<string, { name: string; rating: number }> = {};
  for (const t of applyingTeams ?? []) {
    teamById[t.id] = { name: t.name ?? t.auto_name ?? 'Unknown Team', rating: t.cached_current_team_rating ?? 500 };
  }

  const appsByMatch: Record<string, MyOpenMatch['applications']> = {};
  for (const a of applications ?? []) {
    if (!appsByMatch[a.open_match_id]) appsByMatch[a.open_match_id] = [];
    appsByMatch[a.open_match_id]!.push({
      id: a.id,
      applying_team_id: a.applying_team_id,
      applying_team_name: teamById[a.applying_team_id]?.name ?? 'Unknown',
      applying_team_rating: teamById[a.applying_team_id]?.rating ?? 500,
      message: a.message,
      status: a.status,
      created_at: a.created_at,
    });
  }

  const matches: MyOpenMatch[] = openMatches.map((m) => ({
    id: m.id,
    public_open_id: m.public_open_id,
    match_type: m.match_type as 'friendly' | 'rivals_rated',
    city: m.city,
    area: m.area,
    proposed_datetime: m.proposed_datetime,
    rating_min: m.rating_min,
    rating_max: m.rating_max,
    message: m.message,
    status: m.status,
    expires_at: m.expires_at,
    applications: appsByMatch[m.id] ?? [],
  }));

  return { matches };
}

// ── Accept application (captain only) ────────────────────────

export async function acceptOpenMatchApplication(applicationId: string): Promise<{ success: boolean; error?: string; matchId?: string }> {
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  // Load the application + open match
  const { data: app } = await service
    .from('open_match_applications')
    .select('id, open_match_id, applying_team_id, status')
    .eq('id', applicationId)
    .single();
  if (!app) return { success: false, error: 'Application not found' };
  if (app.status !== 'pending') return { success: false, error: 'Application is no longer pending' };

  const { data: om } = await service
    .from('open_matches')
    .select('id, team_id, match_type, city, area, proposed_datetime, status')
    .eq('id', app.open_match_id)
    .single();
  if (!om) return { success: false, error: 'Open match not found' };
  if (om.status !== 'open') return { success: false, error: 'Open match is no longer available' };

  // Verify caller is captain
  const { data: team } = await service
    .from('teams')
    .select('captain_player_id')
    .eq('id', om.team_id)
    .single();
  if (team?.captain_player_id !== profile.id) return { success: false, error: 'Only the captain can accept applications' };

  // Create the match
  const { data: match, error: matchErr } = await service
    .from('matches')
    .insert({
      match_type: om.match_type,
      status: 'scheduled',
      source_type: 'open_match',
      source_id: om.id,
      team_a_id: om.team_id,
      team_b_id: app.applying_team_id,
      city: om.city,
      area: om.area,
      scheduled_date: om.proposed_datetime ? new Date(om.proposed_datetime).toISOString().split('T')[0] : null,
      scheduled_time: om.proposed_datetime ? new Date(om.proposed_datetime).toISOString().split('T')[1]?.slice(0, 5) : null,
    })
    .select('id')
    .single();

  if (matchErr) return { success: false, error: matchErr.message };

  // Update open match to filled, store accepted team + match_id
  await service.from('open_matches').update({
    status: 'filled',
    accepted_team_id: app.applying_team_id,
    match_id: match.id,
  }).eq('id', om.id);

  // Accept the winning application
  await service.from('open_match_applications').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', applicationId);

  // Auto-reject all other pending applications
  await service.from('open_match_applications')
    .update({ status: 'auto_rejected', responded_at: new Date().toISOString() })
    .eq('open_match_id', om.id)
    .eq('status', 'pending')
    .neq('id', applicationId);

  // Notify accepted team
  try {
    const acceptedRecipients = await getTeamRecipients(app.applying_team_id);
    await sendNotificationToMany(acceptedRecipients, {
      type_key: 'open_match_application_accepted',
      category: 'match',
      title: 'Application Accepted!',
      body: 'Your open match application was accepted. A match has been created.',
      related_entity_type: 'match',
      related_entity_id: match.id,
    });
  } catch { /* non-blocking */ }

  revalidatePath('/play');
  revalidatePath('/matches');
  return { success: true, matchId: match.id };
}

// ── Cancel open match ────────────────────────────────────────

export async function cancelOpenMatch(openMatchId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  // Verify captain
  const { data: om } = await supabase
    .from('open_matches')
    .select('id, team_id, status')
    .eq('id', openMatchId)
    .single();
  if (!om) return { success: false, error: 'Not found' };
  if (!['open'].includes(om.status)) return { success: false, error: 'Cannot cancel a match that is not open' };

  const { data: team } = await supabase.from('teams').select('captain_player_id').eq('id', om.team_id).single();
  if (team?.captain_player_id !== profile.id) return { success: false, error: 'Only the captain can cancel this open match' };

  await supabase.from('open_matches').update({ status: 'cancelled' }).eq('id', openMatchId);
  revalidatePath('/play');
  return { success: true };
}
