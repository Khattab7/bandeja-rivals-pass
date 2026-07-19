import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

export async function POST(req: NextRequest) {
  const { notification_id } = await req.json() as { notification_id?: string };
  if (!notification_id) return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 });

  // Use service client only — never touch session cookies from a service worker request,
  // as Supabase SSR can mutate/clear auth cookies during token refresh, logging the user out.
  // notification_id UUIDs are unguessable so no auth check is needed for this analytics write.
  const service = createServiceClient() as unknown as AnyClient;
  await service
    .from('notification_deliveries')
    .update({ clicked_at: new Date().toISOString() })
    .eq('notification_id', notification_id)
    .eq('channel', 'browser_push')
    .is('clicked_at', null);

  return NextResponse.json({ ok: true });
}
