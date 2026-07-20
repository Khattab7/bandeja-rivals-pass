'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // Count unread DB notifications
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', user.id)
        .eq('is_read', false)
        .eq('is_deleted_by_user', false)
        .then(({ count }) => {
          let total = count ?? 0;
          // Add 1 for the PWA install card if not yet installed/dismissed
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
          const isDismissed = localStorage.getItem('pwa_install_dismissed') === '1';
          if (!isStandalone && !isDismissed) total += 1;
          setUnread(total);
        });
    });
  }, []);

  return (
    <Link
      href="/notifications"
      className="relative flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
      aria-label="Notifications"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1.5 bg-brand-green text-brand-dark font-bold rounded-full flex items-center justify-center"
          style={{ fontSize: '8px', minWidth: '14px', height: '14px', padding: '0 2px', lineHeight: 1 }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
