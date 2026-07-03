'use client';

import { useState } from 'react';
import Link from 'next/link';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type Profile = {
  id: string;
  displayName: string;
  username: string | null;
  city: string | null;
  primary_area: string | null;
  gender: string | null;
  dominant_hand: string | null;
  preferred_side: string | null;
  years_playing_padel: number | null;
  match_type_preference: string | null;
  current_rating: number;
  starting_rating: number;
  starting_rating_source: string;
  profile_completion_percent: number;
  match_ready: boolean;
  is_suspended: boolean;
  public_player_id: string | null;
};

type Stats = {
  matches_played: number;
  rated_matches_played: number;
  friendly_matches_played: number;
  wins: number;
  losses: number;
  current_winning_streak: number;
  best_winning_streak: number;
  current_beat_expected_streak: number;
  best_beat_expected_streak: number;
  times_beat_expected: number;
  upset_wins: number;
  bars_active_balance: number;
  bars_locked_pending: number;
  bars_total_earned: number;
  highest_rating_ever: number | null;
  lowest_rating_ever: number | null;
  cached_recent_form: string | null;
} | null;

type Team = { id: string; name: string; rating: number; status: string; isCaptain: boolean };

type RatingEvent = {
  id: string;
  event_type: string;
  rating_before: number;
  rating_change: number;
  rating_after: number;
  created_at: string;
};

type MemberInfo = { is_active: boolean; valid_until: string; member_id_ref: string } | null;

export default function ProfileClient({
  profile,
  stats,
  teams,
  ratingEvents,
  memberInfo,
  isOwnProfile,
  appUrl,
}: {
  profile: Profile;
  stats: Stats;
  teams: Team[];
  ratingEvents: RatingEvent[];
  memberInfo: MemberInfo;
  isOwnProfile: boolean;
  appUrl: string;
}) {
  type Tab = 'overview' | 'stats' | 'pass';
  const tabs: Tab[] = isOwnProfile ? ['overview', 'stats', 'pass'] : ['overview', 'stats'];
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const winRate = (stats?.rated_matches_played ?? 0) > 0
    ? Math.round(((stats?.wins ?? 0) / (stats?.rated_matches_played ?? 1)) * 100)
    : 0;

  const passActive = memberInfo?.is_active && memberInfo.valid_until && new Date(memberInfo.valid_until) > new Date();
  const passExpired = memberInfo && !passActive;

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  }

  function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return formatDate(d);
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full">

      {/* ── Hero card ──────────────────────────────────────── */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-start gap-4">
          {/* Avatar placeholder */}
          <div className="w-16 h-16 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: passActive ? '#8CF702' : '#444', background: '#1a1a1a' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill={passActive ? '#8CF702' : '#555'}>
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-lg tracking-wide uppercase" style={G}>
                {profile.displayName}
              </h1>
              {passActive && (
                <span className="text-[8px] tracking-widest px-2 py-0.5 uppercase" style={{ ...G, background: 'rgba(140,247,2,0.12)', color: '#8CF702', border: '1px solid rgba(140,247,2,0.4)' }}>
                  RIVAL
                </span>
              )}
              {profile.is_suspended && (
                <span className="text-[8px] tracking-widest px-2 py-0.5 uppercase" style={{ ...G, background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)' }}>
                  SUSPENDED
                </span>
              )}
            </div>
            {profile.username && (
              <p className="text-white/30 text-xs mt-0.5" style={I}>@{profile.username}</p>
            )}
            {(profile.city || profile.primary_area) && (
              <p className="text-white/40 text-xs mt-1" style={I}>
                {profile.city}{profile.primary_area ? ` · ${profile.primary_area}` : ''}
              </p>
            )}
          </div>

          {/* Rating */}
          <div className="text-right flex-shrink-0">
            <div className="text-white text-3xl font-bold leading-none" style={G}>
              {profile.current_rating}
            </div>
            <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
            {stats?.cached_recent_form && (
              <div className="flex gap-0.5 justify-end mt-1.5">
                {stats.cached_recent_form.split('').slice(0, 5).map((c, i) => (
                  <span key={i} className="w-3 h-3 text-[7px] flex items-center justify-center font-bold"
                    style={{ color: c === 'W' ? '#8CF702' : '#ef4444' }}>
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick stat chips */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { label: 'Rated', value: stats?.rated_matches_played ?? 0 },
            { label: 'Wins', value: stats?.wins ?? 0, color: '#8CF702' },
            { label: 'Win %', value: `${winRate}%` },
            { label: 'Streak', value: stats?.current_winning_streak ?? 0 },
          ].map((s) => (
            <div key={s.label} className="border border-white/10 px-3 py-1.5 text-center" style={{ background: '#111' }}>
              <div className="text-[8px] tracking-widest uppercase text-white/30" style={G}>{s.label}</div>
              <div className="text-sm font-bold" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-[10px] tracking-widest uppercase transition-colors"
            style={{
              ...G,
              color: activeTab === tab ? '#8CF702' : 'rgba(255,255,255,0.3)',
              borderBottom: activeTab === tab ? '2px solid #8CF702' : '2px solid transparent',
            }}
          >
            {tab === 'pass' ? 'Rivals Pass' : tab}
          </button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="px-4 py-5 space-y-6">

          {/* Teams */}
          {teams.length > 0 && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Teams</h3>
              <div className="space-y-2">
                {teams.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${t.id}`}
                    className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-white/20 transition-colors"
                    style={{ background: '#111' }}
                  >
                    <div>
                      <p className="text-white text-sm tracking-wide" style={G}>{t.name}</p>
                      {t.isCaptain && <p className="text-brand-green text-[9px] tracking-widest uppercase mt-0.5" style={G}>Captain</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold" style={G}>{t.rating}</div>
                      <div className="text-white/30 text-[8px]" style={G}>Rating</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent rating history */}
          {ratingEvents.length > 0 && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Rating History</h3>
              <div className="space-y-1.5">
                {ratingEvents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 border border-white/5" style={{ background: '#0d0d0d' }}>
                    <div>
                      <span className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
                        {e.event_type.replace('_', ' ')}
                      </span>
                      <span className="text-white/20 text-[9px] ml-2" style={I}>{formatRelative(e.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-bold"
                        style={{ ...G, color: e.rating_change > 0 ? '#8CF702' : e.rating_change < 0 ? '#ef4444' : '#666' }}
                      >
                        {e.rating_change > 0 ? '+' : ''}{e.rating_change}
                      </span>
                      <span className="text-white/50 text-sm font-bold" style={G}>{e.rating_after}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Playing info */}
          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Playing Info</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Hand', value: profile.dominant_hand ? profile.dominant_hand.charAt(0).toUpperCase() + profile.dominant_hand.slice(1) : '—' },
                { label: 'Side', value: profile.preferred_side ? profile.preferred_side.replace('_', ' ') : '—' },
                { label: 'Years Playing', value: profile.years_playing_padel != null ? `${profile.years_playing_padel}y` : '—' },
                { label: 'Prefers', value: profile.match_type_preference ?? '—' },
              ].map((item) => (
                <div key={item.label} className="border border-white/10 px-3 py-2" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>{item.label}</div>
                  <div className="text-white text-sm mt-0.5 capitalize" style={I}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Bars teaser (own profile only) */}
          {isOwnProfile && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>BANDEJA Bars</h3>
              <Link
                href="/bars"
                className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-brand-green/30 transition-colors"
                style={{ background: '#111' }}
              >
                <div>
                  <p className="text-white/50 text-[9px] tracking-widest uppercase" style={G}>Active Balance</p>
                  <p className="text-brand-green text-xl font-bold mt-0.5" style={G}>
                    {(stats?.bars_active_balance ?? 0).toFixed(1)} <span className="text-xs text-brand-green/60">BARS</span>
                  </p>
                  {(stats?.bars_locked_pending ?? 0) > 0 && (
                    <p className="text-white/30 text-[9px] mt-0.5" style={I}>
                      + {(stats?.bars_locked_pending ?? 0).toFixed(1)} locked
                    </p>
                  )}
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/30" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
            </section>
          )}

          {/* Not match ready warning */}
          {isOwnProfile && !profile.match_ready && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <p className="text-yellow-400 text-xs tracking-wide" style={I}>
                Your profile is incomplete. Complete it to start playing rated matches.
              </p>
              <Link href="/onboarding" className="text-yellow-400 text-[10px] tracking-widest uppercase mt-2 inline-block hover:text-yellow-300 transition-colors" style={G}>
                Complete Profile →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Stats tab ─────────────────────────────────────── */}
      {activeTab === 'stats' && (
        <div className="px-4 py-5 space-y-6">
          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Match Record</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Rated', value: stats?.rated_matches_played ?? 0 },
                { label: 'Wins', value: stats?.wins ?? 0, color: '#8CF702' },
                { label: 'Losses', value: stats?.losses ?? 0, color: '#ef4444' },
                { label: 'Win Rate', value: `${winRate}%` },
                { label: 'Friendly', value: stats?.friendly_matches_played ?? 0 },
                { label: 'Total', value: stats?.matches_played ?? 0 },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>{s.label}</div>
                  <div className="text-lg font-bold mt-0.5" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Streaks</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Current Win Streak', value: stats?.current_winning_streak ?? 0, color: '#8CF702' },
                { label: 'Best Win Streak', value: stats?.best_winning_streak ?? 0 },
                { label: 'Beat Expected Streak', value: stats?.current_beat_expected_streak ?? 0, color: '#8CF702' },
                { label: 'Best Beat Expected', value: stats?.best_beat_expected_streak ?? 0 },
                { label: 'Times Beat Expected', value: stats?.times_beat_expected ?? 0 },
                { label: 'Upset Wins', value: stats?.upset_wins ?? 0 },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase leading-tight" style={G}>{s.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Rating Extremes</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Current', value: profile.current_rating },
                { label: 'Highest Ever', value: stats?.highest_rating_ever ?? profile.current_rating, color: '#8CF702' },
                { label: 'Starting', value: profile.starting_rating, sub: profile.starting_rating_source === 'rating_guess' ? 'from guess' : profile.starting_rating_source === 'admin_override' ? 'admin set' : 'default' },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase leading-tight" style={G}>{s.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                  {s.sub && <div className="text-white/20 text-[8px] mt-0.5" style={I}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Pass tab (own profile only) ───────────────────── */}
      {activeTab === 'pass' && isOwnProfile && (
        <div className="px-4 py-5 space-y-4">

          {/* Pass status */}
          <div
            className="border p-5 text-center"
            style={{
              background: passActive ? 'rgba(140,247,2,0.05)' : '#111',
              borderColor: passActive ? 'rgba(140,247,2,0.3)' : '#333',
            }}
          >
            {passActive ? (
              <>
                <div className="text-brand-green text-[9px] tracking-widest uppercase mb-2" style={G}>RIVAL Pass Active</div>
                <div className="text-white text-xl font-bold" style={G}>
                  {memberInfo!.member_id_ref}
                </div>
                <div className="text-white/40 text-xs mt-2" style={I}>
                  Valid until {formatDate(memberInfo!.valid_until)}
                </div>
              </>
            ) : passExpired ? (
              <>
                <div className="text-orange-400 text-[9px] tracking-widest uppercase mb-2" style={G}>Pass Expired</div>
                <div className="text-white/50 text-sm" style={I}>
                  Your membership expired on {formatDate(memberInfo!.valid_until)}
                </div>
                <div className="text-white/30 text-xs mt-2" style={I}>Contact admin to renew</div>
              </>
            ) : (
              <>
                <div className="text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>Free Player</div>
                <div className="text-white/50 text-sm" style={I}>
                  Upgrade to RIVAL to earn active Bars and access premium features.
                </div>
              </>
            )}
          </div>

          {/* Apple Wallet button — paid members only */}
          {passActive && (
            <Link
              href="/pass"
              className="flex items-center justify-center gap-3 border border-white/20 py-4 hover:border-white/40 transition-colors"
              style={{ background: '#111' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="text-white text-sm tracking-widest uppercase" style={G}>View in Apple Wallet</span>
            </Link>
          )}

          {/* Bars summary */}
          <div className="border border-white/10 px-4 py-4" style={{ background: '#111' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>BANDEJA Bars</p>
                <p className="text-brand-green text-2xl font-bold mt-1" style={G}>
                  {(stats?.bars_active_balance ?? 0).toFixed(1)}
                </p>
                {(stats?.bars_locked_pending ?? 0) > 0 && (
                  <p className="text-white/30 text-[10px] mt-1" style={I}>
                    {(stats?.bars_locked_pending ?? 0).toFixed(1)} locked
                    {!passActive ? ' — upgrade to unlock' : ''}
                  </p>
                )}
              </div>
              <Link
                href="/bars"
                className="text-brand-green text-[10px] tracking-widest uppercase border border-brand-green/30 px-3 py-1.5 hover:bg-brand-green/5 transition-colors"
                style={G}
              >
                View History
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
