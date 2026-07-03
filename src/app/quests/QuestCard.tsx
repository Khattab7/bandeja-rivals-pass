'use client';

import { useState, useTransition } from 'react';
import { claimQuestReward } from '@/app/actions/quests';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   'text-brand-green border-brand-green/30',
  medium: 'text-yellow-400 border-yellow-400/30',
  hard:   'text-orange-400 border-orange-400/30',
  elite:  'text-red-400 border-red-400/30',
};

type Participation = {
  id: string;
  status: string;
  progress_current: number;
  progress_target: number;
  completed_at: string | null;
  claimed_at: string | null;
  reward_locked: boolean;
} | null;

interface Props {
  instance: {
    id: string;
    name: string;
    description: string | null;
    ends_at: string;
    max_completions: number | null;
    completions_count: number;
  };
  template: {
    quest_type: string;
    difficulty: string;
    access_level: string;
    objective_json: Record<string, unknown>;
  } | null;
  reward: {
    reward_type: string;
    reward_amount: number | null;
    badge_key: string | null;
  } | null;
  participation: Participation;
  poolFull: boolean;
  highlight?: 'claim';
}

export default function QuestCard({ instance, template, reward, participation, poolFull, highlight }: Props) {
  const [claimed, setClaimed] = useState(participation?.status === 'claimed');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const status = participation?.status ?? 'not_started';
  const isClaimed = claimed || status === 'claimed';
  const isCompleted = status === 'completed';
  const isLocked = participation?.reward_locked ?? false;

  const borderColor = highlight === 'claim'
    ? 'border-brand-green/40 bg-brand-green/5'
    : isClaimed
    ? 'border-white/8'
    : 'border-white/10';

  function handleClaim() {
    if (!participation?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await claimQuestReward(participation.id);
      if (result.error) {
        setError(result.error);
      } else {
        setClaimed(true);
      }
    });
  }

  return (
    <div className={`border ${borderColor} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {template && (
              <span className={`text-[9px] tracking-widest uppercase border px-1.5 py-0.5 ${DIFFICULTY_COLORS[template.difficulty] ?? 'text-white/40 border-white/20'}`} style={G}>
                {template.difficulty}
              </span>
            )}
            {poolFull && (
              <span className="text-[9px] tracking-widest uppercase border border-white/20 text-white/30 px-1.5 py-0.5" style={G}>
                Pool Full
              </span>
            )}
            {isClaimed && (
              <span className="text-[9px] tracking-widest uppercase border border-brand-green/30 text-brand-green px-1.5 py-0.5" style={G}>
                Claimed
              </span>
            )}
          </div>
          <p className="text-white text-sm tracking-wider uppercase" style={G}>{instance.name}</p>
          {instance.description && (
            <p className="text-white/50 text-xs mt-0.5 leading-snug" style={I}>{instance.description}</p>
          )}
        </div>
        {/* Reward badge */}
        {reward && !isClaimed && (
          <div className="text-right shrink-0">
            {reward.reward_type === 'bars' && reward.reward_amount && (
              <p className="text-brand-green text-sm font-bold" style={G}>
                {reward.reward_amount} Bars
              </p>
            )}
            {reward.reward_type === 'badge' && (
              <p className="text-yellow-400 text-xs" style={G}>Badge</p>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {participation && !isClaimed && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]" style={I}>
            <span className="text-white/40">Progress</span>
            <span className="text-white/60">{participation.progress_current} / {participation.progress_target}</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-green rounded-full transition-all"
              style={{ width: `${Math.min(100, (participation.progress_current / participation.progress_target) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Deadline */}
      <p className="text-white/25 text-[11px]" style={I}>
        Ends {formatDate(instance.ends_at)}
        {instance.max_completions !== null && (
          <span> · {instance.max_completions - instance.completions_count} rewards left</span>
        )}
      </p>

      {/* Claim button */}
      {isCompleted && !isClaimed && (
        <div>
          {isLocked ? (
            <div className="border border-yellow-400/20 px-3 py-2">
              <p className="text-yellow-400 text-[10px] tracking-widest uppercase" style={G}>Reward Locked</p>
              <p className="text-white/40 text-xs mt-0.5" style={I}>Renew your membership to claim this reward.</p>
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={isPending}
              className="w-full border border-brand-green text-brand-green text-[11px] tracking-widest uppercase py-2.5 hover:bg-brand-green/10 transition-colors disabled:opacity-50"
              style={G}
            >
              {isPending ? 'Claiming...' : 'Claim Reward'}
            </button>
          )}
          {error && <p className="text-red-400 text-xs mt-1" style={I}>{error}</p>}
        </div>
      )}

      {/* Already claimed confirmation */}
      {isClaimed && (
        <p className="text-brand-green text-xs" style={I}>
          Reward claimed · {participation?.claimed_at ? formatDate(participation.claimed_at) : ''}
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
