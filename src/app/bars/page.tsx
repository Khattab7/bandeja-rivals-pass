import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}

function formatRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'match_reward':       return 'Match Reward';
    case 'admin_adjustment':   return 'Admin Adjustment';
    case 'admin_reversal':     return 'Admin Reversal';
    case 'unlock_locked_bars': return 'Bars Unlocked';
    case 'redemption':         return 'Redeemed';
    case 'quest_reward':       return 'Quest Reward';
    default:                   return source;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':   return '#8CF702';
    case 'locked':   return '#f97316';
    case 'expired':  return '#555';
    case 'reversed': return '#ef4444';
    case 'redeemed': return '#60a5fa';
    default:         return '#888';
  }
}

export default async function BarsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed, member_id')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Load player stats for balances
  const { data: stats } = await supabase
    .from('player_stats')
    .select('bars_active_balance, bars_locked_pending, bars_total_earned, bars_lifetime_earned')
    .eq('player_id', profile.id)
    .single();

  // Load bars ledger (all entries, newest first)
  const { data: ledger } = await supabase
    .from('bars_ledger')
    .select('id, amount, status, source_type, was_paid_at_submission, locked_reason, expires_at, unlocked_at, reversed_at, redeemed_at, created_at')
    .eq('player_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // Check membership
  let isPaid = false;
  if (profile.member_id) {
    const { data: member } = await supabase
      .from('members')
      .select('is_active, valid_until')
      .eq('id', profile.member_id)
      .single();
    isPaid = !!(member?.is_active && member.valid_until && new Date(member.valid_until) > new Date());
  }

  const activeBalance = stats?.bars_active_balance ?? 0;
  const lockedBalance = stats?.bars_locked_pending ?? 0;
  const totalEarned = stats?.bars_total_earned ?? 0;

  const activeEntries = (ledger ?? []).filter((e) => e.status === 'active');
  const lockedEntries = (ledger ?? []).filter((e) => e.status === 'locked');

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>BANDEJA Bars</span>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-6">

        {/* ── Balance cards ─────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-brand-green/30 p-4 col-span-2" style={{ background: 'rgba(140,247,2,0.04)' }}>
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Active Balance</p>
            <p className="text-brand-green text-4xl font-bold mt-1 leading-none" style={G}>
              {activeBalance % 1 === 0 ? activeBalance.toFixed(0) : activeBalance.toFixed(1)}
            </p>
            <p className="text-brand-green/50 text-[9px] tracking-widest uppercase mt-1" style={G}>BARS</p>
          </div>
          <div className="space-y-2">
            <div className="border border-white/10 p-3" style={{ background: '#111' }}>
              <p className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>Locked</p>
              <p className="text-orange-400 text-lg font-bold mt-0.5" style={G}>
                {lockedBalance % 1 === 0 ? lockedBalance.toFixed(0) : lockedBalance.toFixed(1)}
              </p>
            </div>
            <div className="border border-white/10 p-3" style={{ background: '#111' }}>
              <p className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>Total Earned</p>
              <p className="text-white text-lg font-bold mt-0.5" style={G}>
                {totalEarned % 1 === 0 ? totalEarned.toFixed(0) : totalEarned.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* ── What are Bars ─────────────────────────────── */}
        <div className="border border-white/10 px-4 py-3" style={{ background: '#111' }}>
          <p className="text-white/40 text-[9px] tracking-widest uppercase mb-1" style={G}>What are BANDEJA Bars?</p>
          <p className="text-white/50 text-xs leading-relaxed" style={I}>
            Bars are earned from rated matches as an active RIVAL member. They can be redeemed for rewards from BANDEJA partners.
            {!isPaid && ' Upgrade to RIVAL to earn active Bars.'}
          </p>
        </div>

        {/* ── Locked bars unlock info (free players) ────── */}
        {!isPaid && lockedBalance > 0 && (
          <div className="border border-orange-500/20 bg-orange-500/5 px-4 py-3">
            <p className="text-orange-400 text-[10px] tracking-widest uppercase mb-1" style={G}>
              {lockedBalance.toFixed(1)} Bars Waiting
            </p>
            <p className="text-white/50 text-xs leading-relaxed" style={I}>
              You've earned Bars but they're locked because you're a free player.
              Become a RIVAL member to unlock your eligible Bars before they expire.
            </p>
          </div>
        )}

        {/* ── Redemption section ────────────────────────── */}
        <section>
          <h2 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Redeem Bars</h2>
          <div className="border border-dashed border-white/10 px-5 py-8 text-center" style={{ background: '#0a0a0a' }}>
            <div className="text-white/20 text-3xl mb-3" style={G}>◎</div>
            <p className="text-white/50 text-sm tracking-wide" style={G}>Redemption Partners Coming Soon</p>
            <p className="text-white/25 text-xs mt-2 max-w-xs mx-auto" style={I}>
              Bars will be redeemable for rewards at padel clubs, gear stores, and BANDEJA partner venues.
            </p>
          </div>
        </section>

        {/* ── Active entries ────────────────────────────── */}
        {activeEntries.length > 0 && (
          <section>
            <h2 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Active Bars</h2>
            <div className="space-y-1.5">
              {activeEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border border-white/5" style={{ background: '#0d0d0d' }}>
                  <div>
                    <p className="text-white/60 text-[10px] tracking-widest uppercase" style={G}>{sourceLabel(e.source_type)}</p>
                    <p className="text-white/25 text-[9px] mt-0.5" style={I}>{formatRelative(e.created_at)}</p>
                    {e.expires_at && (
                      <p className="text-white/20 text-[8px] mt-0.5" style={I}>
                        Expires {formatDate(e.expires_at)}
                      </p>
                    )}
                  </div>
                  <span className="text-brand-green text-sm font-bold" style={G}>
                    +{e.amount % 1 === 0 ? e.amount.toFixed(0) : e.amount.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Locked entries ────────────────────────────── */}
        {lockedEntries.length > 0 && (
          <section>
            <h2 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Locked Bars</h2>
            <div className="space-y-1.5">
              {lockedEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border border-white/5 opacity-70" style={{ background: '#0d0d0d' }}>
                  <div>
                    <p className="text-orange-400/70 text-[10px] tracking-widest uppercase" style={G}>{sourceLabel(e.source_type)}</p>
                    <p className="text-white/25 text-[9px] mt-0.5" style={I}>{formatRelative(e.created_at)}</p>
                    {e.expires_at && (
                      <p style={{ color: new Date(e.expires_at) < new Date() ? '#ef4444' : '#555', ...I }}
                        className="text-[8px] mt-0.5">
                        {new Date(e.expires_at) < new Date() ? 'Expired' : `Expires ${formatDate(e.expires_at)}`}
                      </p>
                    )}
                  </div>
                  <span className="text-orange-400/70 text-sm font-bold" style={G}>
                    {e.amount % 1 === 0 ? e.amount.toFixed(0) : e.amount.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Full history ──────────────────────────────── */}
        {(ledger ?? []).filter((e) => !['active', 'locked'].includes(e.status)).length > 0 && (
          <section>
            <h2 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>History</h2>
            <div className="space-y-1.5">
              {(ledger ?? []).filter((e) => !['active', 'locked'].includes(e.status)).map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border border-white/5 opacity-50" style={{ background: '#0d0d0d' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>{sourceLabel(e.source_type)}</p>
                      <span className="text-[8px] tracking-widest uppercase px-1.5 py-0.5" style={{ ...G, color: statusColor(e.status), border: `1px solid ${statusColor(e.status)}40` }}>
                        {e.status}
                      </span>
                    </div>
                    <p className="text-white/20 text-[9px] mt-0.5" style={I}>{formatRelative(e.created_at)}</p>
                  </div>
                  <span className="text-white/30 text-sm font-bold" style={G}>
                    {e.amount % 1 === 0 ? e.amount.toFixed(0) : e.amount.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {(!ledger || ledger.length === 0) && (
          <div className="text-center py-16">
            <p className="text-white/20 text-lg tracking-widest uppercase" style={G}>No Bars Yet</p>
            <p className="text-white/15 text-sm mt-2" style={I}>
              Play rated matches to earn your first Bars.
            </p>
            <Link href="/play" className="inline-block mt-6 text-brand-green text-[10px] tracking-widest uppercase border border-brand-green/30 px-5 py-2.5 hover:bg-brand-green/5 transition-colors" style={G}>
              Find a Match →
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
