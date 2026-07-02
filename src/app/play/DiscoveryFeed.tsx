'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDiscoveryFeed, sendChallenge, type DiscoveryCandidate } from '@/app/actions/challenges';
import { expectedScorePreview } from '@/lib/bandeja-rating';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

const LABEL_COLORS: Record<string, string> = {
  'Balanced':       'text-blue-400 border-blue-400/30',
  'Slight Favorite':'text-brand-green border-brand-green/30',
  'Favorite':       'text-brand-green border-brand-green/30',
  'Heavy Favorite': 'text-brand-green border-brand-green/30',
  'Slight Underdog':'text-yellow-400 border-yellow-400/30',
  'Underdog':       'text-orange-400 border-orange-400/30',
  'Big Underdog':   'text-red-400 border-red-400/30',
};

interface Team { id: string; name: string | null; auto_name: string | null; cached_current_team_rating: number | null; status: string; }

interface ChallengeFormState {
  candidate: DiscoveryCandidate;
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime: string;
  city: string;
  area: string;
  message: string;
}

export default function DiscoveryFeed({
  teams,
  selectedTeamId: initialTeamId,
}: {
  teams: Team[];
  selectedTeamId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [myTeamRating, setMyTeamRating] = useState(500);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [challengeForm, setChallengeForm] = useState<ChallengeFormState | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState<string | null>(null); // team_id just challenged

  // Load discovery feed when team changes
  useEffect(() => {
    setLoadError(null);
    setPassed(new Set());
    startTransition(async () => {
      const res = await getDiscoveryFeed(selectedTeamId);
      if (res.error) { setLoadError(res.error); return; }
      setCandidates(res.candidates);
      setMyTeamRating(res.myTeamRating);
    });
  }, [selectedTeamId]);

  const visible = candidates.filter((c) => !passed.has(c.team_id) && c.team_id !== challengeSent);

  function handlePass(teamId: string) {
    setPassed((p) => new Set(p).add(teamId));
  }

  function openChallengeForm(candidate: DiscoveryCandidate) {
    setChallengeForm({
      candidate,
      match_type: 'rivals_rated',
      proposed_datetime: '',
      city: candidate.home_city ?? '',
      area: candidate.home_area ?? '',
      message: '',
    });
    setChallengeError(null);
  }

  function handleSendChallenge() {
    if (!challengeForm) return;
    setChallengeError(null);
    startTransition(async () => {
      const res = await sendChallenge({
        challenging_team_id: selectedTeamId,
        challenged_team_id: challengeForm.candidate.team_id,
        match_type: challengeForm.match_type,
        proposed_datetime: challengeForm.proposed_datetime || undefined,
        city: challengeForm.city || undefined,
        area: challengeForm.area || undefined,
        message: challengeForm.message || undefined,
      });
      if (res.error) { setChallengeError(res.error); return; }
      setChallengeSent(challengeForm.candidate.team_id);
      setChallengeForm(null);
      router.refresh();
    });
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)!;
  const selectedTeamName = selectedTeam?.name ?? selectedTeam?.auto_name ?? 'My Team';

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Team selector (if multiple teams) ──────────────── */}
      {teams.length > 1 && (
        <div className="px-4 pt-4 pb-2 border-b border-white/10">
          <p className="text-white/40 text-[9px] tracking-widest uppercase mb-2" style={G}>Browsing As</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={`shrink-0 px-3 py-2 text-[10px] tracking-widest uppercase border transition-colors ${
                  t.id === selectedTeamId
                    ? 'border-brand-green bg-brand-green/10 text-brand-green'
                    : 'border-white/20 text-white/50 hover:border-white/40'
                }`}
                style={G}
              >
                {t.name ?? t.auto_name ?? 'Team'}
                <span className="ml-1.5 text-white/30">{t.cached_current_team_rating}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feed ─────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">

        {/* Browsing-as pill */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-white/30 text-xs" style={I}>
            Browsing as <span className="text-white/60">{selectedTeamName}</span>
            {' '}· Rating <span className="text-brand-green">{myTeamRating}</span>
          </p>
          {challengeSent && (
            <span className="text-brand-green text-[9px] tracking-widest uppercase" style={G}>
              ✓ Challenge sent
            </span>
          )}
        </div>

        {isPending && candidates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-white/30 text-sm" style={I}>Finding opponents...</p>
          </div>
        )}

        {loadError && (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm" style={I}>{loadError}</p>
          </div>
        )}

        {!isPending && !loadError && visible.length === 0 && candidates.length > 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-white text-lg tracking-widest uppercase" style={G}>All caught up</p>
            <p className="text-white/40 text-sm" style={I}>No more teams to browse right now.</p>
            <button
              onClick={() => { setPassed(new Set()); setChallengeSent(null); }}
              className="text-brand-green text-xs tracking-widest uppercase border border-brand-green/30 px-4 py-2 hover:bg-brand-green/5 transition-colors"
              style={G}
            >
              Start Over
            </button>
          </div>
        )}

        {!isPending && !loadError && candidates.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-white text-lg tracking-widest uppercase" style={G}>No teams yet</p>
            <p className="text-white/40 text-sm" style={I}>
              No other teams are discoverable right now. Check back later.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {visible.map((c) => (
            <TeamCard
              key={c.team_id}
              candidate={c}
              myTeamRating={myTeamRating}
              onPass={() => handlePass(c.team_id)}
              onChallenge={() => openChallengeForm(c)}
            />
          ))}
        </div>
      </div>

      {/* ── Challenge modal ───────────────────────────────────── */}
      {challengeForm && (
        <div className="fixed inset-0 bg-black/85 flex items-end justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-sm rounded-t-xl space-y-4 p-5 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm tracking-widest uppercase" style={G}>
                Challenge
              </h2>
              <button
                onClick={() => setChallengeForm(null)}
                className="text-white/30 text-sm hover:text-white/60"
              >✕</button>
            </div>

            <div className="border border-white/10 p-3">
              <p className="text-brand-green text-[10px] tracking-widest uppercase mb-0.5" style={G}>Opponent</p>
              <p className="text-white text-sm" style={I}>
                {challengeForm.candidate.team_name}
                <span className="text-white/40 ml-2">· {challengeForm.candidate.team_rating}</span>
              </p>
              <p className="text-white/30 text-xs mt-1" style={I}>
                {expectedScorePreview(
                  challengeForm.candidate.steps,
                  challengeForm.candidate.steps === 0 ? null : (myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B'),
                  myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B'
                )}
              </p>
            </div>

            {/* Match type */}
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Match Type</p>
              <div className="flex gap-2">
                {(['rivals_rated', 'friendly'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setChallengeForm((f) => f ? { ...f, match_type: type } : f)}
                    className={`flex-1 py-2.5 text-xs tracking-widest uppercase border transition-colors ${
                      challengeForm.match_type === type
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'border-white/20 text-white/50 hover:border-white/40'
                    }`}
                    style={G}
                  >
                    {type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                  </button>
                ))}
              </div>
            </div>

            {/* Date/time (optional) */}
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
                Date & Time <span className="text-white/20">(optional)</span>
              </p>
              <input
                type="datetime-local"
                className="w-full bg-transparent border border-white/20 text-white px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors"
                style={I}
                value={challengeForm.proposed_datetime}
                onChange={(e) => setChallengeForm((f) => f ? { ...f, proposed_datetime: e.target.value } : f)}
              />
            </div>

            {/* Message (optional) */}
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
                Message <span className="text-white/20">(optional)</span>
              </p>
              <input
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors"
                style={I}
                placeholder="Let's play this weekend!"
                value={challengeForm.message}
                onChange={(e) => setChallengeForm((f) => f ? { ...f, message: e.target.value } : f)}
                maxLength={200}
              />
            </div>

            {challengeError && <p className="text-red-400 text-sm" style={I}>{challengeError}</p>}

            <button
              onClick={handleSendChallenge}
              disabled={isPending}
              className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity"
              style={G}
            >
              {isPending ? 'Sending...' : 'Send Challenge →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({
  candidate,
  myTeamRating,
  onPass,
  onChallenge,
}: {
  candidate: DiscoveryCandidate;
  myTeamRating: number;
  onPass: () => void;
  onChallenge: () => void;
}) {
  const myTeamIsFavorite: 'A' | 'B' | null = candidate.steps === 0 ? null : (myTeamRating > candidate.team_rating ? 'A' : 'B');
  const scorePreview = expectedScorePreview(
    candidate.steps,
    myTeamIsFavorite,
    myTeamIsFavorite ?? 'A'
  );
  const labelColors = LABEL_COLORS[candidate.label] ?? 'text-white/40 border-white/20';

  return (
    <div className="border border-white/10 p-4 space-y-4">
      {/* Team header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white text-sm tracking-wide uppercase" style={G}>
              {candidate.team_name}
            </h3>
            <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${labelColors}`} style={G}>
              {candidate.label}
            </span>
          </div>
          {(candidate.home_city || candidate.home_area) && (
            <p className="text-white/30 text-xs mt-0.5" style={I}>
              {candidate.home_city}{candidate.home_area ? ` · ${candidate.home_area}` : ''}
            </p>
          )}
        </div>
        <div className="text-right shrink-0 ml-3">
          <div className="text-white text-xl font-bold leading-none" style={G}>{candidate.team_rating}</div>
          <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4">
        <span className="text-white/40 text-xs" style={I}>
          {candidate.wins}W {candidate.losses}L
        </span>
        {candidate.cached_recent_form && (
          <div className="flex gap-0.5">
            {candidate.cached_recent_form.split('').slice(0, 5).map((c, i) => (
              <span key={i} className="w-3.5 h-3.5 text-[7px] flex items-center justify-center font-bold"
                style={{ color: c === 'W' ? '#8CF702' : '#ef4444' }}>
                {c}
              </span>
            ))}
          </div>
        )}
        <span className="text-white/30 text-xs ml-auto" style={I}>{scorePreview}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onPass}
          className="flex-1 border border-white/15 text-white/40 py-2.5 text-xs tracking-widest uppercase hover:border-white/30 hover:text-white/60 transition-colors"
          style={G}
        >
          Pass
        </button>
        <button
          onClick={onChallenge}
          className="flex-[2] bg-brand-green text-black py-2.5 text-xs tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors"
          style={G}
        >
          Challenge →
        </button>
      </div>
    </div>
  );
}
