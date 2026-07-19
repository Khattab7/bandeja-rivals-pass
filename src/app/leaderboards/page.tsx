import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

const METRIC_LABELS: Record<string, string> = {
  current_rating:                       'Rating',
  rating_gain_total:                    'Rating Gain',
  current_winning_streak:               'Win Streak',
  best_winning_streak:                  'Best Streak',
  current_beat_expected_streak:         'Beat-Expected Streak',
  rated_match_activity:                 'Matches Played',
  bars_active_balance:                  'Active Bars',
  bars_total_earned_including_locked:   'Total Bars Earned',
  current_team_rating:                  'Team Rating',
  team_performance_score:               'Performance',
  win_rate:                             'Win Rate',
};

export default async function LeaderboardsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  const { data: configs } = await supabase
    .from('leaderboard_configs')
    .select('id, name, slug, entity_type, metric_key, time_window, scope_type, scope_city, is_featured, last_refreshed_at, display_order')
    .eq('is_active', true)
    .in('visible_to', ['logged_in', 'paid_only'])
    .order('display_order');

  const playerConfigs = (configs ?? []).filter((c) => c.entity_type === 'player');
  const teamConfigs   = (configs ?? []).filter((c) => c.entity_type === 'team');

  // Fetch top-3 entries per featured config for preview cards
  const featuredIds = (configs ?? []).filter((c) => c.is_featured).map((c) => c.id);
  const previewData: Record<string, Array<{ rank: number; name: string; metric_value: number }>> = {};

  if (featuredIds.length > 0) {
    const { data: entries } = await supabase
      .from('leaderboard_entries')
      .select('config_id, rank, player_id, team_id, metric_value')
      .in('config_id', featuredIds)
      .eq('is_active_eligible', true)
      .eq('hidden_by_admin', false)
      .lte('rank', 3)
      .order('rank');

    // Collect player + team IDs
    const pIds = [...new Set((entries ?? []).map((e) => e.player_id).filter(Boolean))] as string[];
    const tIds = [...new Set((entries ?? []).map((e) => e.team_id).filter(Boolean))] as string[];

    const [{ data: players }, { data: teams }] = await Promise.all([
      pIds.length > 0 ? supabase.from('player_profiles').select('id, first_name, last_name').in('id', pIds) : Promise.resolve({ data: [] }),
      tIds.length > 0 ? supabase.from('teams').select('id, name, auto_name').in('id', tIds) : Promise.resolve({ data: [] }),
    ]);

    const nameById: Record<string, string> = {};
    for (const p of players ?? []) nameById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    for (const t of teams ?? []) nameById[t.id] = t.name ?? t.auto_name ?? 'Unnamed';

    for (const e of entries ?? []) {
      const entityId = e.player_id ?? e.team_id ?? '';
      if (!previewData[e.config_id]) previewData[e.config_id] = [];
      previewData[e.config_id].push({
        rank: e.rank,
        name: nameById[entityId] ?? '—',
        metric_value: e.metric_value,
      });
    }
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Rankings</span>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-10">

        {/* ── Featured leaderboards ─────────────────────────────── */}
        {featuredIds.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Featured
            </h2>
            <div className="space-y-3">
              {(configs ?? []).filter((c) => c.is_featured).map((c) => {
                const preview = previewData[c.id] ?? [];
                return (
                  <Link
                    key={c.id}
                    href={`/leaderboards/${c.slug}`}
                    className="block border border-white/10 hover:border-white/25 transition-colors overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 pt-4 pb-3">
                      <div>
                        <p className="text-white text-base tracking-widest uppercase" style={G}>{c.name}</p>
                        <p className="text-white/30 text-xs mt-0.5" style={I}>
                          {c.entity_type === 'player' ? 'Players' : 'Teams'} · {formatWindow(c.time_window)}
                        </p>
                      </div>
                      <span className="text-white/40 text-sm">→</span>
                    </div>
                    {preview.length > 0 && (
                      <div className="border-t border-white/5 divide-y divide-white/5">
                        {preview.map((row) => (
                          <div key={row.rank} className="flex items-center justify-between px-4 py-2">
                            <div className="flex items-center gap-3">
                              <span className={`text-xs w-5 text-center font-mono ${row.rank === 1 ? 'text-brand-green' : 'text-white/30'}`} style={G}>
                                {row.rank}
                              </span>
                              <span className="text-white text-sm" style={I}>{row.name}</span>
                            </div>
                            <span className="text-white/50 text-xs font-mono" style={I}>
                              {formatMetric(c.metric_key, row.metric_value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {preview.length === 0 && (
                      <p className="text-white/20 text-xs px-4 pb-3" style={I}>No eligible players yet</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Player leaderboards ───────────────────────────────── */}
        {playerConfigs.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Player Rankings
            </h2>
            <div className="space-y-2">
              {playerConfigs.map((c) => (
                <Link
                  key={c.id}
                  href={`/leaderboards/${c.slug}`}
                  className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-white/25 transition-colors"
                >
                  <div>
                    <p className="text-white text-sm tracking-wider uppercase" style={G}>{c.name}</p>
                    <p className="text-white/30 text-[11px] mt-0.5" style={I}>{formatWindow(c.time_window)}</p>
                  </div>
                  <span className="text-white/40 text-sm">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Team leaderboards ─────────────────────────────────── */}
        {teamConfigs.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Team Rankings
            </h2>
            <div className="space-y-2">
              {teamConfigs.map((c) => (
                <Link
                  key={c.id}
                  href={`/leaderboards/${c.slug}`}
                  className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-white/25 transition-colors"
                >
                  <div>
                    <p className="text-white text-sm tracking-wider uppercase" style={G}>{c.name}</p>
                    <p className="text-white/30 text-[11px] mt-0.5" style={I}>{formatWindow(c.time_window)}</p>
                  </div>
                  <span className="text-white/40 text-sm">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {(configs ?? []).length === 0 && (
          <div className="text-center py-20">
            <p className="text-white text-xl tracking-widest uppercase" style={G}>Coming Soon</p>
            <p className="text-white/30 text-sm mt-2" style={I}>Rankings update daily after matches are processed.</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
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
  if (metricKey.includes('streak')) return `${Math.round(value)}`;
  if (metricKey.includes('bars')) return `${Math.round(value)} Bars`;
  return Math.round(value).toString();
}
