'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { leaveTeam, archiveTeam, cancelInvitation } from '@/app/actions/teams';
import type { Database } from '@/lib/types';

type TeamRow = Database['public']['Tables']['teams']['Row'];
type TeamStats = Database['public']['Tables']['team_stats']['Row'];

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface Member {
  player_id: string;
  role: 'captain' | 'member';
  joined_at: string;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    current_rating: number;
    city: string | null;
    primary_area: string | null;
    avatar_url: string | null;
  } | null;
}

interface PendingInvite {
  id: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  invitee_player_id: string | null;
  message: string | null;
  created_at: string;
  inviteeProfile: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface Props {
  team: TeamRow;
  myPlayerId: string;
  myRole: 'captain' | 'member';
  members: Member[];
  stats: TeamStats | null;
  pendingInvite: PendingInvite | null;
}

export default function TeamDetailClient({ team, myPlayerId, myRole, members, stats, pendingInvite }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<'leave' | 'archive' | null>(null);

  const isCaptain = myRole === 'captain';
  const isActive = team.status === 'active';
  const teamName = team.name || team.auto_name || 'Unnamed Team';

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const res = await leaveTeam(team.id);
      if (res.error) { setError(res.error); return; }
      router.push('/teams');
    });
  }

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const res = await archiveTeam(team.id);
      if (res.error) { setError(res.error); return; }
      router.push('/teams');
    });
  }

  function handleCancelInvite() {
    if (!pendingInvite) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelInvitation(pendingInvite.id);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">

      {/* ── Team Header ──────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-white text-2xl tracking-widest uppercase leading-tight" style={G}>
              {teamName}
            </h1>
            <p className="text-white/30 text-[10px] tracking-widest mt-1" style={G}>
              {team.public_team_id}
            </p>
          </div>
          {isActive && team.cached_current_team_rating && (
            <div className="text-right">
              <div className="text-brand-green text-3xl font-bold leading-none" style={G}>
                {team.cached_current_team_rating}
              </div>
              <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Team Rating</div>
            </div>
          )}
        </div>

        {/* Status badge */}
        {!isActive && (
          <div className="inline-flex">
            <span className="text-yellow-400/70 text-[9px] tracking-widest uppercase border border-yellow-400/30 px-2 py-1" style={G}>
              {team.status === 'pending_partner_acceptance' ? 'Waiting for partner' : team.status}
            </span>
          </div>
        )}
      </div>

      {/* ── Team Stats ───────────────────────────────────────── */}
      {isActive && stats && (
        <div className="border border-white/10 p-4 space-y-3">
          <p className="text-brand-green text-[10px] tracking-[0.3em] uppercase" style={G}>Team Record</p>
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-white text-2xl font-bold" style={G}>{stats.wins}</div>
              <div className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Wins</div>
            </div>
            <div className="text-center">
              <div className="text-white text-2xl font-bold" style={G}>{stats.losses}</div>
              <div className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Losses</div>
            </div>
            <div className="text-center">
              <div className="text-white text-2xl font-bold" style={G}>{stats.matches_played}</div>
              <div className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Played</div>
            </div>
            {stats.current_win_streak > 0 && (
              <div className="text-center">
                <div className="text-brand-green text-2xl font-bold" style={G}>{stats.current_win_streak}</div>
                <div className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Streak</div>
              </div>
            )}
          </div>
          {stats.cached_recent_form && (
            <div className="flex items-center gap-2">
              <span className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Recent</span>
              <div className="flex gap-1">
                {stats.cached_recent_form.split('').slice(0, 5).map((c, i) => (
                  <span key={i}
                    className="w-5 h-5 text-[9px] flex items-center justify-center font-bold border"
                    style={{
                      color: c === 'W' ? '#8CF702' : '#ef4444',
                      borderColor: c === 'W' ? '#8CF702' : '#ef4444',
                    }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Members ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-brand-green text-[10px] tracking-[0.3em] uppercase border-b border-brand-green/30 pb-1" style={G}>
          Players
        </p>
        {members.map((m) => (
          <div key={m.player_id} className="flex items-center justify-between border border-white/10 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm" style={I}>
                  {m.profile?.first_name} {m.profile?.last_name}
                  {m.player_id === myPlayerId && (
                    <span className="text-white/40 text-xs ml-1">(you)</span>
                  )}
                </span>
                {m.role === 'captain' && (
                  <span className="text-[9px] text-brand-green/70 tracking-widest uppercase border border-brand-green/30 px-1.5 py-0.5" style={G}>Captain</span>
                )}
              </div>
              {m.profile?.city && (
                <p className="text-white/30 text-xs mt-0.5" style={I}>
                  {m.profile.city}{m.profile.primary_area ? ` · ${m.profile.primary_area}` : ''}
                </p>
              )}
            </div>
            <div className="text-brand-green text-lg font-bold" style={G}>
              {m.profile?.current_rating ?? '—'}
            </div>
          </div>
        ))}

        {/* Pending invitation slot */}
        {!isActive && pendingInvite && (
          <div className="border border-yellow-400/20 p-4 bg-yellow-400/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-yellow-400/80 text-[10px] tracking-widest uppercase mb-1" style={G}>
                  Invitation Pending
                </p>
                <p className="text-white/60 text-sm" style={I}>
                  {pendingInvite.inviteeProfile
                    ? `${pendingInvite.inviteeProfile.first_name ?? ''} ${pendingInvite.inviteeProfile.last_name ?? ''}`.trim()
                    : pendingInvite.invitee_email ?? pendingInvite.invitee_phone ?? 'External invite'}
                </p>
                <p className="text-white/30 text-xs mt-0.5" style={I}>
                  Sent {new Date(pendingInvite.created_at).toLocaleDateString()}
                </p>
              </div>
              {isCaptain && (
                <button
                  onClick={handleCancelInvite}
                  disabled={isPending}
                  className="text-white/30 text-xs tracking-widest uppercase hover:text-white/60 transition-colors disabled:opacity-30"
                  style={G}
                >
                  Cancel
                </button>
              )}
            </div>
            {isCaptain && (
              <Link
                href="/teams/new"
                className="block mt-3 text-center border border-brand-green/30 text-brand-green text-xs tracking-widest uppercase py-2 hover:bg-brand-green/5 transition-colors"
                style={G}
              >
                Re-invite / Invite Different Partner
              </Link>
            )}
          </div>
        )}

        {/* Empty partner slot (no pending invite) */}
        {!isActive && !pendingInvite && isCaptain && (
          <div className="border border-dashed border-white/20 p-4 text-center">
            <p className="text-white/30 text-sm mb-3" style={I}>No partner yet</p>
            <Link
              href={`/teams/new`}
              className="text-brand-green text-xs tracking-widest uppercase border border-brand-green/30 px-4 py-2 hover:bg-brand-green/5 transition-colors"
              style={G}
            >
              Invite Partner
            </Link>
          </div>
        )}
      </section>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}

      {/* ── Confirm Dialog ───────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-[#111] border border-white/20 p-6 w-full max-w-sm space-y-4">
            <p className="text-white text-sm text-center" style={I}>
              {showConfirm === 'leave'
                ? 'Leave this team? The team will be archived.'
                : 'Archive this team? This cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 border border-white/30 text-white/70 py-3 text-xs tracking-widest uppercase hover:border-white/50 transition-colors"
                style={G}
              >
                Cancel
              </button>
              <button
                onClick={showConfirm === 'leave' ? handleLeave : handleArchive}
                disabled={isPending}
                className="flex-1 bg-red-500/20 border border-red-500/50 text-red-400 py-3 text-xs tracking-widest uppercase hover:bg-red-500/30 transition-colors disabled:opacity-40"
                style={G}
              >
                {isPending ? '...' : showConfirm === 'leave' ? 'Leave' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────── */}
      <section className="space-y-2 pt-4 border-t border-white/10">
        <button
          onClick={() => setShowConfirm('leave')}
          disabled={isPending}
          className="w-full border border-white/10 text-white/40 py-3 text-xs tracking-widest uppercase hover:border-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
          style={G}
        >
          Leave Team
        </button>
        {isCaptain && (
          <button
            onClick={() => setShowConfirm('archive')}
            disabled={isPending}
            className="w-full border border-white/10 text-white/30 py-3 text-xs tracking-widest uppercase hover:border-white/30 hover:text-white/50 transition-colors disabled:opacity-30"
            style={G}
          >
            Archive Team
          </button>
        )}
      </section>

    </main>
  );
}
