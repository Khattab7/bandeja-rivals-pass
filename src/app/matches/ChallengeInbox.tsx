'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondToChallenge } from '@/app/actions/challenges';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface InboxChallenge {
  id: string;
  challenging_team_id: string;
  challenged_team_id: string;
  challenger_name: string;
  challenger_rating: number;
  match_type: 'friendly' | 'rivals_rated';
  proposed_datetime: string | null;
  message: string | null;
  expires_at: string | null;
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

function ChallengeCard({ challenge }: { challenge: InboxChallenge }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function respond(response: 'accepted' | 'rejected') {
    startTransition(async () => {
      await respondToChallenge(challenge.id, response);
      router.refresh();
    });
  }

  const expiresIn = challenge.expires_at
    ? Math.max(0, Math.round((new Date(challenge.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)))
    : null;

  return (
    <div className="border border-brand-green/20 bg-brand-green/5 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-brand-green text-[9px] tracking-widest uppercase mb-1" style={G}>
            Challenge Received
          </p>
          <p className="text-white text-sm font-medium" style={I}>
            {challenge.challenger_name}
          </p>
          <p className="text-white/40 text-xs" style={I}>
            Rating {challenge.challenger_rating} · {challenge.match_type === 'rivals_rated' ? 'Rated match' : 'Friendly'}
          </p>
        </div>
        {expiresIn !== null && (
          <span className="text-white/25 text-[9px] tracking-wide" style={I}>
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
          "{challenge.message}"
        </p>
      )}

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
    </div>
  );
}
