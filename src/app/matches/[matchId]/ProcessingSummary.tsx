'use client';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface SummaryProps {
  summary: {
    team_a_rating_change: number;
    team_b_rating_change: number;
    player_changes: Record<string, { before: number; change: number; after: number }> | null;
    bars_json: Record<string, { amount: number; status: string }> | null;
    streaks_json: Record<string, { win_streak_after: number; beat_expected_streak_after: number }> | null;
    explanation_short: string | null;
    explanation_detailed: string | null;
    steps: number | null;
    favored_side: string | null;
    expected_label: string | null;
    actual_label: string | null;
    processed_at: string | null;
  };
  mySide: 'A' | 'B';
  myPlayerId: string;
}

export default function ProcessingSummary({ summary, mySide, myPlayerId }: SummaryProps) {
  const myChange = mySide === 'A' ? summary.team_a_rating_change : summary.team_b_rating_change;
  const opponentChange = mySide === 'A' ? summary.team_b_rating_change : summary.team_a_rating_change;
  const myPlayerData = summary.player_changes?.[myPlayerId];
  const myBars = summary.bars_json?.[myPlayerId];
  const myStreaks = summary.streaks_json?.[myPlayerId];
  const won = myChange > 0 || (myChange === 0 && opponentChange < 0);

  return (
    <div className="space-y-4">
      {/* Result banner */}
      <div className={`border p-4 text-center ${won ? 'border-brand-green/30 bg-brand-green/5' : 'border-red-400/20 bg-red-400/5'}`}>
        <p className={`text-2xl tracking-widest uppercase font-bold ${won ? 'text-brand-green' : 'text-red-400'}`} style={G}>
          {won ? 'Win' : 'Loss'}
        </p>
        {summary.actual_label && (
          <p className="text-white/50 text-sm mt-1" style={I}>{summary.actual_label}</p>
        )}
      </div>

      {/* Rating change */}
      <div className="border border-white/10 p-4 space-y-3">
        <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Rating Change</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-white/30 text-[9px] tracking-widest uppercase mb-1" style={G}>Your Team</p>
            <p className={`text-2xl font-bold ${myChange >= 0 ? 'text-brand-green' : 'text-red-400'}`} style={G}>
              {myChange >= 0 ? '+' : ''}{myChange}
            </p>
          </div>
          {myPlayerData && (
            <div>
              <p className="text-white/30 text-[9px] tracking-widest uppercase mb-1" style={G}>Your Rating</p>
              <p className="text-white text-sm" style={I}>
                {myPlayerData.before} → <span className={myPlayerData.change >= 0 ? 'text-brand-green' : 'text-red-400'}>{myPlayerData.after}</span>
              </p>
              <p className="text-white/40 text-xs" style={I}>
                {myPlayerData.change >= 0 ? '+' : ''}{myPlayerData.change} pts
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bars */}
      {myBars && (
        <div className="border border-white/10 p-4">
          <p className="text-white/40 text-[10px] tracking-widest uppercase mb-2" style={G}>Bars Earned</p>
          <div className="flex items-baseline gap-2">
            <span className="text-brand-green text-2xl font-bold" style={G}>{myBars.amount}</span>
            <span className="text-white/30 text-xs" style={I}>Bars</span>
            {myBars.status === 'locked' && (
              <span className="text-yellow-400 text-[9px] tracking-widest uppercase border border-yellow-400/30 px-1.5 py-0.5 ml-1" style={G}>
                Locked — Upgrade to unlock
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expected vs actual */}
      {summary.steps !== null && summary.steps > 0 && (
        <div className="border border-white/10 p-4 space-y-1">
          <p className="text-white/40 text-[10px] tracking-widest uppercase mb-2" style={G}>Context</p>
          <p className="text-white/30 text-xs" style={I}>
            Expected: <span className="text-white/60">{summary.expected_label ?? 'N/A'}</span>
          </p>
          <p className="text-white/30 text-xs" style={I}>
            Actual: <span className="text-white/60">{summary.actual_label ?? 'N/A'}</span>
          </p>
          <p className="text-white/30 text-xs" style={I}>
            Steps: <span className="text-white/60">{summary.steps}</span>
          </p>
        </div>
      )}

      {/* Explanation */}
      {summary.explanation_short && (
        <div className="border border-white/10 p-4">
          <p className="text-white/50 text-sm leading-relaxed" style={I}>
            {summary.explanation_short}
          </p>
        </div>
      )}

      {/* Streaks */}
      {myStreaks && (myStreaks.win_streak_after > 1 || myStreaks.beat_expected_streak_after > 1) && (
        <div className="border border-brand-green/20 bg-brand-green/5 p-4 space-y-1">
          <p className="text-brand-green text-[10px] tracking-widest uppercase mb-1" style={G}>Streaks</p>
          {myStreaks.win_streak_after > 1 && (
            <p className="text-white/60 text-xs" style={I}>
              Win streak: <span className="text-brand-green font-bold">{myStreaks.win_streak_after}</span>
            </p>
          )}
          {myStreaks.beat_expected_streak_after > 1 && (
            <p className="text-white/60 text-xs" style={I}>
              Beat-expected streak: <span className="text-brand-green font-bold">{myStreaks.beat_expected_streak_after}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
