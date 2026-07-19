import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationInbox from './NotificationInbox';
import EnablePushBanner from '@/components/EnablePushBanner';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Load notifications: not deleted, newest first, limit 100
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type_key, category, title, body, priority, related_entity_type, related_entity_id, is_read, is_archived, is_pinned, action_state, created_at')
    .eq('recipient_user_id', user.id)
    .eq('is_deleted_by_user', false)
    .order('created_at', { ascending: false })
    .limit(100);

  // Load actions for actionable notifications
  const actionableIds = (notifications ?? [])
    .filter((n) => n.action_state === 'pending_action')
    .map((n) => n.id);

  const { data: actions } = actionableIds.length > 0
    ? await supabase
        .from('notification_actions')
        .select('id, notification_id, action_key, action_label, action_url, requires_extra_confirmation, status')
        .in('notification_id', actionableIds)
        .eq('status', 'available')
    : { data: [] };

  type ActionRow = { id: string; notification_id: string; action_key: string; action_label: string; action_url: string | null; requires_extra_confirmation: boolean; status: string };
  const actionsByNotification: Record<string, ActionRow[]> = {};
  for (const a of (actions as ActionRow[] | null) ?? []) {
    if (!actionsByNotification[a.notification_id]) actionsByNotification[a.notification_id] = [];
    actionsByNotification[a.notification_id]!.push(a);
  }

  const pinned = (notifications ?? []).filter((n) => n.is_pinned && !n.is_archived);
  const unread = (notifications ?? []).filter((n) => !n.is_read && !n.is_pinned && !n.is_archived);
  const read   = (notifications ?? []).filter((n) => n.is_read && !n.is_pinned && !n.is_archived);

  const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="bg-brand-green text-brand-dark text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="text-brand-green text-xs tracking-widest uppercase" style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}>
            Inbox
          </span>
        </div>
      </header>

      <EnablePushBanner />

      <NotificationInbox
        pinned={pinned}
        unread={unread}
        read={read}
        actionsByNotification={actionsByNotification as Record<string, Array<{ id: string; notification_id: string; action_key: string; action_label: string; action_url: string | null; requires_extra_confirmation: boolean; status: string }>>}
      />

      <BottomNav />
    </div>
  );
}
