'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function generatePublicId(prefix: string): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${year}-${suffix}`;
}

export interface CreateTeamResult {
  team_id?: string;
  error?: string;
}

export async function createTeam(data: { name?: string }): Promise<CreateTeamResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, first_name')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const public_team_id = generatePublicId('BRT');

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert({
      public_team_id,
      name: data.name?.trim() || null,
      captain_player_id: profile.id,
      created_by: profile.id,
      status: 'pending_partner_acceptance',
    })
    .select('id')
    .single();

  if (teamErr) return { error: teamErr.message };

  const { error: memberErr } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, player_id: profile.id, role: 'captain' });

  if (memberErr) return { error: memberErr.message };

  return { team_id: team.id };
}

export interface InvitePartnerData {
  team_id: string;
  invitee_player_id?: string;
  invitee_email?: string;
  invitee_phone?: string;
  message?: string;
}

export interface InvitePartnerResult {
  invitation_id?: string;
  error?: string;
}

export async function invitePartner(data: InvitePartnerData): Promise<InvitePartnerResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  // Verify inviter is the captain of this team
  const { data: team } = await supabase
    .from('teams')
    .select('id, captain_player_id, status')
    .eq('id', data.team_id)
    .single();

  if (!team) return { error: 'Team not found.' };
  if (team.captain_player_id !== profile.id) return { error: 'Only the team captain can invite partners.' };
  if (team.status === 'active') return { error: 'Team already has 2 members.' };

  // Cancel any existing pending invitations from this team
  await supabase
    .from('team_invitations')
    .update({ status: 'cancelled' })
    .eq('team_id', data.team_id)
    .eq('status', 'pending');

  const { data: invitation, error: inviteErr } = await supabase
    .from('team_invitations')
    .insert({
      team_id: data.team_id,
      inviter_player_id: profile.id,
      invitee_player_id: data.invitee_player_id ?? null,
      invitee_email: data.invitee_email?.trim().toLowerCase() ?? null,
      invitee_phone: data.invitee_phone?.trim() ?? null,
      message: data.message?.trim() ?? null,
    })
    .select('id')
    .single();

  if (inviteErr) return { error: inviteErr.message };
  return { invitation_id: invitation.id };
}

export interface AcceptInvitationResult {
  team_id?: string;
  error?: string;
}

export async function acceptInvitation(invitation_id: string): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const { data: invite } = await supabase
    .from('team_invitations')
    .select('id, team_id, invitee_player_id, status')
    .eq('id', invitation_id)
    .single();

  if (!invite) return { error: 'Invitation not found.' };
  if (invite.status !== 'pending') return { error: 'Invitation is no longer pending.' };
  if (invite.invitee_player_id && invite.invitee_player_id !== profile.id) {
    return { error: 'This invitation is not for you.' };
  }

  const { error: memberErr } = await supabase
    .from('team_members')
    .insert({ team_id: invite.team_id, player_id: profile.id, role: 'member' });

  if (memberErr) return { error: memberErr.message };

  await supabase
    .from('team_invitations')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', invitation_id);

  return { team_id: invite.team_id };
}

export async function cancelInvitation(invitation_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const { error } = await supabase
    .from('team_invitations')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', invitation_id)
    .eq('inviter_player_id', profile.id)
    .eq('status', 'pending');

  if (error) return { error: error.message };
  return {};
}

export async function rejectInvitation(invitation_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const { error } = await supabase
    .from('team_invitations')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', invitation_id)
    .eq('invitee_player_id', profile.id)
    .eq('status', 'pending');

  if (error) return { error: error.message };
  return {};
}

export async function leaveTeam(team_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  // Verify membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', team_id)
    .eq('player_id', profile.id)
    .single();
  if (!membership) return { error: 'You are not a member of this team.' };

  // Remove from team
  const { error: removeErr } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', team_id)
    .eq('player_id', profile.id);
  if (removeErr) return { error: removeErr.message };

  // Archive the team
  await supabase
    .from('teams')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', team_id);

  // Cancel any pending invitations from this team
  await supabase
    .from('team_invitations')
    .update({ status: 'cancelled' })
    .eq('team_id', team_id)
    .eq('status', 'pending');

  return {};
}

export async function archiveTeam(team_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { error: 'Player profile not found.' };

  const { data: team } = await supabase
    .from('teams')
    .select('captain_player_id')
    .eq('id', team_id)
    .single();
  if (!team) return { error: 'Team not found.' };
  if (team.captain_player_id !== profile.id) return { error: 'Only the captain can archive the team.' };

  const { error } = await supabase
    .from('teams')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', team_id);
  if (error) return { error: error.message };

  await supabase
    .from('team_invitations')
    .update({ status: 'cancelled' })
    .eq('team_id', team_id)
    .eq('status', 'pending');

  return {};
}

export interface SearchPlayersResult {
  players: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    current_rating: number;
  }>;
  error?: string;
}

export async function searchPlayers(query: string): Promise<SearchPlayersResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const q = query.trim();
  if (q.length < 2) return { players: [] };

  const { data, error } = await supabase
    .from('player_profiles')
    .select('id, first_name, last_name, city, current_rating')
    .neq('id', myProfile?.id ?? '')
    .eq('onboarding_completed', true)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(10);

  if (error) return { players: [], error: error.message };
  return { players: data ?? [] };
}
