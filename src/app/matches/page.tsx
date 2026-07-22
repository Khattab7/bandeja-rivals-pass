import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import MatchesTabs from './MatchesTabs';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };

type PlayerAvatar = { avatar_url: string | null; initials: string };

async function fetchTeamAvatars(
  service: ReturnType<typeof createServiceClient>,
  teamIds: string[]
): Promise<Map<string, PlayerAvatar[]>> {
  if (teamIds.length === 0) return new Map();
  const { data: memberRows } = await service
    .from('team_members').select('team_id, player_id').in('team_id', teamIds);
  const playerIds = [...new Set((memberRows ?? []).map((m: { player_id: string }) => m.player_id))];
  const { data: profiles } = playerIds.length > 0
    ? await service.from('player_profiles').select('id, first_name, last_name, avatar_url').in('id', playerIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }) => [p.id, p]));
  const map = new Map<string, PlayerAvatar[]>();
  for (const m of memberRows ?? []) {
    if (!map.has(m.team_id)) map.set(m.team_id, []);
    const p = profileById.get(m.player_id);
    const initials = [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
    map.get(m.team_id)!.push({ avatar_url: p?.avatar_url ?? null, initials });
  }
  return map;
}

export default async function MatchesPage() {
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // My teams
  const { data: myTeamMemberships } = await supabase
    .from('team_members').select('team_id').eq('player_id', profile.id);
  const myTeamIds = (myTeamMemberships ?? []).map((m: { team_id: string }) => m.team_id);

  // My match_players entries
  const { data: mySlots } = await supabase
    .from('match_players').select('match_id, side, team_id').eq('player_id', profile.id);
  const matchIds = (mySlots ?? []).map((s: { match_id: string }) => s.match_id);
  const slotByMatch: Record<string, { side: string; team_id: string }> = {};
  for (const s of mySlots ?? []) slotByMatch[s.match_id] = { side: s.side, team_id: s.team_id };

  type ChallengeRow = { id: string; challenging_team_id: string; challenged_team_id: string; match_type: string; proposed_datetime: string | null; message: string | null; status: string; created_at: string; expires_at: string | null };
  type MatchRow = { id: string; match_type: string; status: string; team_a_id: string; team_b_id: string; scheduled_date: string | null; city: string | null; area: string | null; created_at: string };
  type SubRow = { id: string; match_id: string; submitted_by_team_id: string; status: string; winning_side: string | null; equivalent_actual_score_label: string | null; created_at: string };

  const [
    { data: matches },
    { data: incomingChallenges },
    { data: outgoingChallenges },
    { data: pendingSubs },
  ] = await Promise.all([
    matchIds.length > 0
      ? supabase.from('matches')
          .select('id, match_type, status, team_a_id, team_b_id, scheduled_date, city, area, created_at')
          .in('id', matchIds)
          .not('status', 'in', '("voided","cancelled")')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as MatchRow[] }),
    myTeamIds.length > 0
      ? supabase.from('team_challenges')
          .select('id, challenging_team_id, challenged_team_id, match_type, proposed_datetime, message, status, created_at, expires_at')
          .in('challenged_team_id', myTeamIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as ChallengeRow[] }),
    myTeamIds.length > 0
      ? supabase.from('team_challenges')
          .select('id, challenging_team_id, challenged_team_id, match_type, proposed_datetime, message, status, created_at, expires_at')
          .in('challenging_team_id', myTeamIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as ChallengeRow[] }),
    matchIds.length > 0
      ? supabase.from('match_score_submissions')
          .select('id, match_id, submitted_by_team_id, status, winning_side, equivalent_actual_score_label, created_at')
          .in('match_id', matchIds)
          .not('status', 'in', '("withdrawn","superseded")')
      : Promise.resolve({ data: [] as SubRow[] }),
  ]);

  // Team name/rating lookups
  const allChallengeTeamIds = [...new Set([
    ...(incomingChallenges ?? []).map((c: ChallengeRow) => c.challenging_team_id),
    ...(outgoingChallenges ?? []).map((c: ChallengeRow) => c.challenged_team_id),
    ...(matches ?? []).flatMap((m: MatchRow) => [m.team_a_id, m.team_b_id]),
  ])];
  type TeamRow = { id: string; name: string | null; auto_name: string | null; cached_current_team_rating: number | null };
  const { data: teamRows } = allChallengeTeamIds.length > 0
    ? await supabase.from('teams').select('id, name, auto_name, cached_current_team_rating').in('id', allChallengeTeamIds)
    : { data: [] as TeamRow[] };
  const teamById = new Map((teamRows ?? []).map((t: TeamRow) => [t.id, t]));

  // Avatars via service client (bypasses RLS for cross-team reads)
  // Include challenge teams AND opponent teams from matches so all cards have avatars.
  const avatarTeamIds = [...new Set([
    ...(incomingChallenges ?? []).map((c: ChallengeRow) => c.challenging_team_id),
    ...(outgoingChallenges ?? []).map((c: ChallengeRow) => c.challenged_team_id),
    ...(matches ?? []).flatMap((m: MatchRow) => [m.team_a_id, m.team_b_id]),
  ])];
  const avatarsByTeam = await fetchTeamAvatars(service, avatarTeamIds);

  // Score submissions map (first one per match wins)
  const subByMatch: Record<string, SubRow> = {};
  for (const s of pendingSubs ?? []) {
    if (!subByMatch[s.match_id]) subByMatch[s.match_id] = s as SubRow;
  }

  const teamName = (id: string) => {
    const t = teamById.get(id);
    return t?.name ?? t?.auto_name ?? 'Unknown';
  };

  const received = (incomingChallenges ?? []).map((c: ChallengeRow) => ({
    id: c.id,
    challenging_team_id: c.challenging_team_id,
    challenged_team_id: c.challenged_team_id,
    team_name: teamName(c.challenging_team_id),
    team_rating: teamById.get(c.challenging_team_id)?.cached_current_team_rating ?? 500,
    players: avatarsByTeam.get(c.challenging_team_id) ?? [],
    match_type: c.match_type as 'friendly' | 'rivals_rated',
    proposed_datetime: c.proposed_datetime,
    message: c.message,
    expires_at: c.expires_at,
    created_at: c.created_at,
  }));

  const pushed = (outgoingChallenges ?? []).map((c: ChallengeRow) => ({
    id: c.id,
    challenging_team_id: c.challenging_team_id,
    challenged_team_id: c.challenged_team_id,
    team_name: teamName(c.challenged_team_id),
    team_rating: teamById.get(c.challenged_team_id)?.cached_current_team_rating ?? 500,
    players: avatarsByTeam.get(c.challenged_team_id) ?? [],
    match_type: c.match_type as 'friendly' | 'rivals_rated',
    proposed_datetime: c.proposed_datetime,
    message: c.message,
    expires_at: c.expires_at,
    created_at: c.created_at,
  }));

  const matched = (matches ?? []).map((m: MatchRow) => {
    const slot = slotByMatch[m.id];
    const opponentTeamId = slot?.side === 'A' ? m.team_b_id : m.team_a_id;
    const sub = subByMatch[m.id] ?? null;
    return {
      id: m.id,
      match_type: m.match_type,
      status: m.status,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      scheduled_date: m.scheduled_date,
      city: m.city,
      area: m.area,
      created_at: m.created_at,
      opponent_name: teamName(opponentTeamId),
      my_side: slot?.side ?? 'A',
      my_team_id: slot?.team_id ?? '',
      score_sub: sub,
      players: avatarsByTeam.get(opponentTeamId) ?? [],
    };
  });

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Matches</span>
        </div>
      </header>

      <MatchesTabs pushed={pushed} received={received} matched={matched} />

      <BottomNav />
    </div>
  );
}
