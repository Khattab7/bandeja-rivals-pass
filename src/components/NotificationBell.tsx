import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function NotificationBell() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', user.id)
    .eq('is_read', false)
    .eq('is_deleted_by_user', false);

  const unread = count ?? 0;

  return (
    <Link href="/notifications" className="relative flex items-center justify-center text-white/40 hover:text-white/70 transition-colors" aria-label="Notifications">
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
