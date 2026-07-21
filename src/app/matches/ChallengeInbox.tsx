'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondToChallenge } from '@/app/actions/challenges';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

export interface InboxChallenge {
  id: string;
  challenging_team_id: string;
  challenged_team_id: string;
  team_name: string;
  team_rating: number;
  players: { avatar_url: string | null; initials: string }[];
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime: string | null;
  message: string | null;
  expires_at: string | null;
  created_at: string;
}

export default function ChallengeInbox({ challenges }: { challenges: InboxChallenge[] }) {
  return (
    <div className="space-y-3">
      {challenges.map((c) => (
        <ChallengeCard key={c.id} challenge={c} />
      ))}
    </div>
  );
}

export function ChallengeCard({ challenge, readOnly = false }: { challenge: InboxChallenge; readOnly?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function respond(response: 'accepted' | 'rejected') {
    setErr(null);
    startTransition(async () => {
      const result = await respondToChallenge(challenge.id, response);
      if (result?.error) {
        setErr(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const expiresIn = challenge.expires_at
    ? Math.max(0, Math.round((new Date(challenge.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)))
    : null;

  return (
    <div className="border border-brand-green/20 bg-brand-green/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Avatar circles */}
          {challenge.players.length > 0 && (
            <div className="flex -space-x-2 shrink-0 mt-0.5">
              {challenge.players.slice(0, 2).map((p, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-[#111] bg-white/10 overflow-hidden flex items-center justify-center shrink-0"
                >
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white/60 text-[10px] font-bold" style={G}>{p.initials}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-brand-green text-[9px] tracking-widest uppercase mb-1" style={G}>
              {readOnly ? 'Challenge Sent' : 'Challenge Received'}
            </p>
            <p className="text-white text-sm font-medium truncate" style={I}>
              {challenge.team_name}
            </p>
            <p className="text-white/40 text-xs" style={I}>
              Rating {challenge.team_rating} · {challenge.match_type === 'rivals_rated' ? 'Rated match' : 'Friendly'}
            </p>
          </div>
        </div>
        {expiresIn !== null && (
          <span className="text-white/25 text-[9px] tracking-wide shrink-0" style={I}>
            {expiresIn}h left
          </span>
        )}
      </div>

      {challenge.proposed_datetime && (
        <p className="text-white/50 text-xs" style={I}>
          Proposed: {new Date(challenge.proposed_datetime).toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      )}

      {challenge.message && (
        <p className="text-white/50 text-xs italic border-l-2 border-white/10 pl-3" style={I}>
          &ldquo;{challenge.message}&rdquo;
        </p>
      )}

      {err && (
        <p className="text-red-400 text-xs" style={I}>{err}</p>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <button
            onClick={() => respond('rejected')}
            disabled={isPending}
            className="flex-1 border border-white/20 text-white/50 py-2.5 text-xs tracking-widest uppercase hover:border-white/40 transition-colors disabled:opacity-40"
            style={G}
          >
            Decline
          </button>
          <button
            onClick={() => respond('accepted')}
            disabled={isPending}
            className="flex-[2] bg-brand-green text-black py-2.5 text-xs tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors disabled:opacity-40"
            style={G}
          >
            {isPending ? 'Accepting...' : 'Accept →'}
          </button>
        </div>
      )}

      {readOnly && (
        <p className="text-white/25 text-[10px] tracking-widest uppercase" style={G}>
          Awaiting their response
        </p>
      )}
    </div>
  );
}
