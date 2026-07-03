'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_user_id', user.id);

  revalidatePath('/notifications');
}

export async function archiveNotification(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('recipient_user_id', user.id);

  revalidatePath('/notifications');
}

export async function deleteNotification(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({
      is_deleted_by_user: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('recipient_user_id', user.id);

  revalidatePath('/notifications');
}

export async function markAllRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_user_id', user.id)
    .eq('is_read', false);

  revalidatePath('/notifications');
}
