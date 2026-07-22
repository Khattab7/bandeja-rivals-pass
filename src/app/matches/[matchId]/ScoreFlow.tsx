'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitScore, confirmScore, rejectScore, withdrawSubmission } from '@/app/actions/matches';
import { VALID_SCORES, type SetInput } from '@/lib/score-types';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface ScoreFlowProps {
  matchId: string;
  mySide: 'A' | 'B';
  myTeamName: string;
  opponentTeamName: string;
  canSubmit: boolean;
  canConfirmReject: boolean;
  pendingSubmissionId: string | null;
  mySubmissionId: string | null;
  matchStatus: string;
}

type FlowStep = 'idle' | 'format' | 'sets' | 'review' | 'confirm_reject' | 'dispute';

export default function ScoreFlow({
  matchId,
  mySide,
  myTeamName,
  opponentTeamName,
  canSubmit,
  canConfirmReject,
  pendingSubmissionId,
  mySubmissionId,
  matchStatus,
}: ScoreFlowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<FlowStep>(canConfirmReject ? 'confirm_reject' : 'idle');
  const [scoreFormat, setScoreFormat] = useState<'one_set' | 'best_of_3'>('one_set');
  const [sets, setSets] = useState<SetInput[]>([{ winnerSide: 'my_team', winnerGames: 6, loserGames: 0 }]);
  const [disputeText, setDisputeText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function addSet() {
    if (sets.length < 3) {
      setSets((prev) => [...prev, { winnerSide: 'my_team', winnerGames: 6, loserGames: 0 }]);
    }
  }

  function updateSet(index: number, field: keyof SetInput, value: string | number) {
    setSets((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function removeSet(index: number) {
    setSets((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitScore({ match_id: matchId, score_format: scoreFormat, sets });
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleConfirm() {
    if (!pendingSubmissionId) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmScore(pendingSubmissionId);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleReject() {
    if (!pendingSubmissionId) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectScore(pendingSubmissionId, disputeText || undefined);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleWithdraw() {
    if (!mySubmissionId) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawSubmission(mySubmissionId);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  // ── Confirm/Reject flow ────────────────────────────────────────────────────
  if (step === 'confirm_reject') {
    return (
      <div className="border border-yellow-400/20 bg-yellow-400/5 p-5 space-y-4">
        <p className="text-yellow-400 text-[10px] tracking-widest uppercase" style={G}>
          Confirm Opponent's Score
        </p>
        <p className="text-white/60 text-sm" style={I}>
          Your opponent submitted a score. Confirm if correct, or reject to submit a different score.
        </p>
        {step === 'confirm_reject' && (
          <>
            {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setStep('dispute')}
                disabled={isPending}
                className="flex-1 border border-white/20 text-white/50 py-3 text-xs tracking-widest uppercase hover:border-white/40 transition-colors disabled:opacity-40"
                style={G}
              >
                Reject
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-[2] bg-brand-green text-black py-3 text-xs tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors disabled:opacity-40"
                style={G}
              >
                {isPending ? 'Confirming...' : 'Confirm Score ✓'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === 'dispute') {
    return (
      <div className="border border-orange-400/20 p-5 space-y-4">
        <p className="text-orange-400 text-[10px] tracking-widest uppercase" style={G}>Reject Score</p>
        <p className="text-white/50 text-sm" style={I}>
          Why does this score look wrong? (optional, seen by admins if disputed)
        </p>
        <textarea
          className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors resize-none"
          style={I}
          rows={3}
          placeholder="e.g. We won 6-4, not 6-2"
          value={disputeText}
          onChange={(e) => setDisputeText(e.target.value)}
          maxLength={300}
        />
        {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => setStep('confirm_reject')}
            className="flex-1 border border-white/20 text-white/40 py-3 text-xs tracking-widest uppercase"
            style={G}
          >
            Back
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            className="flex-[2] border border-orange-400/40 text-orange-400 py-3 text-xs tracking-widest uppercase hover:bg-orange-400/5 transition-colors disabled:opacity-40"
            style={G}
          >
            {isPending ? 'Rejecting...' : 'Reject & Submit Mine →'}
          </button>
        </div>
      </div>
    );
  }

  // ── My submission waiting ──────────────────────────────────────────────────
  if (mySubmissionId && !canSubmit) {
    return (
      <div className="border border-white/10 p-4 space-y-3">
        <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
          Waiting for Opponent
        </p>
        <p className="text-white/40 text-sm" style={I}>
          Your score has been submitted. Your opponent needs to confirm.
        </p>
        {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}
        <button
          onClick={handleWithdraw}
          disabled={isPending}
          className="text-white/30 text-xs tracking-widest uppercase border border-white/10 px-4 py-2 hover:border-white/25 transition-colors disabled:opacity-40"
          style={G}
        >
          {isPending ? '...' : 'Withdraw Submission'}
        </button>
      </div>
    );
  }

  // ── Submit score ───────────────────────────────────────────────────────────
  if (!canSubmit) return null;

  if (step === 'idle') {
    return (
      <div className="border border-white/10 p-4">
        <button
          onClick={() => setStep('format')}
          className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors"
          style={G}
        >
          Submit Score →
        </button>
      </div>
    );
  }

  if (step === 'format') {
    return (
      <div className="border border-white/10 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Score Format</p>
          <button onClick={() => setStep('idle')} className="text-white/30 text-sm hover:text-white/60">✕</button>
        </div>
        <div className="flex gap-2">
          {(['one_set', 'best_of_3'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setScoreFormat(f);
                if (f === 'best_of_3') {
                  setSets([
                    { winnerSide: 'my_team', winnerGames: 6, loserGames: 0 },
                    { winnerSide: 'my_team', winnerGames: 6, loserGames: 0 },
                  ]);
                } else {
                  setSets([{ winnerSide: 'my_team', winnerGames: 6, loserGames: 0 }]);
                }
              }}
              className={`flex-1 py-4 text-xs tracking-widest uppercase border transition-colors ${
                scoreFormat === f
                  ? 'border-brand-green bg-brand-green/10 text-brand-green'
                  : 'border-white/20 text-white/50 hover:border-white/40'
              }`}
              style={G}
            >
              {f === 'one_set' ? '1 Set' : 'Best of 3'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep('sets')}
          className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors"
          style={G}
        >
          Next →
        </button>
      </div>
    );
  }

  if (step === 'sets') {
    return (
      <div className="border border-white/10 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
            {scoreFormat === 'one_set' ? 'Set Score' : 'Set Scores'}
          </p>
          <button onClick={() => setStep('format')} className="text-white/30 text-xs hover:text-white/60" style={G}>← Back</button>
        </div>

        <div className="space-y-4">
          {sets.map((set, index) => (
            <div key={index} className="space-y-3">
              {sets.length > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Set {index + 1}</p>
                  {index === sets.length - 1 && sets.length > 2 && (
                    <button onClick={() => removeSet(index)} className="text-red-400/60 text-[9px] tracking-widest uppercase" style={G}>Remove</button>
                  )}
                </div>
              )}

              {/* Winner selector */}
              <div className="flex gap-2">
                {(['my_team', 'opponent'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => updateSet(index, 'winnerSide', side)}
                    className={`flex-1 py-2.5 text-xs tracking-widest uppercase border transition-colors ${
                      set.winnerSide === side
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'border-white/15 text-white/40 hover:border-white/30'
                    }`}
                    style={G}
                  >
                    {side === 'my_team' ? myTeamName : opponentTeamName}
                  </button>
                ))}
              </div>

              {/* Score selector */}
              <div>
                <p className="text-white/25 text-[9px] tracking-widest uppercase mb-2" style={G}>Score</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {VALID_SCORES.map((vs) => {
                    const isSelected = set.winnerGames === vs.winnerGames && set.loserGames === vs.loserGames;
                    return (
                      <button
                        key={vs.label}
                        onClick={() => {
                          updateSet(index, 'winnerGames', vs.winnerGames);
                          updateSet(index, 'loserGames', vs.loserGames);
                        }}
                        className={`py-2 text-xs border transition-colors ${
                          isSelected
                            ? 'border-brand-green bg-brand-green/10 text-brand-green'
                            : 'border-white/10 text-white/40 hover:border-white/25'
                        }`}
                        style={G}
                      >
                        {vs.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {scoreFormat === 'best_of_3' && sets.length < 3 && (
          <button
            onClick={addSet}
            className="w-full border border-dashed border-white/20 text-white/30 py-2.5 text-xs tracking-widest uppercase hover:border-white/35 transition-colors"
            style={G}
          >
            + Add Set {sets.length + 1}
          </button>
        )}

        {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}

        <button
          onClick={() => setStep('review')}
          className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors"
          style={G}
        >
          Review →
        </button>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="border border-white/10 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>Review & Submit</p>
          <button onClick={() => setStep('sets')} className="text-white/30 text-xs hover:text-white/60" style={G}>← Edit</button>
        </div>

        <div className="space-y-2">
          {sets.map((s, i) => {
            const winnerName = s.winnerSide === 'my_team' ? myTeamName : opponentTeamName;
            const loserName = s.winnerSide === 'my_team' ? opponentTeamName : myTeamName;
            return (
              <div key={i} className="flex items-center gap-3">
                {sets.length > 1 && (
                  <span className="text-white/25 text-[9px]" style={G}>Set {i + 1}</span>
                )}
                <span className="text-white text-sm font-medium" style={G}>
                  {winnerName} {s.winnerGames}–{s.loserGames} {loserName}
                </span>
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors disabled:opacity-50"
          style={G}
        >
          {isPending ? 'Submitting...' : 'Submit Score →'}
        </button>
      </div>
    );
  }

  return null;
}
