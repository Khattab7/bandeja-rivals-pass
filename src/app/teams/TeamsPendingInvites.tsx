'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvitation, rejectInvitation } from '@/app/actions/teams';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface Invite {
  id: string;
  message: string | null;
  team_id: string;
  inviter_player_id: string;
  status: string;
  team: { id: string; name: string | null; auto_name: string | null; public_team_id: string | null; captain_player_id: string | null } | null;
  inviter: { first_name: string | null; last_name: string | null; current_rating: number } | null;
}

export default function TeamsPendingInvites({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = invites.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  function handleAccept(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitation(id);
      if (res.error) { setError(res.error); return; }
      setDismissed((p) => new Set(p).add(id));
      router.refresh();
    });
  }

  function handleReject(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await rejectInvitation(id);
      if (res.error) { setError(res.error); return; }
      setDismissed((p) => new Set(p).add(id));
    });
  }

  return (
    <section>
      <p className="text-brand-green text-[10px] tracking-[0.3em] uppercase border-b border-brand-green/30 pb-1 mb-4" style={G}>
        Team Invitations
      </p>
      {error && <p className="text-red-400 text-sm mb-3" style={I}>{error}</p>}
      <div className="space-y-3">
        {visible.map((invite) => {
          const teamName = invite.team?.name || invite.team?.auto_name || 'A team';
          const inviterName = invite.inviter
            ? `${invite.inviter.first_name ?? ''} ${invite.inviter.last_name ?? ''}`.trim()
            : 'Someone';

          return (
            <div key={invite.id} className="border border-yellow-400/30 bg-yellow-400/5 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-white text-sm tracking-wide uppercase" style={G}>{teamName}</p>
                  <p className="text-white/40 text-xs mt-0.5" style={I}>
                    Invited by {inviterName}
                    {invite.inviter?.current_rating ? ` · Rating ${invite.inviter.current_rating}` : ''}
                  </p>
                  {invite.message && (
                    <p className="text-white/60 text-xs mt-2 italic" style={I}>"{invite.message}"</p>
                  )}
                </div>
                <span className="text-yellow-400 text-[9px] tracking-widest uppercase" style={G}>
                  Invite
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(invite.id)}
                  disabled={isPending}
                  className="flex-1 bg-brand-green text-black py-2 text-xs tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity"
                  style={G}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleReject(invite.id)}
                  disabled={isPending}
                  className="flex-1 border border-white/20 text-white/50 py-2 text-xs tracking-widest uppercase hover:border-white/40 disabled:opacity-40 transition-colors"
                  style={G}
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
