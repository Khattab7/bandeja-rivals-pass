import { NextResponse } from 'next/server';
import { refreshAllLeaderboards } from '@/app/actions/leaderboards';

// Vercel Cron: runs daily at 03:00 UTC (see vercel.json)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await refreshAllLeaderboards();
  return NextResponse.json(result);
}
