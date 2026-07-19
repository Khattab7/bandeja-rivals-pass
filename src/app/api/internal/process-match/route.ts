import { NextRequest, NextResponse } from 'next/server';

// Internal-only endpoint for test automation.
// Guarded by INTERNAL_TEST_TOKEN — never exposes game data or bypasses auth for real users.
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token');
  if (!process.env.INTERNAL_TEST_TOKEN || token !== process.env.INTERNAL_TEST_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let matchId: string | undefined;
  try {
    const body = await req.json() as { matchId?: string };
    matchId = body.matchId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!matchId || matchId === 'ping') {
    return NextResponse.json({ error: 'Missing matchId' }, { status: 400 });
  }

  const { processApprovedRatedMatch } = await import('@/app/actions/processing');
  const result = await processApprovedRatedMatch(matchId);
  return NextResponse.json(result);
}
