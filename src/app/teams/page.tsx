import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import TeamsPendingInvites from './TeamsPendingInvites';
import type { Database } from '@/lib/types';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type TeamRow = Database['public']['Tables']['teams']['Row'];
type TeamStats = Database['public']['Tables']['team_stats']['Row'];
type TeamInvitation = Database['public']['Tables']['team_invitations']['Row'];
type PlayerProfile = Database['public']['Tables']['player_profiles']['Row'];

interface TeamWithStats extends TeamRow { team_stats: TeamStats | null; my_role: 'captain' | 'member'; }
interface InviteWithContext extends TeamInvitation {
  team: TeamRow | null;
  inviter: Pick<PlayerProfile, 'first_name' | 'last_name' | 'current_rating'> | null;
}

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, first_name, current_rating, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Get team IDs and roles the player is in
  const { data: memberRows } = await supabase
    .from('team_members')
    .select('role, team_id')
    .eq('player_id', profile.id);

  const teamIds = (memberRows ?? []).map((m) => m.team_id);
  const roleByTeam: Record<string, 'captain' | 'member'> = {};
  for (const m of memberRows ?? []) roleByTeam[m.team_id] = m.role;

  // Get teams
  const { data: teamsData } = teamIds.length > 0
    ? await supabase
        .from('teams')
        .select('*')
        .in('id', teamIds)
        .not('status', 'in', '("archived","deleted")')
        .order('created_at', { ascending: false })
    : { data: [] };

  // Get team stats
  const { data: statsData } = teamIds.length > 0
    ? await supabase.from('team_stats').select('*').in('team_id', teamIds)
    : { data: [] };
  const statsByTeam: Record<string, TeamStats> = {};
  for (const s of statsData ?? []) statsByTeam[s.team_id] = s;

  const teams: TeamWithStats[] = (teamsData ?? []).map((t) => ({
    ...t,
    team_stats: statsByTeam[t.id] ?? null,
    my_role: roleByTeam[t.id] ?? 'member',
  }));

  // Get pending invitations for this player
  const { data: rawInvites } = await supabase
    .from('team_invitations')
    .select('*')
    .eq('invitee_player_id', profile.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const inviteTeamIds = (rawInvites ?? []).map((i) => i.team_id).filter(Boolean);
  const inviterIds = (rawInvites ?? []).map((i) => i.inviter_player_id).filter(Boolean);

  const { data: inviteTeams } = inviteTeamIds.length > 0
    ? await supabase.from('teams').select('*').in('id', inviteTeamIds)
    : { data: [] };
  const { data: inviters } = inviterIds.length > 0
    ? await supabase.from('player_profiles').select('id, first_name, last_name, current_rating').in('id', inviterIds)
    : { data: [] };

  const inviteTeamById: Record<string, TeamRow> = {};
  for (const t of inviteTeams ?? []) inviteTeamById[t.id] = t;
  const inviterById: Record<string, Pick<PlayerProfile, 'first_name' | 'last_name' | 'current_rating'>> = {};
  for (const p of inviters ?? []) inviterById[p.id] = p;

  const pendingInvites: InviteWithContext[] = (rawInvites ?? []).map((inv) => ({
    ...inv,
    team: inviteTeamById[inv.team_id] ?? null,
    inviter: inviterById[inv.inviter_player_id] ?? null,
  }));

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Teams</span>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">

        {pendingInvites.length > 0 && (
          <TeamsPendingInvites invites={pendingInvites} />
        )}

        <section>
          <p className="text-brand-green text-[10px] tracking-[0.3em] uppercase border-b border-brand-green/30 pb-1 mb-4" style={G}>
            My Teams
          </p>

          {teams.length === 0 ? (
            <div className="border border-white/10 p-6 text-center space-y-3">
              <p className="text-white/40 text-sm" style={I}>You&apos;re not on any team yet.</p>
              <p className="text-white/30 text-xs" style={I}>
                Form a team with a partner to start playing rated matches.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} profileId={profile.id} />
              ))}
            </div>
          )}
        </section>

        <Link
          href="/teams/new"
          className="flex items-center justify-center gap-2 w-full border border-brand-green/40 text-brand-green py-4 text-sm tracking-widest uppercase hover:bg-brand-green/5 transition-colors"
          style={G}
        >
          + Create New Team
        </Link>

      </main>

      <BottomNav />
    </div>
  );
}

function TeamCard({ team, profileId }: { team: TeamWithStats; profileId: string }) {
  const stats = team.team_stats;
  const isActive = team.status === 'active';
  const isCaptain = team.captain_player_id === profileId;

  return (
    <Link href={`/teams/${team.id}`}>
      <div className="border border-white/10 p-4 hover:border-white/20 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white text-sm tracking-wide uppercase truncate" style={G}>
                {team.name || team.auto_name || 'Unnamed Team'}
              </span>
              {isCaptain && (
                <span className="text-[9px] text-brand-green/70 tracking-widest uppercase border border-brand-green/30 px-1.5 py-0.5 shrink-0" style={G}>C</span>
              )}
            </div>
            <p className="text-white/30 text-[10px] tracking-widest" style={G}>
              {team.public_team_id}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-brand-green text-lg font-bold leading-none" style={G}>
              {team.cached_current_team_rating ?? '—'}
            </div>
            <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          {isActive ? (
            <>
              {stats && (
                <span className="text-white/40 text-xs" style={I}>
                  {stats.wins}W {stats.losses}L
                </span>
              )}
              {stats?.cached_recent_form && (
                <div className="flex gap-0.5">
                  {stats.cached_recent_form.split('').slice(0, 5).map((c, i) => (
                    <span key={i} className="w-4 h-4 text-[8px] flex items-center justify-center font-bold"
                      style={{ color: c === 'W' ? '#8CF702' : '#ef4444' }}>
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span className="text-yellow-400/60 text-[10px] tracking-widest uppercase" style={G}>
              {team.status === 'pending_partner_acceptance' ? 'Waiting for partner' : team.status}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
