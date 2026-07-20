import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import DiscoveryFeed from './DiscoveryFeed';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type TeamRow = {
  id: string;
  name: string | null;
  auto_name: string | null;
  cached_current_team_rating: number | null;
  status: string;
  captain_player_id: string | null;
};

type ProfileWithTeams = {
  id: string;
  onboarding_completed: boolean;
  team_members: { role: string; teams: TeamRow | null }[];
};

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team: teamParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Single DB round trip: profile + all team memberships + team details joined.
  // Cast bypasses Supabase TS relationship validation (all tables have Relationships: []).
  const rawQuery = supabase
    .from('player_profiles')
    .select('id, onboarding_completed, team_members(role, teams(id, name, auto_name, cached_current_team_rating, status, captain_player_id))')
    .eq('user_id', user.id)
    .single();

  const { data: profileData } = await (rawQuery as unknown as Promise<{ data: ProfileWithTeams | null; error: unknown }>);

  if (!profileData?.onboarding_completed) redirect('/onboarding');

  const teams: TeamRow[] = (profileData.team_members ?? [])
    .map((m) => m.teams)
    .filter((t): t is TeamRow => t !== null && t.status === 'active');

  if (teams.length === 0) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
        <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
          <BandejaLogo width={120} height={30} />
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Play</span>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
          <div className="space-y-3">
            <p className="text-white text-xl tracking-widest uppercase" style={G}>Form a Team First</p>
            <p className="text-white/40 text-sm max-w-xs" style={I}>
              You need an active team with a partner to browse and challenge other teams.
            </p>
          </div>
          <Link
            href="/teams"
            className="border border-brand-green/40 text-brand-green px-6 py-3 text-sm tracking-widest uppercase hover:bg-brand-green/5 transition-colors"
            style={G}
          >
            Go to Teams →
          </Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  const selectedTeam = teams.find((t) => t.id === teamParam) ?? teams[0];

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Find a Match</span>
        </div>
      </header>

      <DiscoveryFeed
        teams={teams}
        selectedTeamId={selectedTeam.id}
        myPlayerId={profileData.id}
      />

      <BottomNav />
    </div>
  );
}
