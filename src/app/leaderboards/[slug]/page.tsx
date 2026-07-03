import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

export default async function LeaderboardDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  const { data: config } = await supabase
    .from('leaderboard_configs')
    .select('id, name, entity_type, metric_key, time_window, scope_type, scope_city, is_active, is_frozen, last_refreshed_at')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!config) notFound();

  const { data: entries } = await supabase
    .from('leaderboard_entries')
    .select('id, rank, previous_rank, rank_change, player_id, team_id, metric_value, is_active_eligible')
    .eq('config_id', config.id)
    .eq('is_active_eligible', true)
    .eq('hidden_by_admin', false)
    .order('rank');

  // Resolve names
  const pIds = [...new Set((entries ?? []).map((e) => e.player_id).filter(Boolean))] as string[];
  const tIds = [...new Set((entries ?? []).map((e) => e.team_id).filter(Boolean))] as string[];

  const [{ data: players }, { data: teams }] = await Promise.all([
    pIds.length > 0 ? supabase.from('player_profiles').select('id, first_name, last_name, current_rating').in('id', pIds) : Promise.resolve({ data: [] }),
    tIds.length > 0 ? supabase.from('teams').select('id, name, auto_name, cached_current_team_rating').in('id', tIds) : Promise.resolve({ data: [] }),
  ]);

  type PlayerRow = { id: string; first_name: string | null; last_name: string | null; current_rating: number };
  type TeamRow = { id: string; name: string | null; auto_name: string | null; cached_current_team_rating: number | null };

  const playerById: Record<string, PlayerRow> = {};
  const teamById: Record<string, TeamRow> = {};
  for (const p of (players as PlayerRow[] | null) ?? []) playerById[p.id] = p;
  for (const t of (teams as TeamRow[] | null) ?? []) teamById[t.id] = t;

  // Find viewer's own rank in this leaderboard
  const myEntry = (entries ?? []).find((e) =>
    e.player_id === profile.id || e.team_id !== null
  );
  const myRank = myEntry?.rank ?? null;

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-20">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <Link href="/leaderboards" className="text-white/40 hover:text-white/70 text-sm">←</Link>
        <BandejaLogo width={100} height={26} />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-6">

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>{config.name}</h1>
          <div className="flex items-center gap-3">
            <span className="text-white/30 text-xs" style={I}>
              {config.entity_type === 'player' ? 'Players' : 'Teams'} · {formatWindow(config.time_window)}
            </span>
            {config.is_frozen && (
              <span className="text-yellow-400 text-[9px] tracking-widest uppercase border border-yellow-400/30 px-1.5 py-0.5" style={G}>
                Frozen
              </span>
            )}
          </div>
          {config.last_refreshed_at && (
            <p className="text-white/20 text-[11px]" style={I}>
              Updated {formatRelativeTime(config.last_refreshed_at)}
            </p>
          )}
        </div>

        {/* ── Viewer's rank (if in this board) ──────────────────── */}
        {config.entity_type === 'player' && myEntry && (
          <div className="border border-brand-green/30 bg-brand-green/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-brand-green text-[9px] tracking-widest uppercase" style={G}>Your Rank</p>
              <p className="text-white text-2xl tracking-widest" style={G}>#{myEntry.rank}</p>
            </div>
            <div className="text-right">
              <RankChangeBadge change={myEntry.rank_change ?? null} />
              <p className="text-white/50 text-xs mt-0.5" style={I}>
                {formatMetric(config.metric_key, myEntry.metric_value)}
              </p>
            </div>
          </div>
        )}

        {/* ── Leaderboard table ─────────────────────────────────── */}
        {(entries ?? []).length > 0 ? (
          <section>
            <div className="divide-y divide-white/5">
              {(entries ?? []).map((entry) => {
                const isMe = entry.player_id === profile.id;
                const entityId = entry.player_id ?? entry.team_id ?? '';
                let displayName = '—';
                let subLine = '';

                if (entry.player_id && playerById[entry.player_id]) {
                  const p = playerById[entry.player_id];
                  displayName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || '—';
                  subLine = `Rating ${p.current_rating}`;
                } else if (entry.team_id && teamById[entry.team_id]) {
                  const t = teamById[entry.team_id];
                  displayName = t.name ?? t.auto_name ?? 'Unnamed';
                  subLine = `Team Rating ${Math.round(t.cached_current_team_rating ?? 0)}`;
                }

                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between py-3 px-1 ${isMe ? 'bg-brand-green/5' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank number */}
                      <div className="w-8 text-center">
                        {entry.rank <= 3 ? (
                          <span className={`text-base font-bold ${
                            entry.rank === 1 ? 'text-yellow-400' :
                            entry.rank === 2 ? 'text-white/60' :
                            'text-orange-400/80'
                          }`} style={G}>
                            {entry.rank === 1 ? '1st' : entry.rank === 2 ? '2nd' : '3rd'}
                          </span>
                        ) : (
                          <span className="text-white/30 text-sm font-mono" style={G}>
                            {entry.rank}
                          </span>
                        )}
                      </div>
                      {/* Name + subline */}
                      <div>
                        <p className={`text-sm ${isMe ? 'text-brand-green' : 'text-white'}`} style={I}>
                          {displayName} {isMe && '(you)'}
                        </p>
                        {subLine && (
                          <p className="text-white/30 text-[11px]" style={I}>{subLine}</p>
                        )}
                      </div>
                    </div>
                    {/* Metric + rank change */}
                    <div className="text-right">
                      <p className="text-white text-sm font-mono" style={I}>
                        {formatMetric(config.metric_key, entry.metric_value)}
                      </p>
                      <RankChangeBadge change={entry.rank_change ?? null} small />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="text-center py-16">
            <p className="text-white text-lg tracking-widest uppercase" style={G}>No Rankings Yet</p>
            <p className="text-white/30 text-sm mt-2" style={I}>
              Rankings update daily. Play rated matches to appear here.
            </p>
          </div>
        )}

      </main>

      <BottomNav />
    </div>
  );
}

function RankChangeBadge({ change, small = false }: { change: number | null; small?: boolean }) {
  if (change === null) return null;
  if (change === 0) return null;
  const up = change > 0;
  const size = small ? 'text-[10px]' : 'text-xs';
  return (
    <span className={`${size} ${up ? 'text-brand-green' : 'text-red-400'}`} style={{ fontFamily: 'var(--font-inter)' }}>
      {up ? `↑${change}` : `↓${Math.abs(change)}`}
    </span>
  );
}

function formatWindow(window: string): string {
  const map: Record<string, string> = {
    today: 'Today',
    weekly: 'This Week',
    monthly: 'This Month',
    season: 'This Season',
    all_time: 'All Time',
    custom: 'Custom Period',
  };
  return map[window] ?? window;
}

function formatMetric(metricKey: string, value: number): string {
  if (metricKey === 'win_rate') return `${value.toFixed(1)}%`;
  if (metricKey.includes('streak')) return `${Math.round(value)} streak`;
  if (metricKey.includes('bars')) return `${Math.round(value)} Bars`;
  if (metricKey === 'rated_match_activity') return `${Math.round(value)} played`;
  return Math.round(value).toString();
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
