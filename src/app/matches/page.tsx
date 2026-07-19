import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import ChallengeInbox from './ChallengeInbox';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

export default async function MatchesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // My match_players entries
  const { data: mySlots } = await supabase
    .from('match_players')
    .select('match_id, side, team_id')
    .eq('player_id', profile.id);

  const matchIds = (mySlots ?? []).map((s) => s.match_id);
  const slotByMatch: Record<string, { side: string; team_id: string }> = {};
  for (const s of mySlots ?? []) slotByMatch[s.match_id] = { side: s.side, team_id: s.team_id };

  // Load all matches
  const { data: matches } = matchIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, match_type, status, team_a_id, team_b_id, scheduled_date, first_score_submitted_at, created_at')
        .in('id', matchIds)
        .not('status', 'in', '("voided","cancelled")')
        .order('created_at', { ascending: false })
    : { data: [] };

  // Team IDs for label lookups
  const allTeamIds = [...new Set((matches ?? []).flatMap((m) => [m.team_a_id, m.team_b_id]))];
  const { data: teamRows } = allTeamIds.length > 0
    ? await supabase
        .from('teams')
        .select('id, name, auto_name')
        .in('id', allTeamIds)
    : { data: [] };

  const teamNameById: Record<string, string> = {};
  for (const t of teamRows ?? []) teamNameById[t.id] = t.name ?? t.auto_name ?? 'Unnamed';

  // Pending score submissions for each match
  const { data: pendingSubs } = matchIds.length > 0
    ? await supabase
        .from('match_score_submissions')
        .select('id, match_id, submitted_by_team_id, status, winning_side, equivalent_actual_score_label, created_at')
        .in('match_id', matchIds)
        .not('status', 'in', '("withdrawn","superseded")')
    : { data: [] };

  type SubRow = { id: string; match_id: string; submitted_by_team_id: string; status: string; winning_side: string | null; equivalent_actual_score_label: string | null; created_at: string };
  const subByMatch: Record<string, SubRow> = {};
  for (const s of pendingSubs ?? []) {
    if (!subByMatch[s.match_id]) subByMatch[s.match_id] = s as SubRow;
  }

  // Incoming challenges (to my team)
  const { data: myTeamMemberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('player_id', profile.id);
  const myTeamIds = (myTeamMemberships ?? []).map((m) => m.team_id);

  const { data: incomingChallenges } = myTeamIds.length > 0
    ? await supabase
        .from('team_challenges')
        .select('id, challenging_team_id, challenged_team_id, match_type, proposed_datetime, message, status, created_at, expires_at')
        .in('challenged_team_id', myTeamIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    : { data: [] };

  const challengerIds = [...new Set((incomingChallenges ?? []).map((c) => c.challenging_team_id))];
  const { data: challengerTeams } = challengerIds.length > 0
    ? await supabase
        .from('teams')
        .select('id, name, auto_name, cached_current_team_rating')
        .in('id', challengerIds)
    : { data: [] };

  const challengerById: Record<string, { name: string; rating: number }> = {};
  for (const t of challengerTeams ?? []) {
    challengerById[t.id] = {
      name: t.name ?? t.auto_name ?? 'Unnamed',
      rating: t.cached_current_team_rating ?? 500,
    };
  }

  // Bucket matches
  const active = (matches ?? []).filter((m) =>
    ['scheduled', 'scheduled_tbd', 'awaiting_confirmation', 'alternative_score_submitted', 'score_submitted'].includes(m.status)
  );
  const needAction = active.filter((m) => {
    const sub = subByMatch[m.id];
    if (!sub) return false;
    const myTeamId = slotByMatch[m.id]?.team_id;
    return sub.status === 'pending' && sub.submitted_by_team_id !== myTeamId;
  });
  const recent = (matches ?? []).filter((m) =>
    ['confirmed', 'auto_approved', 'processed', 'disputed', 'admin_resolved'].includes(m.status)
  );

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Matches</span>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-8">

        {/* ── Incoming challenges ───────────────────────────────── */}
        {(incomingChallenges ?? []).length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Challenges Received
            </h2>
            <ChallengeInbox
              challenges={(incomingChallenges ?? []).map((c) => ({
                id: c.id,
                challenging_team_id: c.challenging_team_id,
                challenged_team_id: c.challenged_team_id,
                challenger_name: challengerById[c.challenging_team_id]?.name ?? 'Unknown',
                challenger_rating: challengerById[c.challenging_team_id]?.rating ?? 500,
                match_type: c.match_type as 'friendly' | 'rivals_rated',
                proposed_datetime: c.proposed_datetime,
                message: c.message,
                expires_at: c.expires_at,
              }))}
            />
          </section>
        )}

        {/* ── Needs your action ─────────────────────────────────── */}
        {needAction.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Needs Your Action
            </h2>
            <div className="space-y-2">
              {needAction.map((m) => {
                const slot = slotByMatch[m.id];
                const opponentTeamId = slot?.side === 'A' ? m.team_b_id : m.team_a_id;
                const sub = subByMatch[m.id];
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="block border border-yellow-400/30 bg-yellow-400/5 p-4 hover:bg-yellow-400/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-yellow-400 text-[9px] tracking-widest uppercase mb-1" style={G}>Confirm Score</p>
                        <p className="text-white text-sm" style={I}>
                          vs. {teamNameById[opponentTeamId] ?? 'Opponent'}
                        </p>
                        {sub && (
                          <p className="text-white/40 text-xs mt-0.5" style={I}>
                            They submitted: {sub.equivalent_actual_score_label ?? sub.winning_side + ' wins'}
                          </p>
                        )}
                      </div>
                      <span className="text-yellow-400 text-sm">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Active matches ────────────────────────────────────── */}
        {active.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Active Matches
            </h2>
            <div className="space-y-2">
              {active.map((m) => {
                const slot = slotByMatch[m.id];
                const opponentTeamId = slot?.side === 'A' ? m.team_b_id : m.team_a_id;
                const sub = subByMatch[m.id];
                const iSubmitted = sub && sub.submitted_by_team_id === slot?.team_id;
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="block border border-white/10 p-4 hover:border-white/25 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 border ${
                            m.match_type === 'rivals_rated'
                              ? 'text-brand-green border-brand-green/30'
                              : 'text-white/40 border-white/20'
                          }`} style={G}>
                            {m.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                          </span>
                        </div>
                        <p className="text-white text-sm" style={I}>
                          vs. {teamNameById[opponentTeamId] ?? 'Opponent'}
                        </p>
                        <p className="text-white/30 text-xs mt-0.5" style={I}>
                          {m.status === 'awaiting_confirmation' && iSubmitted && 'Waiting for confirmation'}
                          {m.status === 'awaiting_confirmation' && !iSubmitted && 'Score submitted by them'}
                          {m.status === 'scheduled_tbd' && 'Scheduled — submit score when done'}
                          {m.status === 'alternative_score_submitted' && 'Scores disputed — check details'}
                        </p>
                      </div>
                      <span className="text-white/40 text-sm">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Recent results ────────────────────────────────────── */}
        {recent.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Recent Results
            </h2>
            <div className="space-y-2">
              {recent.map((m) => {
                const slot = slotByMatch[m.id];
                const opponentTeamId = slot?.side === 'A' ? m.team_b_id : m.team_a_id;
                const sub = subByMatch[m.id];
                const myWon = sub && ((sub.winning_side === 'A' && slot?.side === 'A') || (sub.winning_side === 'B' && slot?.side === 'B'));
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="block border border-white/10 p-4 hover:border-white/25 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-[10px] tracking-widest uppercase font-bold mb-0.5 ${myWon ? 'text-brand-green' : 'text-red-400'}`} style={G}>
                          {sub ? (myWon ? 'Won' : 'Lost') : m.status}
                        </p>
                        <p className="text-white text-sm" style={I}>
                          vs. {teamNameById[opponentTeamId] ?? 'Opponent'}
                        </p>
                        {sub && (
                          <p className="text-white/30 text-xs mt-0.5" style={I}>
                            {sub.equivalent_actual_score_label ?? ''}
                          </p>
                        )}
                      </div>
                      <span className="text-white/40 text-sm">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {(matches ?? []).length === 0 && (incomingChallenges ?? []).length === 0 && (
          <div className="text-center py-20 space-y-3">
            <p className="text-white text-xl tracking-widest uppercase" style={G}>No Matches Yet</p>
            <p className="text-white/30 text-sm" style={I}>
              Head to Play to challenge a team.
            </p>
            <Link
              href="/play"
              className="inline-block border border-brand-green/40 text-brand-green px-6 py-3 text-sm tracking-widest uppercase hover:bg-brand-green/5 transition-colors mt-2"
              style={G}
            >
              Find Opponents →
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
