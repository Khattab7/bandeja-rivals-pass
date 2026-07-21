'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getExploreHome, startExploreSession, getExploreCandidates,
  recordExploreAction, sendChallengeFromExplore,
  markTeamReadyTonight, cancelTeamReadyTonight,
  type ExploreTileCard, type ExploreCandidate,
} from '@/app/actions/explore';
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
  candidate: ExploreCandidate;
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime: string;
  city: string;
  area: string;
  message: string;
}

type View = 'home' | 'candidates';

export default function ExploreFeed({
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

  const [view, setView] = useState<View>('home');
  const [tiles, setTiles] = useState<ExploreTileCard[]>([]);
  const [myTeamRating, setMyTeamRating] = useState(500);
  const [isReadyTonight, setIsReadyTonight] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [activeTile, setActiveTile] = useState<ExploreTileCard | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ExploreCandidate[]>([]);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [challengeSent, setChallengeSent] = useState<string | null>(null);
  const [challengeForm, setChallengeForm] = useState<ChallengeFormState | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);

  const selectedTeam = teams.find(t => t.id === selectedTeamId)!;
  const isCaptain = selectedTeam?.captain_player_id === myPlayerId;

  // Load home tiles
  const loadHome = useCallback(() => {
    setHomeError(null);
    startTransition(async () => {
      const res = await getExploreHome(selectedTeamId);
      if (res.error) { setHomeError(res.error); return; }
      setTiles(res.tiles);
      setMyTeamRating(res.myTeamRating);
      setIsReadyTonight(res.isReadyTonight);
    });
  }, [selectedTeamId]);

  useEffect(() => {
    loadHome();
    setView('home');
    setActiveTile(null);
    setSessionId(null);
    setCandidates([]);
    setPassed(new Set());
    setChallengeSent(null);
  }, [loadHome]);

  // Open a tile → start session + load candidates
  function openTile(tile: ExploreTileCard) {
    if (tile.access_status !== 'available') return;
    setActiveTile(tile);
    setCandidates([]);
    setCandidatesError(null);
    setPassed(new Set());
    setChallengeSent(null);
    setView('candidates');

    startTransition(async () => {
      const configSnapshot = {
        tile_id: tile.id,
        team_id: selectedTeamId,
        eligibility_rules: tile.eligibility_rules,
        ranking_rules: tile.ranking_rules,
      };
      const sessionRes = await startExploreSession(tile.id, selectedTeamId, configSnapshot);
      if (sessionRes.sessionId) {
        setSessionId(sessionRes.sessionId);
        await recordExploreAction(sessionRes.sessionId, tile.id, selectedTeamId, 'open');
      }

      const candRes = await getExploreCandidates(
        tile.id,
        selectedTeamId,
        tile.eligibility_rules,
        tile.ranking_rules,
        tile.max_visible_candidates,
      );
      if (candRes.error) { setCandidatesError(candRes.error); return; }
      setCandidates(candRes.candidates);
      if (sessionRes.sessionId) {
        await recordExploreAction(sessionRes.sessionId, tile.id, selectedTeamId, 'impression');
      }
    });
  }

  function goBack() {
    if (sessionId && activeTile) {
      recordExploreAction(sessionId, activeTile.id, selectedTeamId, 'exit').catch(() => {});
    }
    setView('home');
    setActiveTile(null);
    setSessionId(null);
    setCandidates([]);
  }

  function handlePass(candidateTeamId: string) {
    setPassed(p => new Set(p).add(candidateTeamId));
    if (sessionId && activeTile) {
      recordExploreAction(sessionId, activeTile.id, selectedTeamId, 'pass', candidateTeamId).catch(() => {});
    }
  }

  function openChallengeForm(candidate: ExploreCandidate) {
    setChallengeForm({
      candidate,
      match_type: 'rivals_rated',
      proposed_datetime: '',
      city: candidate.home_city ?? '',
      area: candidate.home_area ?? '',
      message: '',
    });
    setChallengeError(null);
    if (sessionId && activeTile) {
      recordExploreAction(sessionId, activeTile.id, selectedTeamId, 'candidate_view', candidate.team_id).catch(() => {});
    }
  }

  function handleSendChallenge() {
    if (!challengeForm || !activeTile) return;
    setChallengeError(null);
    startTransition(async () => {
      const res = await sendChallengeFromExplore({
        sessionId: sessionId ?? '',
        tileId: activeTile.id,
        challengingTeamId: selectedTeamId,
        challengedTeamId: challengeForm.candidate.team_id,
        matchType: challengeForm.match_type,
        proposedDatetime: challengeForm.proposed_datetime || undefined,
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

  function handleReadyTonight() {
    if (!isCaptain) return;
    setReadyError(null);
    setReadyLoading(true);
    startTransition(async () => {
      if (isReadyTonight) {
        const res = await cancelTeamReadyTonight(selectedTeamId);
        if (res.error) { setReadyError(res.error); setReadyLoading(false); return; }
        setIsReadyTonight(false);
      } else {
        const res = await markTeamReadyTonight(selectedTeamId, 4);
        if (res.error) { setReadyError(res.error); setReadyLoading(false); return; }
        setIsReadyTonight(true);
        if (sessionId && activeTile) {
          await recordExploreAction(sessionId, activeTile.id, selectedTeamId, 'mark_ready_tonight');
        }
      }
      setReadyLoading(false);
    });
  }

  const visible = candidates.filter(c => !passed.has(c.team_id) && c.team_id !== challengeSent);
  const selectedTeamName = selectedTeam?.name ?? selectedTeam?.auto_name ?? 'My Team';

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Team selector ────────────────────────────────── */}
      {teams.length > 1 && (
        <div className="px-4 pt-4 pb-2 border-b border-white/10">
          <p className="text-white/40 text-[9px] tracking-widest uppercase mb-2" style={G}>Browsing As</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {teams.map(t => (
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

      {/* ── Home: tile grid ──────────────────────────────── */}
      {view === 'home' && (
        <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">

          {/* Ready Tonight banner */}
          {isCaptain && (
            <div className={`mb-4 p-3 border transition-colors ${isReadyTonight ? 'border-brand-green/40 bg-brand-green/5' : 'border-white/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-xs tracking-widest uppercase" style={G}>
                    {isReadyTonight ? '● Ready Tonight' : 'Ready Tonight?'}
                  </p>
                  <p className="text-white/30 text-[10px] mt-0.5" style={I}>
                    {isReadyTonight
                      ? 'Other teams can see you\'re available to play'
                      : 'Signal that your team is available to play today'}
                  </p>
                </div>
                <button
                  onClick={handleReadyTonight}
                  disabled={readyLoading || isPending}
                  className={`shrink-0 ml-3 px-3 py-2 text-[10px] tracking-widest uppercase border font-bold transition-colors disabled:opacity-40 ${isReadyTonight ? 'border-brand-green text-brand-green hover:bg-brand-green/10' : 'border-white/25 text-white/60 hover:border-brand-green hover:text-brand-green'}`}
                  style={G}>
                  {readyLoading ? '...' : isReadyTonight ? 'Cancel' : 'Set Ready'}
                </button>
              </div>
              {readyError && <p className="text-red-400 text-[10px] mt-2" style={I}>{readyError}</p>}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <p className="text-white/30 text-xs" style={I}>
              As <span className="text-white/60">{selectedTeamName}</span>
              {' '}· Rating <span className="text-brand-green">{myTeamRating}</span>
            </p>
          </div>

          {isPending && tiles.length === 0 && (
            <div className="text-center py-16">
              <p className="text-white/30 text-sm" style={I}>Loading...</p>
            </div>
          )}
          {homeError && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm" style={I}>{homeError}</p>
            </div>
          )}
          {!isPending && !homeError && tiles.length === 0 && (
            <div className="text-center py-16">
              <p className="text-white/40 text-sm tracking-widest uppercase" style={G}>No tiles available</p>
              <p className="text-white/20 text-xs mt-2" style={I}>Check back soon — new matchmaking modes are added regularly.</p>
            </div>
          )}

          {/* Featured tiles */}
          {tiles.filter(t => t.is_featured).length > 0 && (
            <div className="mb-4 space-y-3">
              {tiles.filter(t => t.is_featured).map(tile => (
                <TileCard key={tile.id} tile={tile} onOpen={() => openTile(tile)} />
              ))}
            </div>
          )}

          {/* Regular tiles */}
          {tiles.filter(t => !t.is_featured).length > 0 && (
            <>
              {tiles.filter(t => t.is_featured).length > 0 && (
                <p className="text-white/20 text-[9px] tracking-widest uppercase mb-3" style={G}>More Modes</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {tiles.filter(t => !t.is_featured).map(tile => (
                  <SmallTileCard key={tile.id} tile={tile} onOpen={() => openTile(tile)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Candidate feed ─────────────────────────────── */}
      {view === 'candidates' && activeTile && (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <button onClick={goBack} className="text-white/40 text-sm hover:text-white/70 transition-colors" style={G}>← Back</button>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs tracking-widest uppercase truncate" style={G}>{activeTile.title}</p>
              {activeTile.subtitle && <p className="text-white/30 text-[10px] truncate" style={I}>{activeTile.subtitle}</p>}
            </div>
            {challengeSent && (
              <span className="text-brand-green text-[9px] tracking-widest uppercase shrink-0" style={G}>✓ Sent</span>
            )}
          </div>

          {/* Warn messages */}
          {activeTile.warn_messages.length > 0 && (
            <div className="px-4 py-2 bg-yellow-400/5 border-b border-yellow-400/10">
              {activeTile.warn_messages.map((m, i) => (
                <p key={i} className="text-yellow-400 text-[10px]" style={I}>{m}</p>
              ))}
            </div>
          )}

          <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
            <p className="text-white/30 text-xs mb-4" style={I}>
              As <span className="text-white/60">{selectedTeamName}</span>
              {' '}· Rating <span className="text-brand-green">{myTeamRating}</span>
              {activeTile.max_challenges_per_team && (
                <span className="text-white/20 ml-2">· max {activeTile.max_challenges_per_team} challenges</span>
              )}
            </p>

            {isPending && candidates.length === 0 && (
              <div className="text-center py-16">
                <p className="text-white/30 text-sm" style={I}>Finding opponents...</p>
              </div>
            )}
            {candidatesError && (
              <div className="text-center py-8">
                <p className="text-red-400 text-sm" style={I}>{candidatesError}</p>
              </div>
            )}
            {!isPending && !candidatesError && candidates.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <p className="text-white/40 text-sm tracking-widest uppercase" style={G}>No Matches Found</p>
                <p className="text-white/20 text-xs" style={I}>
                  {activeTile.eligibility_rules.some(r => r.rule_key === 'ready_tonight')
                    ? 'No teams with Ready Tonight status match your bracket right now.'
                    : 'No eligible teams found for this mode right now.'}
                </p>
              </div>
            )}
            {!isPending && !candidatesError && visible.length === 0 && candidates.length > 0 && (
              <div className="text-center py-16 space-y-3">
                <p className="text-white text-lg tracking-widest uppercase" style={G}>All caught up</p>
                <button
                  onClick={() => { setPassed(new Set()); setChallengeSent(null); }}
                  className="text-brand-green text-xs tracking-widest uppercase border border-brand-green/30 px-4 py-2 hover:bg-brand-green/5 transition-colors"
                  style={G}>
                  Start Over
                </button>
              </div>
            )}

            <div className="space-y-4">
              {visible.map(c => (
                <ExploreCandidateCard
                  key={c.team_id}
                  candidate={c}
                  myTeamRating={myTeamRating}
                  onPass={() => handlePass(c.team_id)}
                  onChallenge={() => openChallengeForm(c)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Challenge modal ───────────────────────────── */}
      {challengeForm && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-sm space-y-4 p-5 pb-6 max-h-[90vh] overflow-y-auto">
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
              {challengeForm.candidate.is_ready && (
                <span className="text-brand-green text-[9px] tracking-widest uppercase" style={G}>● Ready Tonight</span>
              )}
              <p className="text-white/30 text-xs mt-1" style={I}>
                {expectedScorePreview(challengeForm.candidate.steps, challengeForm.candidate.steps === 0 ? null : (myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B'), myTeamRating > challengeForm.candidate.team_rating ? 'A' : 'B')}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Match Type</p>
              <div className="flex gap-2">
                {(['rivals_rated', 'friendly'] as const).map(type => (
                  <button key={type}
                    onClick={() => setChallengeForm(f => f ? { ...f, match_type: type } : f)}
                    className={`flex-1 py-2.5 text-xs tracking-widest uppercase border transition-colors ${challengeForm.match_type === type ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-white/20 text-white/50'}`}
                    style={G}>
                    {type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Date & Time <span className="text-white/20">(optional)</span></p>
              <input type="datetime-local"
                className="w-full bg-transparent border border-white/20 text-white px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={challengeForm.proposed_datetime}
                onChange={e => setChallengeForm(f => f ? { ...f, proposed_datetime: e.target.value } : f)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[{ key: 'city' as const, label: 'City', ph: 'Cairo' }, { key: 'area' as const, label: 'Area', ph: 'Maadi' }].map(f => (
                <div key={f.key} className="space-y-2">
                  <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>{f.label} <span className="text-white/20">(opt)</span></p>
                  <input placeholder={f.ph} maxLength={80}
                    className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                    value={challengeForm[f.key]}
                    onChange={e => setChallengeForm(c => c ? { ...c, [f.key]: e.target.value } : c)} />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Message <span className="text-white/20">(optional)</span></p>
              <input placeholder="Let's play Saturday at 4pm!" maxLength={200}
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={challengeForm.message}
                onChange={e => setChallengeForm(f => f ? { ...f, message: e.target.value } : f)} />
            </div>
            {challengeError && <p className="text-red-400 text-sm" style={I}>{challengeError}</p>}
            <button onClick={handleSendChallenge} disabled={isPending}
              className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity" style={G}>
              {isPending ? 'Sending...' : 'Send Challenge →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tile card (featured) ───────────────────────────────────

function TileCard({ tile, onOpen }: { tile: ExploreTileCard; onOpen: () => void }) {
  const locked = tile.access_status !== 'available';
  const isAdminOnly = tile.access_status === 'admin_testing';
  const hasImage = !!tile.cover_image_url;

  return (
    <button
      onClick={onOpen}
      disabled={locked}
      className={`w-full text-left border relative overflow-hidden transition-all ${locked ? 'opacity-60 cursor-default' : 'hover:border-brand-green/40 active:scale-[0.99]'}`}
      style={{ background: locked ? '#0a0a0a' : tile.background_color ?? '#0d1a00', border: `1px solid ${locked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}` }}
    >
      {/* Cover image */}
      {hasImage && (
        <div className="relative w-full h-40">
          <img src={tile.cover_image_url!} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%)' }} />
        </div>
      )}

      <div className={hasImage ? 'p-4 pt-3' : 'p-5'}>
        {tile.is_featured && !locked && (
          <span className="absolute top-3 right-3 text-[8px] tracking-widest uppercase px-2 py-0.5 bg-brand-green/10 text-brand-green border border-brand-green/20" style={G}>Featured</span>
        )}
        {tile.is_sponsored && tile.sponsored_label && (
          <span className="absolute top-3 right-3 text-[8px] tracking-widest uppercase px-2 py-0.5 bg-white/5 text-white/30 border border-white/10" style={G}>{tile.sponsored_label}</span>
        )}
        {isAdminOnly && (
          <span className="absolute top-3 right-3 text-[8px] tracking-widest uppercase px-2 py-0.5 bg-purple-900/20 text-purple-400 border border-purple-400/20" style={G}>Admin Only</span>
        )}
        <div className="space-y-1.5">
          <h3 className="text-white text-base tracking-widest uppercase" style={G}>{tile.title}</h3>
          {tile.subtitle && <p className="text-white/50 text-xs" style={I}>{tile.subtitle}</p>}
          {!hasImage && tile.description && <p className="text-white/30 text-xs leading-relaxed" style={I}>{tile.description}</p>}
        </div>
        {locked && tile.locked_reason && (
          <div className="mt-3 flex items-center gap-2">
            {tile.access_status === 'locked_paid' && (
              <span className="text-[9px] tracking-widest uppercase px-2 py-1 bg-yellow-400/10 text-yellow-400 border border-yellow-400/20" style={G}>RIVAL</span>
            )}
            <p className="text-white/30 text-[10px]" style={I}>{tile.locked_reason}</p>
          </div>
        )}
        {!locked && (
          <div className="mt-3 flex items-center gap-2">
            <TileMetaBadges tile={tile} />
            <span className="ml-auto text-brand-green text-[10px] tracking-widest uppercase" style={G}>Enter →</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Small tile card (grid) ─────────────────────────────────

function SmallTileCard({ tile, onOpen }: { tile: ExploreTileCard; onOpen: () => void }) {
  const locked = tile.access_status !== 'available';
  const hasImage = !!tile.cover_image_url;
  return (
    <button
      onClick={onOpen}
      disabled={locked}
      className={`w-full text-left border relative overflow-hidden transition-all ${locked ? 'opacity-50 cursor-default' : 'hover:border-brand-green/40 active:scale-[0.98]'}`}
      style={{ background: locked ? '#0a0a0a' : tile.background_color ?? '#0d1a00', border: `1px solid ${locked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)'}`, minHeight: '100px' }}
    >
      {hasImage && (
        <div className="relative w-full h-20">
          <img src={tile.cover_image_url!} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.8) 100%)' }} />
        </div>
      )}
      <div className="p-3 flex flex-col gap-2">
        <div>
          <h3 className="text-white text-xs tracking-widest uppercase leading-tight" style={G}>{tile.title}</h3>
          {tile.subtitle && <p className="text-white/30 text-[10px] mt-1 leading-tight" style={I}>{tile.subtitle}</p>}
        </div>
        {locked && tile.access_status === 'locked_paid' && (
          <span className="text-[8px] tracking-widest uppercase px-1.5 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 self-start" style={G}>RIVAL</span>
        )}
        {!locked && (
          <span className="text-brand-green text-[9px] tracking-widest uppercase self-start" style={G}>→</span>
        )}
      </div>
    </button>
  );
}

// ── Tile meta badges ───────────────────────────────────────

function TileMetaBadges({ tile }: { tile: ExploreTileCard }) {
  const badges: { label: string; color: string }[] = [];
  for (const r of tile.eligibility_rules) {
    if (r.rule_key === 'gender_rule') {
      const v = r.rule_value_json as string;
      if (v === 'women_only') badges.push({ label: 'Women', color: 'text-pink-400 border-pink-400/20' });
      else if (v === 'men_only') badges.push({ label: 'Men', color: 'text-blue-400 border-blue-400/20' });
      else if (v === 'mixed_required') badges.push({ label: 'Mixed', color: 'text-purple-400 border-purple-400/20' });
    }
    if (r.rule_key === 'ready_tonight') badges.push({ label: 'Ready Tonight', color: 'text-brand-green border-brand-green/20' });
    if (r.rule_key === 'match_history') {
      const v = r.rule_value_json as string;
      if (v === 'new_rivals') badges.push({ label: 'New Rivals', color: 'text-white/40 border-white/10' });
      else if (v === 'rematches_only') badges.push({ label: 'Rematches', color: 'text-orange-400 border-orange-400/20' });
    }
  }
  if (tile.is_ready_tonight_tile && !badges.some(b => b.label === 'Ready Tonight')) {
    badges.push({ label: 'Ready Tonight', color: 'text-brand-green border-brand-green/20' });
  }
  return (
    <>
      {badges.slice(0, 2).map((b, i) => (
        <span key={i} className={`text-[8px] tracking-widest uppercase px-1.5 py-0.5 border ${b.color}`} style={G}>{b.label}</span>
      ))}
    </>
  );
}

// ── Explore candidate card ─────────────────────────────────

function ExploreCandidateCard({ candidate, myTeamRating, onPass, onChallenge }: {
  candidate: ExploreCandidate;
  myTeamRating: number;
  onPass: () => void;
  onChallenge: () => void;
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
            {candidate.is_ready && (
              <span className="text-brand-green text-[8px] tracking-widest uppercase border border-brand-green/20 px-1.5 py-0.5" style={G}>● Ready</span>
            )}
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
