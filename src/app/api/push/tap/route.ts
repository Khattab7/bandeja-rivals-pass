import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { notification_id } = await req.json() as { notification_id?: string };
  if (!notification_id) return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 });

  const service = createServiceClient();

  // Verify the notification belongs to this user before updating
  const { data: notif } = await service
    .from('notifications')
    .select('id')
    .eq('id', notification_id)
    .eq('recipient_user_id', user.id)
    .single();

  if (!notif) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await (service as unknown as AnyClient)
    .from('notification_deliveries')
    .update({ clicked_at: new Date().toISOString() })
    .eq('notification_id', notification_id)
    .eq('channel', 'browser_push')
    .is('clicked_at', null);

  return NextResponse.json({ ok: true });
}
