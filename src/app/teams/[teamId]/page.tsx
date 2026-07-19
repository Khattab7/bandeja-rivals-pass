import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import TeamDetailClient from './TeamDetailClient';
import type { Database } from '@/lib/types';

type TeamRow = Database['public']['Tables']['teams']['Row'];
type PlayerProfile = Database['public']['Tables']['player_profiles']['Row'];

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, first_name, last_name, current_rating, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Verify this player is a member of the team
  const { data: myMembership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('player_id', profile.id)
    .single();

  if (!myMembership) notFound();

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (!team) notFound();

  // Get all members
  const { data: memberRows } = await supabase
    .from('team_members')
    .select('player_id, role, joined_at')
    .eq('team_id', teamId);

  const memberIds = (memberRows ?? []).map((m) => m.player_id);
  const { data: memberProfiles } = memberIds.length > 0
    ? await supabase
        .from('player_profiles')
        .select('id, first_name, last_name, current_rating, city, primary_area, avatar_url')
        .in('id', memberIds)
    : { data: [] };

  const profileById: Record<string, Pick<PlayerProfile, 'id' | 'first_name' | 'last_name' | 'current_rating' | 'city' | 'primary_area' | 'avatar_url'>> = {};
  for (const p of memberProfiles ?? []) profileById[p.id] = p;

  const members = (memberRows ?? []).map((m) => ({
    ...m,
    profile: profileById[m.player_id] ?? null,
  }));

  // Get team stats
  const { data: stats } = await supabase
    .from('team_stats')
    .select('*')
    .eq('team_id', teamId)
    .single();

  // Get pending invitation (if team waiting for partner)
  const { data: pendingInvite } = await supabase
    .from('team_invitations')
    .select('id, invitee_email, invitee_phone, invitee_player_id, message, created_at')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get invitee profile if registered
  let inviteeProfile: Pick<PlayerProfile, 'id' | 'first_name' | 'last_name'> | null = null;
  if (pendingInvite?.invitee_player_id) {
    const { data } = await supabase
      .from('player_profiles')
      .select('id, first_name, last_name')
      .eq('id', pendingInvite.invitee_player_id)
      .single();
    inviteeProfile = data;
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center gap-4 px-5 py-4 pt-safe-header border-b border-white/10">
        <a href="/teams" className="text-white/40 text-sm hover:text-white/70 transition-colors">←</a>
        <BandejaLogo width={100} height={25} />
      </header>

      <TeamDetailClient
        team={team as TeamRow}
        myPlayerId={profile.id}
        myRole={myMembership.role}
        members={members}
        stats={stats ?? null}
        pendingInvite={pendingInvite ? { ...pendingInvite, inviteeProfile } : null}
      />

      <BottomNav />
    </div>
  );
}
