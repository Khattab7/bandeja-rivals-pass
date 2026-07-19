/**
 * Notification dispatch service.
 * All modules call sendNotification() to create notification records.
 * Active channels: in_app + browser push (Web Push API).
 * Email: architecture-ready (EMAIL_NOTIFICATIONS_ENABLED=false in app_settings).
 * WhatsApp, mobile push: architecture-ready, not live.
 */

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/server';

let vapidInitialised = false;
function initVapid() {
  if (vapidInitialised) return;
  const contact = process.env.VAPID_CONTACT?.trim();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (contact && pub && priv) {
    webpush.setVapidDetails(contact, pub, priv);
    vapidInitialised = true;
  }
}

export type NotificationPayload = {
  type_key: string;
  category: string;
  recipient_user_id: string;
  recipient_player_id?: string | null;
  title?: string;
  body: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  related_entity_type?: string;
  related_entity_id?: string;
  metadata?: Record<string, unknown>;
  is_pinned?: boolean;
  pinned_until_action?: boolean;
  expires_at?: string;
  actions?: Array<{
    action_key: string;
    action_label: string;
    action_url?: string;
    backend_action?: string;
    payload_json?: Record<string, unknown>;
    requires_extra_confirmation?: boolean;
  }>;
};

/**
 * Core dispatch function. Uses service client (bypasses RLS) to insert notifications.
 * Respects user preferences and mandatory/optional rules.
 * Returns the created notification ID or null on failure.
 */
export async function sendNotification(payload: NotificationPayload): Promise<string | null> {
  const service = createServiceClient();

  // Check if notification type is enabled globally
  const { data: notifType } = await service
    .from('notification_types')
    .select('is_enabled, is_mandatory, priority, default_in_app_enabled, default_email_enabled')
    .eq('type_key', payload.type_key)
    .single();

  if (!notifType?.is_enabled) return null;

  // Check user preference (unless mandatory)
  if (!notifType.is_mandatory) {
    const { data: pref } = await service
      .from('notification_preferences')
      .select('in_app_enabled, muted_until')
      .eq('user_id', payload.recipient_user_id)
      .eq('type_key', payload.type_key)
      .maybeSingle();

    const inAppEnabled = pref ? pref.in_app_enabled : notifType.default_in_app_enabled;
    if (!inAppEnabled) return null;

    // Check mute
    if (pref?.muted_until && new Date(pref.muted_until) > new Date()) return null;
  }

  // Insert in-app notification
  const { data: notif, error } = await service
    .from('notifications')
    .insert({
      type_key: payload.type_key,
      category: payload.category,
      recipient_user_id: payload.recipient_user_id,
      recipient_player_id: payload.recipient_player_id ?? null,
      title: payload.title ?? null,
      body: payload.body,
      priority: payload.priority ?? (notifType.priority as 'critical' | 'high' | 'normal' | 'low'),
      related_entity_type: payload.related_entity_type ?? null,
      related_entity_id: payload.related_entity_id ?? null,
      metadata: payload.metadata ?? null,
      is_pinned: payload.is_pinned ?? false,
      pinned_until_action: payload.pinned_until_action ?? false,
      action_state: payload.actions?.length ? 'pending_action' : 'none',
      expires_at: payload.expires_at ?? null,
    })
    .select('id')
    .single();

  if (error || !notif) return null;

  // Create in-app delivery record
  await service.from('notification_deliveries').insert({
    notification_id: notif.id,
    channel: 'in_app',
    status: 'delivered',
    provider: 'in_app',
    sent_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
  });

  // Create action buttons if any
  if (payload.actions?.length) {
    await service.from('notification_actions').insert(
      payload.actions.map((a) => ({
        notification_id: notif.id,
        action_key: a.action_key,
        action_label: a.action_label,
        action_url: a.action_url ?? null,
        backend_action: a.backend_action ?? null,
        payload_json: a.payload_json ?? null,
        requires_extra_confirmation: a.requires_extra_confirmation ?? false,
        status: 'available' as const,
      }))
    );
  }

  // Browser push channel — send to all subscribed devices for this user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pushSubs } = await (service as any)
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', payload.recipient_user_id);

  if (pushSubs?.length) {
    const pushPayload = JSON.stringify({
      notification_id: notif.id,
      title: payload.title ?? 'BANDEJA',
      body: payload.body,
      tag: payload.type_key,
      url: (payload.related_entity_type && payload.related_entity_type !== 'admin_announcement')
        ? `/${payload.related_entity_type}s/${payload.related_entity_id ?? ''}`
        : '/notifications',
    });

    initVapid();
    await Promise.allSettled(
      pushSubs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
          );
          await service.from('notification_deliveries').insert({
            notification_id: notif.id,
            channel: 'browser_push',
            status: 'delivered',
            provider: 'web_push',
            sent_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
          });
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            // Subscription expired — remove it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (service as any).from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
          await service.from('notification_deliveries').insert({
            notification_id: notif.id,
            channel: 'browser_push',
            status: 'failed',
            provider: 'web_push',
          });
        }
      })
    );
  }

  // Email channel: architecture-ready — check EMAIL_NOTIFICATIONS_ENABLED setting
  // When an email provider is configured, flip EMAIL_NOTIFICATIONS_ENABLED=true
  // and add email delivery logic here. For now we insert a 'queued' delivery record
  // so the infrastructure is visible without sending anything.
  const { data: emailSetting } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'EMAIL_NOTIFICATIONS_ENABLED')
    .single();

  const emailEnabled = emailSetting?.value === 'true';
  const userWantsEmail = notifType.is_mandatory && notifType.default_email_enabled;

  if (emailEnabled && userWantsEmail) {
    // Placeholder: actual email delivery logic goes here when a provider is added
    await service.from('notification_deliveries').insert({
      notification_id: notif.id,
      channel: 'email',
      status: 'queued',
      provider: 'email_provider_tbd',
    });
  }

  return notif.id;
}

/**
 * Send the same notification to multiple recipients.
 * Used for team notifications (both players), announcements, etc.
 */
export async function sendNotificationToMany(
  recipients: Array<{ user_id: string; player_id?: string }>,
  basePayload: Omit<NotificationPayload, 'recipient_user_id' | 'recipient_player_id'>,
): Promise<void> {
  await Promise.all(
    recipients.map((r) =>
      sendNotification({
        ...basePayload,
        recipient_user_id: r.user_id,
        recipient_player_id: r.player_id ?? null,
      })
    )
  );
}

/**
 * Get all user_ids + player_ids for a team (for team-wide notifications).
 */
export async function getTeamRecipients(
  teamId: string,
): Promise<Array<{ user_id: string; player_id: string }>> {
  const service = createServiceClient();

  const { data } = await service
    .from('team_members')
    .select('player_id, player_profiles!inner(id, user_id)')
    .eq('team_id', teamId);

  type Row = { player_id: string; player_profiles: { id: string; user_id: string } };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    player_id: r.player_profiles.id,
    user_id: r.player_profiles.user_id,
  }));
}
