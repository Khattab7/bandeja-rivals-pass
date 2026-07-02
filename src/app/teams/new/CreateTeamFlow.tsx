'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createTeam, invitePartner, searchPlayers } from '@/app/actions/teams';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };
const inputCls = 'w-full bg-transparent border border-white/30 text-white placeholder-white/30 px-4 py-3 text-sm outline-none focus:border-brand-green transition-colors';

type Step = 'name' | 'invite' | 'done';

interface FoundPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  current_rating: number;
}

export default function CreateTeamFlow({
  captainName,
  captainRating,
}: {
  captainName: string;
  captainRating: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>('name');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Invite state
  const [inviteMode, setInviteMode] = useState<'search' | 'email' | 'phone'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoundPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<FoundPlayer | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSent, setInviteSent] = useState(false);

  // ── Step 1: Create team ───────────────────────────────────────
  function handleCreateTeam() {
    setError(null);
    startTransition(async () => {
      const res = await createTeam({ name: teamName || undefined });
      if (res.error) { setError(res.error); return; }
      setTeamId(res.team_id!);
      setStep('invite');
    });
  }

  // ── Search players ────────────────────────────────────────────
  const runSearch = useCallback((q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    startTransition(async () => {
      const res = await searchPlayers(q);
      setSearchResults(res.players as FoundPlayer[]);
    });
  }, []);

  // ── Step 2: Send invitation ───────────────────────────────────
  function handleInvite() {
    if (!teamId) return;
    setError(null);
    startTransition(async () => {
      const res = await invitePartner({
        team_id: teamId,
        invitee_player_id: selectedPlayer?.id,
        invitee_email: inviteMode === 'email' ? inviteEmail : undefined,
        invitee_phone: inviteMode === 'phone' ? invitePhone : undefined,
        message: inviteMessage || undefined,
      });
      if (res.error) { setError(res.error); return; }
      setInviteSent(true);
      setStep('done');
    });
  }

  function skipInvite() {
    router.push('/teams');
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <main className="flex-1 flex flex-col px-5 py-8 max-w-lg mx-auto w-full">

      {/* ── Step: Name ──────────────────────────────────── */}
      {step === 'name' && (
        <div className="flex flex-col gap-6">
          <div>
            <button onClick={() => router.back()} className="text-white/40 text-xs tracking-widest uppercase mb-4" style={G}>
              ← Back
            </button>
            <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>Create Team</h1>
            <p className="text-white/40 text-sm mt-1" style={I}>Form a permanent team with a partner.</p>
          </div>

          <div className="border border-white/10 p-4 bg-brand-green/5">
            <p className="text-brand-green text-[10px] tracking-widest uppercase mb-1" style={G}>Captain</p>
            <p className="text-white text-sm" style={I}>
              {captainName} <span className="text-white/40">· Rating {captainRating}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>
              Team Name <span className="text-white/30">(optional)</span>
            </label>
            <input
              className={inputCls}
              style={I}
              placeholder="e.g. The Smashers"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={50}
            />
            <p className="text-white/20 text-xs" style={I}>
              Leave blank to use your names automatically.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}

          <button
            onClick={handleCreateTeam}
            disabled={isPending}
            className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-40 transition-opacity"
            style={G}
          >
            {isPending ? 'Creating...' : 'Create Team →'}
          </button>
        </div>
      )}

      {/* ── Step: Invite Partner ─────────────────────────── */}
      {step === 'invite' && (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>Invite Partner</h1>
            <p className="text-white/40 text-sm mt-1" style={I}>
              Your team needs 2 players. Invite your partner.
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1">
            {(['search', 'email', 'phone'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setInviteMode(m); setSelectedPlayer(null); setSearchResults([]); }}
                className={`flex-1 py-2 text-[10px] tracking-widest uppercase border transition-colors ${
                  inviteMode === m
                    ? 'border-brand-green bg-brand-green/10 text-brand-green'
                    : 'border-white/20 text-white/40 hover:border-white/40'
                }`}
                style={G}
              >
                {m === 'search' ? 'Search' : m === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          {/* Search by name */}
          {inviteMode === 'search' && (
            <div className="space-y-2">
              <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>Search by Name</label>
              <input
                className={inputCls}
                style={I}
                placeholder="Type first or last name..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); setSelectedPlayer(null); }}
              />
              {searchResults.length > 0 && (
                <div className="border border-white/10 divide-y divide-white/5">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlayer(p); setSearchResults([]); setSearchQuery(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()); }}
                      className={`w-full text-left px-4 py-3 flex justify-between items-center hover:bg-white/5 transition-colors ${
                        selectedPlayer?.id === p.id ? 'bg-brand-green/10' : ''
                      }`}
                    >
                      <span className="text-white text-sm" style={I}>
                        {p.first_name} {p.last_name}
                        {p.city && <span className="text-white/40"> · {p.city}</span>}
                      </span>
                      <span className="text-brand-green text-sm font-bold" style={G}>{p.current_rating}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedPlayer && (
                <div className="border border-brand-green/30 p-3 bg-brand-green/5 flex justify-between items-center">
                  <span className="text-brand-green text-sm" style={G}>
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </span>
                  <button onClick={() => { setSelectedPlayer(null); setSearchQuery(''); }} className="text-white/30 text-xs" style={G}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* Invite by email */}
          {inviteMode === 'email' && (
            <div className="space-y-2">
              <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>Partner's Email</label>
              <input
                type="email"
                className={inputCls}
                style={I}
                placeholder="partner@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
          )}

          {/* Invite by phone */}
          {inviteMode === 'phone' && (
            <div className="space-y-2">
              <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>Partner's Phone / WhatsApp</label>
              <input
                type="tel"
                className={inputCls}
                style={I}
                placeholder="+201234567890"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
              />
            </div>
          )}

          {/* Optional message */}
          <div className="space-y-2">
            <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>
              Message <span className="text-white/30">(optional)</span>
            </label>
            <input
              className={inputCls}
              style={I}
              placeholder="Let's team up!"
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              maxLength={200}
            />
          </div>

          {error && <p className="text-red-400 text-sm" style={I}>{error}</p>}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleInvite}
              disabled={
                isPending ||
                (inviteMode === 'search' && !selectedPlayer) ||
                (inviteMode === 'email' && !inviteEmail.trim()) ||
                (inviteMode === 'phone' && !invitePhone.trim())
              }
              className="w-full bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold disabled:opacity-30 transition-opacity"
              style={G}
            >
              {isPending ? 'Sending...' : 'Send Invitation →'}
            </button>
            <button
              onClick={skipInvite}
              disabled={isPending}
              className="w-full border border-white/20 text-white/40 py-3 text-xs tracking-widest uppercase hover:border-white/40 hover:text-white/60 transition-colors"
              style={G}
            >
              Do This Later
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ───────────────────────────────────── */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-8 text-center py-12">
          <div className="space-y-3">
            <div className="text-brand-green text-5xl" style={G}>✓</div>
            <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>
              {inviteSent ? 'Invitation Sent!' : 'Team Created'}
            </h1>
            <p className="text-white/50 text-sm" style={I}>
              {inviteSent
                ? 'Your partner will receive the invitation. Once they accept, your team will be active and ready to play.'
                : 'Your team is created. Invite a partner to activate it.'}
            </p>
          </div>

          <button
            onClick={() => router.push('/teams')}
            className="w-full max-w-xs bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold"
            style={G}
          >
            View My Teams →
          </button>
        </div>
      )}
    </main>
  );
}
