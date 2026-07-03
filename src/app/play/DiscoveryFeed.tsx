'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDiscoveryFeed, sendChallenge, type DiscoveryCandidate } from '@/app/actions/challenges';
import {
  getOpenMatchFeed, applyToOpenMatch, cancelOpenMatchApplication,
  createOpenMatch, getMyOpenMatches, acceptOpenMatchApplication, cancelOpenMatch,
  type OpenMatchCard, type MyOpenMatch,
} from '@/app/actions/open-matches';
import { expectedScorePreview } from '@/lib/bandeja-rating';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

const LABEL_COLORS: Record<string, string> = {
  'Balanced':        'text-blue-400 border-blue-400/30',
  'Slight Favorite': 'text-brand-green border-brand-green/30',
  'Favorite':        'text-brand-green border-brand-green/30',
  'Heavy Favorite':  'text-brand-green border-brand-green/30',
  'Slight Underdog': 'text-yellow-400 border-yellow-400/30',
  'Underdog':        'text-orange-400 border-orange-400/30',
  'Big Underdog':    'text-red-400 border-red-400/30',
};

interface Team {
  id: string;
  name: string | null;
  auto_name: string | null;
  cached_current_team_rating: number | null;
  status: string;
  captain_player_id?: string | null;
}

interface ChallengeFormState {
  candidate: DiscoveryCandidate;
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime: string;
  city: string;
  area: string;
  message: string;
}

interface CreateOMFormState {
  match_type: 'friendly' | 'rivals_rated';
  city: string;
  area: string;
  proposed_datetime: string;
  rating_min: string;
  rating_max: string;
  message: string;
}

function formatDateTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase() +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function DiscoveryFeed({
  teams,
  selectedTeamId: initialTeamId,
  myPlayerId,
}: {
  teams: Team[];
  selectedTeamId: string;
  myPlayerId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);
  const [feedType, setFeedType] = useState<'teams' | 'open'>('teams');

  // Team discovery state
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [myTeamRating, setMyTeamRating] = useState(500);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [challengeForm, setChallengeForm] = useState<ChallengeFormState | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState<string | null>(null);

  // Open match state
  const [openMatches, setOpenMatches] = useState<OpenMatchCard[]>([]);
  const [myOpenMatches, setMyOpenMatches] = useState<MyOpenMatch[]>([]);
  const [omError, setOmError] = useState<string | null>(null);
  const [omTab, setOmTab] = useState<'browse' | 'mine'>('browse');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOMFormState>({
    match_type: 'rivals_rated', city: '', area: '', proposed_datetime: '',
    rating_min: '', rating_max: '', message: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyMessages, setApplyMessages] = useState<Record<string, string>>({});

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)!;
  const isCaptain = selectedTeam?.captain_player_id === myPlayerId;

  // Load team discovery feed
  useEffect(() => {
    if (feedType !== 'teams') return;
    setLoadError(null);
    setPassed(new Set());
    startTransition(async () => {
      const res = await getDiscoveryFeed(selectedTeamId);
      if (res.error) { setLoadError(res.error); return; }
      setCandidates(res.candidates);
      setMyTeamRating(res.myTeamRating);
    });
  }, [selectedTeamId, feedType]);

  // Load open match feed
  useEffect(() => {
    if (feedType !== 'open') return;
    setOmError(null);
    startTransition(async () => {
      const [feedRes, mineRes] = await Promise.all([
        getOpenMatchFeed(selectedTeamId),
        getMyOpenMatches(selectedTeamId),
      ]);
      if (feedRes.error) setOmError(feedRes.error);
      else setOpenMatches(feedRes.matches);
      setMyOpenMatches(mineRes.matches);
    });
  }, [selectedTeamId, feedType]);

  function handlePass(teamId: string) { setPassed((p) => new Set(p).add(teamId)); }
  function openChallengeForm(candidate: DiscoveryCandidate) {
    setChallengeForm({ candidate, match_type: 'rivals_rated', proposed_datetime: '', city: candidate.home_city ?? '', area: candidate.home_area ?? '', message: '' });
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

  function handleApply(omId: string) {
    setApplyingId(omId);
    startTransition(async () => {
      const res = await applyToOpenMatch({ openMatchId: omId, teamId: selectedTeamId, message: applyMessages[omId] });
      if (res.error) { setOmError(res.error); setApplyingId(null); return; }
      setOpenMatches((prev) => prev.map((m) => m.id === omId ? { ...m, my_application_status: 'pending', my_application_id: 'new' } : m));
      setApplyingId(null);
    });
  }

  function handleCancelApp(omId: string, appId: string) {
    startTransition(async () => {
      await cancelOpenMatchApplication(appId);
      setOpenMatches((prev) => prev.map((m) => m.id === omId ? { ...m, my_application_status: null, my_application_id: null } : m));
    });
  }

  function handleCreateOM() {
    setCreateError(null);
    if (!createForm.city.trim()) { setCreateError('City is required'); return; }
    if (!createForm.proposed_datetime) { setCreateError('Date & time are required'); return; }
    startTransition(async () => {
      const res = await createOpenMatch({
        teamId: selectedTeamId,
        match_type: createForm.match_type,
        city: createForm.city.trim(),
        area: createForm.area.trim() || undefined,
        proposed_datetime: createForm.proposed_datetime,
        rating_min: createForm.rating_min ? parseInt(createForm.rating_min) : undefined,
        rating_max: createForm.rating_max ? parseInt(createForm.rating_max) : undefined,
        message: createForm.message.trim() || undefined,
      });
      if (!res.success) { setCreateError(res.error ?? 'Failed'); return; }
      setShowCreateForm(false);
      setOmTab('mine');
      const mineRes = await getMyOpenMatches(selectedTeamId);
      setMyOpenMatches(mineRes.matches);
    });
  }

  async function handleAcceptApp(applicationId: string) {
    startTransition(async () => {
      const res = await acceptOpenMatchApplication(applicationId);
      if (!res.success) { setOmError(res.error ?? 'Failed'); return; }
      if (res.matchId) router.push(`/matches/${res.matchId}`);
    });
  }

  async function handleCancelOM(omId: string) {
    startTransition(async () => {
      await cancelOpenMatch(omId);
      setMyOpenMatches((prev) => prev.map((m) => m.id === omId ? { ...m, status: 'cancelled' } : m));
    });
  }

  const visible = candidates.filter((c) => !passed.has(c.team_id) && c.team_id !== challengeSent);
  const selectedTeamName = selectedTeam?.name ?? selectedTeam?.auto_name ?? 'My Team';

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Team selector ──────────────────────────────────── */}
      {teams.length > 1 && (
        <div className="px-4 pt-4 pb-2 border-b border-white/10">
          <p className="text-white/40 text-[9px] tracking-widest uppercase mb-2" style={G}>Browsing As</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {teams.map((t) => (
              <button key={t.id} onClick={() => setSelectedTeamId(t.id)}
                className={`shrink-0 px-3 py-2 text-[10px] tracking-widest uppercase border transition-colors ${t.id === selectedTeamId ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-white/20 text-white/50 hover:border-white/40'}`}
                style={G}>
                {t.name ?? t.auto_name ?? 'Team'}
                <span className="ml-1.5 text-white/30">{t.cached_current_team_rating}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feed type tabs ─────────────────────────────────── */}
      <div className="flex border-b border-white/10">
        {(['teams', 'open'] as const).map((type) => (
          <button key={type} onClick={() => setFeedType(type)}
            className="flex-1 py-3 text-[10px] tracking-widest uppercase transition-colors"
            style={{ ...G, color: feedType === type ? '#8CF702' : 'rgba(255,255,255,0.3)', borderBottom: feedType === type ? '2px solid #8CF702' : '2px solid transparent' }}>
            {type === 'teams' ? 'Find Teams' : 'Open Matches'}
          </button>
        ))}
      </div>

      {/* ── Team discovery feed ───────────────────────────── */}
      {feedType === 'teams' && (
        <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white/30 text-xs" style={I}>
              As <span className="text-white/60">{selectedTeamName}</span>
              {' '}· Rating <span className="text-brand-green">{myTeamRating}</span>
            </p>
            {challengeSent && <span className="text-brand-green text-[9px] tracking-widest uppercase" style={G}>✓ Challenge sent</span>}
          </div>

          {isPending && candidates.length === 0 && (
            <div className="text-center py-16"><p className="text-white/30 text-sm" style={I}>Finding opponents...</p></div>
          )}
          {loadError && <div className="text-center py-8"><p className="text-red-400 text-sm" style={I}>{loadError}</p></div>}
          {!isPending && !loadError && visible.length === 0 && candidates.length > 0 && (
            <div className="text-center py-16 space-y-3">
              <p className="text-white text-lg tracking-widest uppercase" style={G}>All caught up</p>
              <button onClick={() => { setPassed(new Set()); setChallengeSent(null); }}
                className="text-brand-green text-xs tracking-widest uppercase border border-brand-green/30 px-4 py-2 hover:bg-brand-green/5 transition-colors" style={G}>
                Start Over
              </button>
            </div>
          )}
          {!isPending && !loadError && candidates.length === 0 && (
            <div className="text-center py-16"><p className="text-white/40 text-sm" style={I}>No other teams are discoverable right now.</p></div>
          )}

          <div className="space-y-4">
            {visible.map((c) => (
              <TeamCard key={c.team_id} candidate={c} myTeamRating={myTeamRating}
                onPass={() => handlePass(c.team_id)} onChallenge={() => openChallengeForm(c)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Open matches feed ─────────────────────────────── */}
      {feedType === 'open' && (
        <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">

          {/* Sub-tabs + create button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {(['browse', 'mine'] as const).map((t) => (
                <button key={t} onClick={() => setOmTab(t)}
                  className={`px-3 py-1.5 text-[10px] tracking-widest uppercase border transition-colors ${omTab === t ? 'border-brand-green text-brand-green bg-brand-green/5' : 'border-white/15 text-white/40'}`}
                  style={G}>
                  {t === 'browse' ? 'Browse' : 'My Listings'}
                </button>
              ))}
            </div>
            {isCaptain && (
              <button onClick={() => setShowCreateForm(true)}
                className="text-[10px] tracking-widest uppercase bg-brand-green text-black px-3 py-1.5 hover:bg-brand-green/90 transition-colors" style={G}>
                + Post Match
              </button>
            )}
          </div>

          {omError && <p className="text-red-400 text-sm mb-3" style={I}>{omError}</p>}
          {isPending && <p className="text-white/30 text-sm text-center py-8" style={I}>Loading...</p>}

          {/* Browse open matches */}
          {omTab === 'browse' && !isPending && (
            <div className="space-y-3">
              {openMatches.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-white/30 text-sm tracking-widest uppercase" style={G}>No Open Matches</p>
                  <p className="text-white/20 text-xs mt-2" style={I}>No teams have posted open matches near you yet.</p>
                </div>
              )}
              {openMatches.map((om) => (
                <OpenMatchCard
                  key={om.id} om={om}
                  applyMessage={applyMessages[om.id] ?? ''}
                  onApplyMessageChange={(v) => setApplyMessages((p) => ({ ...p, [om.id]: v }))}
                  onApply={() => handleApply(om.id)}
                  onCancelApp={() => om.my_application_id && handleCancelApp(om.id, om.my_application_id)}
                  applying={applyingId === om.id}
                />
              ))}
            </div>
          )}

          {/* My open match listings */}
          {omTab === 'mine' && !isPending && (
            <div className="space-y-3">
              {myOpenMatches.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-white/30 text-sm tracking-widest uppercase" style={G}>No Listings Yet</p>
                  {isCaptain && (
                    <p className="text-white/20 text-xs mt-2" style={I}>Post an open match to let other teams apply.</p>
                  )}
                </div>
              )}
              {myOpenMatches.map((om) => (
                <MyOpenMatchCard
                  key={om.id} om={om}
                  onAccept={handleAcceptApp}
                  onCancel={() => handleCancelOM(om.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Challenge modal ───────────────────────────────── */}
      {challengeForm && (
        <div className="fixed inset-0 bg-black/85 flex items-end justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-sm rounded-t-xl space-y-4 p-5 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm tracking-widest uppercase" style={G}>Challenge</h2>
              <button onClick={() => setChallengeForm(null)} className="text-white/30 text-sm hover:text-white/60">✕</button>
            </div>
            <div className="border border-white/10 p-3">
              <p className="text-brand-green text-[10px] tracking-widest uppercase mb-0.5" style={G}>Opponent</p>
              <p className="text-white text-sm" style={I}>
                {challengeForm.candidate.team_name}
                <span className="text-white/40 ml-2">· {challengeForm.candidate.team_rating}</span>
              </p>
              <p className="text-white/30 text-xs mt-1" style={I}>
                {expectedScorePreview(challengeForm.candidate.steps, challengeForm.candidate.steps === 0 ? null : (myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B'), myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B')}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Match Type</p>
              <div className="flex gap-2">
                {(['rivals_rated', 'friendly'] as const).map((type) => (
                  <button key={type} onClick={() => setChallengeForm((f) => f ? { ...f, match_type: type } : f)}
                    className={`flex-1 py-2.5 text-xs tracking-widest uppercase border transition-colors ${challengeForm.match_type === type ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-white/20 text-white/50'}`}
                    style={G}>
                    {type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Date & Time <span className="text-white/20">(optional)</span></p>
              <input type="datetime-local" className="w-full bg-transparent border border-white/20 text-white px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={challengeForm.proposed_datetime} onChange={(e) => setChallengeForm((f) => f ? { ...f, proposed_datetime: e.target.value } : f)} />
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Message <span className="text-white/20">(optional)</span></p>
              <input className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                placeholder="Let's play this weekend!" value={challengeForm.message}
                onChange={(e) => setChallengeForm((f) => f ? { ...f, message: e.target.value } : f)} maxLength={200} />
            </div>
            {challengeError && <p className="text-red-400 text-sm" style={I}>{challengeError}</p>}
            <button onClick={handleSendChallenge} disabled={isPending}
              className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity" style={G}>
              {isPending ? 'Sending...' : 'Send Challenge →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Create open match modal ───────────────────────── */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/85 flex items-end justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-sm rounded-t-xl space-y-4 p-5 pb-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm tracking-widest uppercase" style={G}>Post Open Match</h2>
              <button onClick={() => setShowCreateForm(false)} className="text-white/30 text-sm hover:text-white/60">✕</button>
            </div>

            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Match Type</p>
              <div className="flex gap-2">
                {(['rivals_rated', 'friendly'] as const).map((type) => (
                  <button key={type} onClick={() => setCreateForm((f) => ({ ...f, match_type: type }))}
                    className={`flex-1 py-2.5 text-xs tracking-widest uppercase border transition-colors ${createForm.match_type === type ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-white/20 text-white/50'}`}
                    style={G}>
                    {type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                  </button>
                ))}
              </div>
            </div>

            {[
              { key: 'city' as const, label: 'City *', placeholder: 'Cairo', type: 'text' },
              { key: 'area' as const, label: 'Area (optional)', placeholder: 'Maadi', type: 'text' },
            ].map((f) => (
              <div key={f.key} className="space-y-2">
                <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>{f.label}</p>
                <input type={f.type} placeholder={f.placeholder}
                  className="w-full bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                  value={createForm[f.key]} onChange={(e) => setCreateForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}

            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Date & Time *</p>
              <input type="datetime-local"
                className="w-full bg-transparent border border-white/20 text-white px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={createForm.proposed_datetime} onChange={(e) => setCreateForm((p) => ({ ...p, proposed_datetime: e.target.value }))} />
            </div>

            <div className="flex gap-2">
              {(['rating_min', 'rating_max'] as const).map((k) => (
                <div key={k} className="flex-1 space-y-2">
                  <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>{k === 'rating_min' ? 'Min Rating' : 'Max Rating'}</p>
                  <input type="number" placeholder="Any" min={0} max={2000}
                    className="w-full bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                    value={createForm[k]} onChange={(e) => setCreateForm((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Message (optional)</p>
              <input placeholder="Looking for a competitive match!" maxLength={200}
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={createForm.message} onChange={(e) => setCreateForm((p) => ({ ...p, message: e.target.value }))} />
            </div>

            {createError && <p className="text-red-400 text-sm" style={I}>{createError}</p>}
            <button onClick={handleCreateOM} disabled={isPending}
              className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity" style={G}>
              {isPending ? 'Posting...' : 'Post Open Match →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team discovery card ─────────────────────────────────────

function TeamCard({ candidate, myTeamRating, onPass, onChallenge }: {
  candidate: DiscoveryCandidate; myTeamRating: number; onPass: () => void; onChallenge: () => void;
}) {
  const myTeamIsFavorite: 'A' | 'B' | null = candidate.steps === 0 ? null : (myTeamRating > candidate.team_rating ? 'A' : 'B');
  const scorePreview = expectedScorePreview(candidate.steps, myTeamIsFavorite, myTeamIsFavorite ?? 'A');
  const labelColors = LABEL_COLORS[candidate.label] ?? 'text-white/40 border-white/20';
  return (
    <div className="border border-white/10 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white text-sm tracking-wide uppercase" style={G}>{candidate.team_name}</h3>
            <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${labelColors}`} style={G}>{candidate.label}</span>
          </div>
          {(candidate.home_city || candidate.home_area) && (
            <p className="text-white/30 text-xs mt-0.5" style={I}>{candidate.home_city}{candidate.home_area ? ` · ${candidate.home_area}` : ''}</p>
          )}
        </div>
        <div className="text-right shrink-0 ml-3">
          <div className="text-white text-xl font-bold leading-none" style={G}>{candidate.team_rating}</div>
          <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-white/40 text-xs" style={I}>{candidate.wins}W {candidate.losses}L</span>
        {candidate.cached_recent_form && (
          <div className="flex gap-0.5">
            {candidate.cached_recent_form.split('').slice(0, 5).map((c, i) => (
              <span key={i} className="w-3.5 h-3.5 text-[7px] flex items-center justify-center font-bold" style={{ color: c === 'W' ? '#8CF702' : '#ef4444' }}>{c}</span>
            ))}
          </div>
        )}
        <span className="text-white/30 text-xs ml-auto" style={I}>{scorePreview}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onPass} className="flex-1 border border-white/15 text-white/40 py-2.5 text-xs tracking-widest uppercase hover:border-white/30 hover:text-white/60 transition-colors" style={G}>Pass</button>
        <button onClick={onChallenge} className="flex-[2] bg-brand-green text-black py-2.5 text-xs tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors" style={G}>Challenge →</button>
      </div>
    </div>
  );
}

// ── Open match browse card ──────────────────────────────────

function OpenMatchCard({ om, applyMessage, onApplyMessageChange, onApply, onCancelApp, applying }: {
  om: OpenMatchCard;
  applyMessage: string;
  onApplyMessageChange: (v: string) => void;
  onApply: () => void;
  onCancelApp: () => void;
  applying: boolean;
}) {
  const [showMessage, setShowMessage] = useState(false);
  const applied = !!om.my_application_status && om.my_application_status !== 'cancelled';

  return (
    <div className="border border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white text-sm tracking-wide uppercase" style={G}>{om.team_name}</h3>
            <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${om.match_type === 'rivals_rated' ? 'text-brand-green border-brand-green/30' : 'text-blue-400 border-blue-400/30'}`} style={G}>
              {om.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
            </span>
          </div>
          <p className="text-white/40 text-xs mt-1" style={I}>{om.city}{om.area ? ` · ${om.area}` : ''}</p>
          <p className="text-brand-green text-xs mt-0.5 font-medium" style={I}>{formatDateTime(om.proposed_datetime)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white text-xl font-bold leading-none" style={G}>{om.team_rating}</div>
          <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
        </div>
      </div>

      {(om.rating_min || om.rating_max) && (
        <p className="text-white/30 text-xs" style={I}>
          Rating range: {om.rating_min ?? '—'} – {om.rating_max ?? '—'}
        </p>
      )}
      {om.message && <p className="text-white/40 text-xs italic" style={I}>"{om.message}"</p>}

      {applied ? (
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-widest uppercase px-2 py-1" style={{ ...G, color: om.my_application_status === 'accepted' ? '#8CF702' : '#f97316', border: `1px solid ${om.my_application_status === 'accepted' ? '#8CF702' : '#f97316'}40` }}>
            {om.my_application_status === 'pending' ? 'Applied' : om.my_application_status}
          </span>
          {om.my_application_status === 'pending' && om.my_application_id && (
            <button onClick={onCancelApp} className="text-white/30 text-[10px] tracking-widest uppercase hover:text-white/60 transition-colors" style={G}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {showMessage && (
            <input placeholder="Add a message (optional)" maxLength={200}
              className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I}
              value={applyMessage} onChange={(e) => onApplyMessageChange(e.target.value)} />
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowMessage((v) => !v)} className="border border-white/15 text-white/40 px-3 py-2 text-xs tracking-widest uppercase hover:border-white/30 transition-colors" style={G}>
              {showMessage ? '−' : 'Message'}
            </button>
            <button onClick={onApply} disabled={applying} className="flex-1 bg-brand-green text-black py-2 text-xs tracking-widest uppercase font-bold disabled:opacity-40 hover:bg-brand-green/90 transition-colors" style={G}>
              {applying ? '...' : 'Apply →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── My open match management card ───────────────────────────

function MyOpenMatchCard({ om, onAccept, onCancel }: {
  om: MyOpenMatch; onAccept: (appId: string) => void; onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pendingApps = om.applications.filter((a) => a.status === 'pending');
  const isOpen = om.status === 'open';

  return (
    <div className="border border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${om.match_type === 'rivals_rated' ? 'text-brand-green border-brand-green/30' : 'text-blue-400 border-blue-400/30'}`} style={G}>
              {om.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
            </span>
            <span className="text-[8px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: isOpen ? '#8CF702' : '#666', border: `1px solid ${isOpen ? '#8CF70220' : '#33333340'}` }}>
              {om.status}
            </span>
          </div>
          <p className="text-white/60 text-sm mt-1" style={I}>{om.city}{om.area ? ` · ${om.area}` : ''}</p>
          <p className="text-brand-green text-xs mt-0.5" style={I}>{formatDateTime(om.proposed_datetime)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {pendingApps.length > 0 && (
            <span className="text-brand-green text-[10px] font-bold tracking-widest" style={G}>
              {pendingApps.length} application{pendingApps.length > 1 ? 's' : ''}
            </span>
          )}
          {isOpen && (
            <button onClick={() => setExpanded((v) => !v)} className="text-white/30 text-[9px] tracking-widest uppercase hover:text-white/60 transition-colors" style={G}>
              {expanded ? 'Hide' : 'Manage'}
            </button>
          )}
        </div>
      </div>

      {expanded && isOpen && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          {pendingApps.length === 0 && (
            <p className="text-white/25 text-xs text-center py-2" style={I}>No applications yet</p>
          )}
          {pendingApps.map((app) => (
            <div key={app.id} className="flex items-center justify-between gap-2 border border-white/10 px-3 py-2.5" style={{ background: '#0a0a0a' }}>
              <div>
                <p className="text-white text-sm" style={G}>{app.applying_team_name}</p>
                <p className="text-white/40 text-[10px] mt-0.5" style={I}>Rating: {app.applying_team_rating}</p>
                {app.message && <p className="text-white/30 text-[10px] italic mt-0.5" style={I}>"{app.message}"</p>}
              </div>
              <button onClick={() => onAccept(app.id)} className="shrink-0 bg-brand-green text-black text-[10px] tracking-widest uppercase px-3 py-1.5 font-bold hover:bg-brand-green/90 transition-colors" style={G}>
                Accept
              </button>
            </div>
          ))}
          <button onClick={onCancel} className="w-full text-white/25 text-[10px] tracking-widest uppercase py-2 border border-white/10 hover:text-white/50 transition-colors mt-2" style={G}>
            Cancel Open Match
          </button>
        </div>
      )}
    </div>
  );
}
