'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { markNotificationRead, archiveNotification, deleteNotification } from './actions';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type NotificationRow = {
  id: string;
  type_key: string;
  category: string;
  title: string | null;
  body: string;
  priority: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  is_archived: boolean;
  is_pinned: boolean;
  action_state: string;
  created_at: string;
};

type ActionRow = {
  id: string;
  notification_id: string;
  action_key: string;
  action_label: string;
  action_url: string | null;
  requires_extra_confirmation: boolean;
  status: string;
};

interface Props {
  pinned: NotificationRow[];
  unread: NotificationRow[];
  read: NotificationRow[];
  actionsByNotification: Record<string, ActionRow[]>;
}

export default function NotificationInbox({ pinned, unread, read, actionsByNotification }: Props) {
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());
  const [localArchived, setLocalArchived] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function handleMarkRead(id: string) {
    setLocalRead((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function handleArchive(id: string) {
    setLocalArchived((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await archiveNotification(id);
    });
  }

  const allEmpty = pinned.length === 0 && unread.length === 0 && read.length === 0;

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-8">

      {allEmpty && (
        <div className="text-center py-20">
          <p className="text-white text-xl tracking-widest uppercase" style={G}>All Caught Up</p>
          <p className="text-white/30 text-sm mt-2" style={I}>No notifications yet.</p>
        </div>
      )}

      {/* ── Pinned / Action Required ──────────────────────────── */}
      {pinned.filter((n) => !localArchived.has(n.id)).length > 0 && (
        <section>
          <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
            Action Required
          </h2>
          <div className="space-y-2">
            {pinned.filter((n) => !localArchived.has(n.id)).map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                actions={actionsByNotification[n.id] ?? []}
                isRead={localRead.has(n.id) || n.is_read}
                onMarkRead={() => handleMarkRead(n.id)}
                onArchive={() => handleArchive(n.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Unread ────────────────────────────────────────────── */}
      {unread.filter((n) => !localArchived.has(n.id)).length > 0 && (
        <section>
          <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
            New
          </h2>
          <div className="space-y-2">
            {unread.filter((n) => !localArchived.has(n.id)).map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                actions={actionsByNotification[n.id] ?? []}
                isRead={localRead.has(n.id)}
                onMarkRead={() => handleMarkRead(n.id)}
                onArchive={() => handleArchive(n.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Read ──────────────────────────────────────────────── */}
      {read.filter((n) => !localArchived.has(n.id) && !localRead.has(n.id) || (read.filter((n) => !localArchived.has(n.id)).length > 0)).length > 0 && (
        <section>
          <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
            Earlier
          </h2>
          <div className="space-y-2">
            {read.filter((n) => !localArchived.has(n.id)).map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                actions={actionsByNotification[n.id] ?? []}
                isRead
                onMarkRead={() => {}}
                onArchive={() => handleArchive(n.id)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function NotificationCard({
  notification: n,
  actions,
  isRead,
  onMarkRead,
  onArchive,
}: {
  notification: NotificationRow;
  actions: ActionRow[];
  isRead: boolean;
  onMarkRead: () => void;
  onArchive: () => void;
}) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const priorityColor = n.priority === 'critical' || n.priority === 'high' ? 'border-yellow-400/30' : 'border-white/10';

  return (
    <div
      className={`border ${isRead ? 'border-white/8' : priorityColor} p-4 space-y-2 ${!isRead ? 'bg-white/2' : ''}`}
      onClick={() => { if (!isRead) onMarkRead(); }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <CategoryDot category={n.category} priority={n.priority} />
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green shrink-0" />
            )}
            {n.title && (
              <p className="text-white text-xs tracking-wider uppercase truncate" style={G}>{n.title}</p>
            )}
          </div>
          <p className="text-white/70 text-sm leading-snug" style={I}>{n.body}</p>
          <p className="text-white/25 text-[11px] mt-1" style={I}>{formatRelativeTime(n.created_at)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="text-white/20 hover:text-white/50 text-xs shrink-0"
          title="Archive"
        >
          ×
        </button>
      </div>

      {/* Action buttons */}
      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap pt-1">
          {actions.map((a) => (
            <span key={a.id}>
              {confirmAction === a.id ? (
                <div className="flex gap-2">
                  <span className="text-white/40 text-xs" style={I}>Confirm?</span>
                  <Link
                    href={a.action_url ?? '#'}
                    className="text-brand-green text-xs border border-brand-green/40 px-2 py-0.5 hover:bg-brand-green/10"
                    style={G}
                    onClick={() => setConfirmAction(null)}
                  >
                    Yes
                  </Link>
                  <button
                    className="text-white/40 text-xs border border-white/20 px-2 py-0.5 hover:bg-white/5"
                    style={G}
                    onClick={() => setConfirmAction(null)}
                  >
                    No
                  </button>
                </div>
              ) : a.action_url ? (
                <Link
                  href={a.action_url}
                  className="text-[10px] tracking-widest uppercase border border-brand-green/30 text-brand-green px-3 py-1 hover:bg-brand-green/5 transition-colors"
                  style={G}
                  onClick={(e) => {
                    if (a.requires_extra_confirmation) {
                      e.preventDefault();
                      setConfirmAction(a.id);
                    }
                  }}
                >
                  {a.action_label}
                </Link>
              ) : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryDot({ category, priority }: { category: string; priority: string }) {
  const colorMap: Record<string, string> = {
    score_confirmation: priority === 'critical' ? '#f97316' : '#eab308',
    match: '#8CF702',
    team: '#60a5fa',
    challenge: '#a78bfa',
    quest: '#f59e0b',
    leaderboard: '#8CF702',
    rating_bars_streaks: '#8CF702',
    account_security: '#ef4444',
    membership_pass: '#f97316',
    admin_announcement: '#6b7280',
    social: '#ec4899',
  };
  const color = colorMap[category] ?? '#6b7280';
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
