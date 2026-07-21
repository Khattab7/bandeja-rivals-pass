'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChallengeCard } from './ChallengeInbox';
import type { InboxChallenge } from './ChallengeInbox';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type ScoreSub = {
  id: string;
  match_id: string;
  submitted_by_team_id: string;
  status: string;
  winning_side: string | null;
  equivalent_actual_score_label: string | null;
  created_at: string;
} | null;

interface MatchedItem {
  id: string;
  match_type: string;
  status: string;
  team_a_id: string;
  team_b_id: string;
  scheduled_date: string | null;
  city: string | null;
  area: string | null;
  created_at: string;
  opponent_name: string;
  my_side: string;
  my_team_id: string;
  score_sub: ScoreSub;
}

interface Props {
  pushed: InboxChallenge[];
  received: InboxChallenge[];
  matched: MatchedItem[];
}

const ACTIVE_STATUSES = ['scheduled', 'scheduled_tbd', 'awaiting_confirmation', 'alternative_score_submitted', 'score_submitted'];
const RESULT_STATUSES = ['confirmed', 'auto_approved', 'processed', 'disputed', 'admin_resolved'];

export default function MatchesTabs({ pushed, received, matched }: Props) {
  const [tab, setTab] = useState<'pushed' | 'received' | 'matched'>('received');

  const tabs = [
    { key: 'pushed' as const, label: 'Pushed', count: pushed.length },
    { key: 'received' as const, label: 'Received', count: received.length },
    { key: 'matched' as const, label: 'Matched', count: matched.length },
  ];

  const active = matched.filter(m => ACTIVE_STATUSES.includes(m.status));
  const results = matched.filter(m => RESULT_STATUSES.includes(m.status));
  const needsAction = active.filter(m =>
    m.score_sub && m.score_sub.status === 'pending' && m.score_sub.submitted_by_team_id !== m.my_team_id
  );

  const isEmpty = pushed.length === 0 && received.length === 0 && matched.length === 0;

  return (
    <main className="flex-1 flex flex-col max-w-lg mx-auto w-full">
      {/* Tab bar */}
      <div className="flex border-b border-white/10 px-4 pt-3">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 pb-3 text-[11px] tracking-widest uppercase transition-colors relative ${
              tab === t.key ? 'text-brand-green' : 'text-white/30 hover:text-white/60'
            }`}
            style={G}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-brand-green text-black' : 'bg-white/10 text-white/40'
              }`}>
                {t.count}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

        {/* ── PUSHED TAB ─────────────────────────────────────────── */}
        {tab === 'pushed' && (
          <>
            {pushed.length === 0 ? (
              <EmptyState
                label="No challenges sent"
                sub="Go to Play to challenge a team."
                href="/play"
                cta="Find Opponents →"
              />
            ) : (
              <div className="space-y-3">
                {pushed.map(c => (
                  <ChallengeCard key={c.id} challenge={c} readOnly />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── RECEIVED TAB ───────────────────────────────────────── */}
        {tab === 'received' && (
          <>
            {received.length === 0 ? (
              <EmptyState
                label="No challenges received"
                sub="Share your team so others can challenge you."
                href="/play"
                cta="Go to Play →"
              />
            ) : (
              <div className="space-y-3">
                {received.map(c => (
                  <ChallengeCard key={c.id} challenge={c} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MATCHED TAB ────────────────────────────────────────── */}
        {tab === 'matched' && (
          <>
            {matched.length === 0 ? (
              <EmptyState
                label="No matches yet"
                sub="Accept a challenge to get started."
                href="/play"
                cta="Find Opponents →"
              />
            ) : (
              <>
                {needsAction.length > 0 && (
                  <section>
                    <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
                      Needs Your Action
                    </h2>
                    <div className="space-y-2">
                      {needsAction.map(m => (
                        <MatchCard key={m.id} match={m} highlight="yellow" />
                      ))}
                    </div>
                  </section>
                )}

                {active.length > 0 && (
                  <section>
                    <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
                      Active Matches
                    </h2>
                    <div className="space-y-2">
                      {active.map(m => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  </section>
                )}

                {results.length > 0 && (
                  <section>
                    <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
                      Recent Results
                    </h2>
                    <div className="space-y-2">
                      {results.map(m => (
                        <MatchCard key={m.id} match={m} showResult />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* ── ALL-EMPTY STATE ────────────────────────────────────── */}
        {isEmpty && tab === 'received' && (
          <EmptyState
            label="No activity yet"
            sub="Head to Play to challenge a team or find opponents."
            href="/play"
            cta="Find Opponents →"
          />
        )}
      </div>
    </main>
  );
}

function MatchCard({
  match: m,
  highlight,
  showResult,
}: {
  match: MatchedItem;
  highlight?: 'yellow';
  showResult?: boolean;
}) {
  const sub = m.score_sub;
  const iSubmitted = sub && sub.submitted_by_team_id === m.my_team_id;
  const myWon = sub && (
    (sub.winning_side === 'A' && m.my_side === 'A') ||
    (sub.winning_side === 'B' && m.my_side === 'B')
  );

  const borderCls = highlight === 'yellow'
    ? 'border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10'
    : 'border-white/10 hover:border-white/25';

  return (
    <Link
      href={`/matches/${m.id}`}
      className={`block border ${borderCls} p-4 transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          {showResult ? (
            <p className={`text-[10px] tracking-widest uppercase font-bold mb-0.5 ${myWon ? 'text-brand-green' : 'text-red-400'}`} style={G}>
              {sub ? (myWon ? 'Won' : 'Lost') : m.status}
            </p>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 border ${
                m.match_type === 'rivals_rated'
                  ? 'text-brand-green border-brand-green/30'
                  : 'text-white/40 border-white/20'
              }`} style={G}>
                {m.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
              </span>
              {highlight === 'yellow' && (
                <span className="text-yellow-400 text-[9px] tracking-widest uppercase" style={G}>Confirm Score</span>
              )}
            </div>
          )}

          <p className="text-white text-sm truncate" style={I}>
            vs. {m.opponent_name}
          </p>

          {showResult && sub?.equivalent_actual_score_label && (
            <p className="text-white/30 text-xs mt-0.5" style={I}>{sub.equivalent_actual_score_label}</p>
          )}

          {!showResult && (m.status === 'scheduled' || m.status === 'scheduled_tbd') && (
            <div className="mt-0.5 space-y-0.5">
              {m.scheduled_date && (
                <p className="text-brand-green/70 text-xs" style={I}>
                  {new Date(m.scheduled_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                </p>
              )}
              {(m.city || m.area) && (
                <p className="text-white/30 text-xs" style={I}>
                  {[m.area, m.city].filter(Boolean).join(', ')}
                </p>
              )}
              {!m.scheduled_date && !m.city && (
                <p className="text-white/30 text-xs" style={I}>Time & place TBD</p>
              )}
            </div>
          )}

          {!showResult && m.status === 'awaiting_confirmation' && (
            <p className="text-white/30 text-xs mt-0.5" style={I}>
              {iSubmitted ? 'Waiting for their confirmation' : 'They submitted a score'}
            </p>
          )}

          {!showResult && m.status === 'alternative_score_submitted' && (
            <p className="text-white/30 text-xs mt-0.5" style={I}>Scores disputed — check details</p>
          )}
        </div>
        <span className={`text-sm shrink-0 ml-2 ${highlight === 'yellow' ? 'text-yellow-400' : 'text-white/40'}`}>→</span>
      </div>
    </Link>
  );
}

function EmptyState({ label, sub, href, cta }: { label: string; sub: string; href: string; cta: string }) {
  return (
    <div className="text-center py-20 space-y-3">
      <p className="text-white text-xl tracking-widest uppercase" style={G}>{label}</p>
      <p className="text-white/30 text-sm" style={I}>{sub}</p>
      <Link
        href={href}
        className="inline-block border border-brand-green/40 text-brand-green px-6 py-3 text-sm tracking-widest uppercase hover:bg-brand-green/5 transition-colors mt-2"
        style={G}
      >
        {cta}
      </Link>
    </div>
  );
}
