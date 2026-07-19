import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import ScoreFlow from './ScoreFlow';
import ProcessingSummary from './ProcessingSummary';
import Link from 'next/link';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Verify participation
  const { data: mySlot } = await supabase
    .from('match_players')
    .select('side, team_id, player_rating_at_match_creation, player_rating_at_score_submission')
    .eq('match_id', matchId)
    .eq('player_id', profile.id)
    .single();
  if (!mySlot) notFound();

  const mySide = mySlot.side as 'A' | 'B';
  const myTeamId = mySlot.team_id;

  // Load match
  const { data: match } = await supabase
    .from('matches')
    .select('id, match_type, status, team_a_id, team_b_id, scheduled_date, city, area, source_type, source_id, first_score_submitted_at, rating_snapshot_json, created_at')
    .eq('id', matchId)
    .single();
  if (!match) notFound();

  // Fetch challenge message if this match came from a team challenge
  let challengeMessage: string | null = null;
  let challengeProposedDatetime: string | null = null;
  if (match.source_type === 'team_challenge' && match.source_id) {
    const { data: challenge } = await supabase
      .from('team_challenges')
      .select('message, proposed_datetime')
      .eq('id', match.source_id)
      .maybeSingle();
    challengeMessage = challenge?.message ?? null;
    challengeProposedDatetime = challenge?.proposed_datetime ?? null;
  }

  // All players in match
  const { data: matchPlayers } = await supabase
    .from('match_players')
    .select('player_id, side, slot, team_id, player_rating_at_match_creation')
    .eq('match_id', matchId);

  const allPlayerIds = (matchPlayers ?? []).map((p) => p.player_id);
  const { data: profileRows } = allPlayerIds.length > 0
    ? await supabase
        .from('player_profiles')
        .select('id, first_name, last_name, current_rating')
        .in('id', allPlayerIds)
    : { data: [] };

  const profileById: Record<string, { first_name: string | null; last_name: string | null; current_rating: number }> = {};
  for (const p of profileRows ?? []) profileById[p.id] = p;

  // Team names
  const allTeamIds = [...new Set([match.team_a_id, match.team_b_id])];
  const { data: teamRows } = await supabase
    .from('teams')
    .select('id, name, auto_name, cached_current_team_rating')
    .in('id', allTeamIds);

  const teamById: Record<string, { name: string; rating: number }> = {};
  for (const t of teamRows ?? []) {
    teamById[t.id] = { name: t.name ?? t.auto_name ?? 'Unnamed', rating: t.cached_current_team_rating ?? 500 };
  }

  const myTeamName = teamById[myTeamId]?.name ?? 'My Team';
  const opponentTeamId = mySide === 'A' ? match.team_b_id : match.team_a_id;
  const opponentTeamName = teamById[opponentTeamId]?.name ?? 'Opponent';

  // Score submissions (non-withdrawn, non-superseded)
  const { data: submissions } = await supabase
    .from('match_score_submissions')
    .select('id, submitted_by_team_id, submission_type, status, winning_side, equivalent_actual_score_label, created_at, score_format')
    .eq('match_id', matchId)
    .not('status', 'in', '("withdrawn","superseded")')
    .order('created_at', { ascending: false });

  const activeSub = (submissions ?? []).find((s) => s.status === 'pending') ?? null;
  const confirmedSub = (submissions ?? []).find((s) => ['confirmed', 'auto_approved'].includes(s.status)) ?? null;

  // Check if I have a pending submission
  const myPendingSub = (submissions ?? []).find(
    (s) => s.submitted_by_team_id === myTeamId && s.status === 'pending'
  ) ?? null;

  // Load score sets for pending/confirmed submission
  const refSub = activeSub ?? confirmedSub;
  const { data: scoreSets } = refSub
    ? await supabase
        .from('match_score_sets')
        .select('set_number, winning_side, winner_games, loser_games, score_label')
        .eq('score_submission_id', refSub.id)
        .order('set_number')
    : { data: [] };

  // Processing summary (if processed)
  const { data: summary } = await supabase
    .from('match_processing_summaries')
    .select('team_a_rating_change, team_b_rating_change, player_changes, bars_json, streaks_json, explanation_short, explanation_detailed, steps, favored_side, expected_label, actual_label, processed_at')
    .eq('match_id', matchId)
    .maybeSingle();

  // Rating snapshot for match context
  const snapshot = match.rating_snapshot_json as {
    team_a_rating: number;
    team_b_rating: number;
    expected_label: string | null;
    steps: number;
  } | null;

  // Can I submit a score?
  const canSubmit = !myPendingSub && !['processed', 'voided', 'cancelled', 'disputed', 'confirmed', 'auto_approved'].includes(match.status);
  // Can I confirm/reject the pending sub?
  const canConfirmReject = activeSub && activeSub.submitted_by_team_id !== myTeamId;

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center gap-3 px-5 py-4 pt-safe-header border-b border-white/10">
        <Link href="/matches" className="text-white/40 hover:text-white/70 text-sm">←</Link>
        <BandejaLogo width={100} height={26} />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-6">

        {/* ── Match header ──────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] tracking-widest uppercase px-2 py-0.5 border ${
              match.match_type === 'rivals_rated'
                ? 'text-brand-green border-brand-green/30'
                : 'text-white/40 border-white/20'
            }`} style={G}>
              {match.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
            </span>
            <StatusBadge status={match.status} />
          </div>
          <h1 className="text-white text-xl tracking-widest uppercase mt-2" style={G}>
            {myTeamName} vs. {opponentTeamName}
          </h1>
          {snapshot && (
            <p className="text-white/30 text-xs" style={I}>
              {snapshot.steps === 0 ? 'Balanced match' : snapshot.expected_label ?? ''}
              {' '}· Snapshot ratings: {Math.round(snapshot.team_a_rating)} vs {Math.round(snapshot.team_b_rating)}
            </p>
          )}
        </div>

        {/* ── Scheduling info (pre-play) ────────────────────────── */}
        {(match.status === 'scheduled' || match.status === 'scheduled_tbd') && (
          <div className="border border-white/10 p-4 space-y-3">
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Match Details</p>

            {match.scheduled_date || match.city || match.area ? (
              <div className="space-y-2">
                {match.scheduled_date && (
                  <div className="flex items-start gap-3">
                    <span className="text-white/25 text-[10px] w-12 shrink-0 pt-0.5" style={G}>DATE</span>
                    <p className="text-white text-sm" style={I}>
                      {new Date(match.scheduled_date).toLocaleDateString('en-GB', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}
                      {challengeProposedDatetime && (() => {
                        const t = new Date(challengeProposedDatetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        return <span className="text-white/50"> · {t}</span>;
                      })()}
                    </p>
                  </div>
                )}
                {(match.city || match.area) && (
                  <div className="flex items-start gap-3">
                    <span className="text-white/25 text-[10px] w-12 shrink-0 pt-0.5" style={G}>WHERE</span>
                    <p className="text-white text-sm" style={I}>
                      {[match.area, match.city].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-white/30 text-sm" style={I}>Time and place not set — coordinate with your opponent.</p>
            )}

            {challengeMessage && (
              <p className="text-white/40 text-xs italic border-l-2 border-white/10 pl-3" style={I}>
                "{challengeMessage}"
              </p>
            )}

            <p className="text-white/25 text-[10px] leading-relaxed border-t border-white/10 pt-3" style={I}>
              Once you have played, use the button below to submit your score.
            </p>
          </div>
        )}

        {/* ── Processing summary (if done) ──────────────────────── */}
        {summary && (
          <ProcessingSummary
            summary={summary}
            mySide={mySide}
            myPlayerId={profile.id}
          />
        )}

        {/* ── Confirmed/auto-approved score ─────────────────────── */}
        {confirmedSub && !summary && (
          <div className="border border-white/10 p-4 space-y-2">
            <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Confirmed Score</p>
            <p className="text-white text-lg" style={G}>{confirmedSub.equivalent_actual_score_label}</p>
            {(scoreSets ?? []).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {(scoreSets ?? []).map((s) => (
                  <span key={s.set_number} className="text-xs text-white/50 border border-white/10 px-2 py-0.5" style={I}>
                    Set {s.set_number}: {s.score_label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pending submission (waiting for confirmation) ─────── */}
        {activeSub && (
          <div className={`border p-4 space-y-2 ${
            activeSub.submitted_by_team_id === myTeamId
              ? 'border-white/15'
              : 'border-yellow-400/30 bg-yellow-400/5'
          }`}>
            <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
              {activeSub.submitted_by_team_id === myTeamId ? 'Your Submission' : 'Opponent\'s Submission'}
            </p>
            <p className="text-white text-lg" style={G}>{activeSub.equivalent_actual_score_label}</p>
            {(scoreSets ?? []).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {(scoreSets ?? []).map((s) => (
                  <span key={s.set_number} className="text-xs text-white/50 border border-white/10 px-2 py-0.5" style={I}>
                    Set {s.set_number}: {s.winning_side === mySide ? `${s.winner_games}-${s.loser_games}` : `${s.loser_games}-${s.winner_games}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Score flow (submit / confirm / reject) ────────────── */}
        {(canSubmit || canConfirmReject || myPendingSub) && (
          <ScoreFlow
            matchId={matchId}
            mySide={mySide}
            myTeamName={myTeamName}
            opponentTeamName={opponentTeamName}
            canSubmit={canSubmit}
            canConfirmReject={!!canConfirmReject}
            pendingSubmissionId={activeSub?.id ?? null}
            mySubmissionId={myPendingSub?.id ?? null}
            matchStatus={match.status}
          />
        )}

      </main>

      <BottomNav />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled:                    { label: 'Scheduled',       color: 'text-blue-400 border-blue-400/30' },
    scheduled_tbd:                { label: 'Awaiting Schedule', color: 'text-white/40 border-white/20' },
    awaiting_confirmation:        { label: 'Awaiting Conf.',  color: 'text-yellow-400 border-yellow-400/30' },
    alternative_score_submitted:  { label: 'Score Disputed',  color: 'text-orange-400 border-orange-400/30' },
    confirmed:                    { label: 'Confirmed',       color: 'text-brand-green border-brand-green/30' },
    auto_approved:                { label: 'Auto-approved',   color: 'text-brand-green border-brand-green/30' },
    processed:                    { label: 'Processed',       color: 'text-brand-green border-brand-green/30' },
    disputed:                     { label: 'Disputed',        color: 'text-red-400 border-red-400/30' },
    admin_resolved:               { label: 'Resolved',        color: 'text-white/50 border-white/20' },
    voided:                       { label: 'Voided',          color: 'text-white/30 border-white/10' },
  };
  const entry = map[status] ?? { label: status, color: 'text-white/30 border-white/10' };
  return (
    <span className={`text-[9px] tracking-widest uppercase px-2 py-0.5 border ${entry.color}`} style={G}>
      {entry.label}
    </span>
  );
}


