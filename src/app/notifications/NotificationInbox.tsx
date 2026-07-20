'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { markNotificationRead, archiveNotification, deleteNotification } from './actions';

const PWA_DISMISSED_KEY = 'pwa_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
  const [showPwaCard, setShowPwaCard] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isDismissed = localStorage.getItem(PWA_DISMISSED_KEY) === '1';
    if (!isStandalone && !isDismissed) setShowPwaCard(true);
  }, []);

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

  const hasRealNotifications = pinned.length > 0 || unread.length > 0 || read.length > 0;
  const allEmpty = !showPwaCard && !hasRealNotifications;

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-8">

      {allEmpty && (
        <div className="text-center py-20">
          <p className="text-white text-xl tracking-widest uppercase" style={G}>All Caught Up</p>
          <p className="text-white/30 text-sm mt-2" style={I}>No notifications yet.</p>
        </div>
      )}

      {/* ── PWA install card — always top ──────────────────────── */}
      {showPwaCard && (
        <section>
          <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
            Action Required
          </h2>
          <PWAInstallCard onDismiss={() => setShowPwaCard(false)} />
        </section>
      )}

      {/* ── Pinned / Action Required ──────────────────────────── */}
      {pinned.filter((n) => !localArchived.has(n.id)).length > 0 && (
        <section>
          {/* Only show header if PWA card didn't already render it */}
          {!showPwaCard && (
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Action Required
            </h2>
          )}
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

function PWAInstallCard({ onDismiss }: { onDismiss: () => void }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(PWA_DISMISSED_KEY, '1');
    onDismiss();
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setAccepted(true);
      localStorage.setItem(PWA_DISMISSED_KEY, '1');
      onDismiss();
    }
  }

  if (accepted) return null;

  return (
    <div className="border border-brand-green/25 bg-brand-green/3 p-4 space-y-3" style={{ background: 'rgba(140,247,2,0.03)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {/* Green dot = unread */}
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8CF702', display: 'inline-block', flexShrink: 0 }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green shrink-0" />
            <p className="text-white text-xs tracking-wider uppercase" style={G}>Install the App</p>
          </div>
          <p className="text-white/70 text-sm leading-snug" style={I}>
            Add BANDEJA Rivals to your home screen for the best experience — faster load, full-screen, and offline access.
          </p>
        </div>
        <button onClick={dismiss} className="text-white/20 hover:text-white/50 text-xs shrink-0" title="Dismiss">×</button>
      </div>

      {/* Android: show install button */}
      {!isIOS && installPrompt && (
        <button
          onClick={handleInstall}
          className="flex items-center gap-2 border border-brand-green/40 bg-brand-green/10 text-brand-green text-[10px] tracking-widest uppercase px-4 py-2.5 hover:bg-brand-green/15 transition-colors"
          style={G}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Add to Home Screen
        </button>
      )}

      {/* Android: prompt not ready yet (page just loaded) */}
      {!isIOS && !installPrompt && (
        <p className="text-white/30 text-xs" style={I}>
          Open this page in Chrome and the install option will appear here.
        </p>
      )}

      {/* iOS: toggle step-by-step guide */}
      {isIOS && (
        <div className="space-y-2">
          <button
            onClick={() => setShowIOSGuide(v => !v)}
            className="flex items-center gap-2 border border-white/20 text-white/50 text-[10px] tracking-widest uppercase px-4 py-2.5 hover:border-white/35 hover:text-white/70 transition-colors"
            style={G}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            How to Add to Home Screen
          </button>
          {showIOSGuide && (
            <div className="border border-white/10 px-4 py-3 space-y-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {[
                'Tap the Share button (⬆) in the Safari toolbar at the bottom of your screen',
                'Scroll down and tap "Add to Home Screen"',
                'Tap "Add" in the top-right corner to confirm',
              ].map((text, i) => (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full border border-brand-green/40 flex items-center justify-center text-brand-green text-[9px] font-bold" style={G}>
                    {i + 1}
                  </span>
                  <p className="text-white/50 text-xs leading-relaxed" style={I}>{text}</p>
                </div>
              ))}
              <button
                onClick={dismiss}
                className="text-white/30 text-[10px] tracking-widest uppercase hover:text-white/50 transition-colors pt-1"
                style={G}
              >
                I've added it — dismiss
              </button>
            </div>
          )}
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
