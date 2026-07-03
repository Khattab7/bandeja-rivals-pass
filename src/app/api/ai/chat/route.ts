import { createClient } from '@/lib/supabase/server';
import { createAiClient, AI_MODEL } from '@/lib/ai/provider';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { PHASE1_TOOLS } from '@/lib/ai/tools';
import type OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  playerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  try {
    switch (name) {
      case 'get_my_stats': {
        const { data } = await supabase
          .from('player_stats')
          .select('matches_played, wins, losses, current_winning_streak, best_winning_streak, bars_active_balance, bars_locked_pending, bars_total_earned, rated_matches_played, friendly_matches_played')
          .eq('player_id', playerId)
          .single();
        return JSON.stringify(data ?? { error: 'No stats found' });
      }

      case 'get_my_rating_history': {
        const limit = Math.min(Number(args.limit ?? 5), 10);
        const { data } = await supabase
          .from('rating_events')
          .select('event_type, rating_before, rating_change, rating_after, created_at')
          .eq('player_id', playerId)
          .eq('visible_to_player', true)
          .order('created_at', { ascending: false })
          .limit(limit);
        return JSON.stringify(data ?? []);
      }

      case 'get_my_bars': {
        const { data: stats } = await supabase
          .from('player_stats')
          .select('bars_active_balance, bars_locked_pending, bars_total_earned')
          .eq('player_id', playerId)
          .single();
        const { data: recent } = await supabase
          .from('bars_ledger')
          .select('amount, status, source_type, created_at')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(8);
        return JSON.stringify({ balance: stats ?? {}, recent: recent ?? [] });
      }

      case 'get_open_matches': {
        let q = supabase
          .from('open_matches')
          .select('public_open_id, match_type, city, area, proposed_datetime, rating_min, rating_max, message')
          .eq('status', 'open')
          .order('proposed_datetime', { ascending: true })
          .limit(6);
        if (args.city) q = q.ilike('city', `%${String(args.city)}%`);
        if (args.match_type) q = q.eq('match_type', args.match_type);
        const { data } = await q;
        return JSON.stringify(data ?? []);
      }

      case 'get_leaderboard': {
        const limit = Math.min(Number(args.limit ?? 10), 10);
        let q = supabase
          .from('player_profiles')
          .select('display_name, first_name, last_name, current_rating, city')
          .eq('is_banned', false)
          .eq('onboarding_completed', true)
          .order('current_rating', { ascending: false })
          .limit(limit);
        if (args.city) q = q.ilike('city', `%${String(args.city)}%`);
        const { data } = await q;
        return JSON.stringify(data ?? []);
      }

      default:
        return JSON.stringify({ error: 'Unknown tool' });
    }
  } catch {
    return JSON.stringify({ error: 'Tool execution failed' });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, display_name, first_name, last_name, current_rating, city')
    .eq('user_id', user.id)
    .single();

  const { data: stats } = profile
    ? await supabase
        .from('player_stats')
        .select('bars_active_balance, bars_locked_pending, matches_played, wins, current_winning_streak')
        .eq('player_id', profile.id)
        .single()
    : { data: null };

  const { data: member } = await supabase
    .from('members')
    .select('is_active, valid_until')
    .eq('user_id', user.id)
    .single();

  const playerCtx = profile
    ? {
        name: (profile.display_name ?? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || 'Player',
        rating: profile.current_rating ?? 500,
        city: profile.city ?? undefined,
        barsBalance: Number(stats?.bars_active_balance ?? 0),
        lockedBars: Number(stats?.bars_locked_pending ?? 0),
        matchesPlayed: stats?.matches_played ?? 0,
        wins: stats?.wins ?? 0,
        currentStreak: stats?.current_winning_streak ?? 0,
        isMember: !!(member?.is_active && member?.valid_until && new Date(member.valid_until) > new Date()),
      }
    : undefined;

  let body: { messages: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('No messages', { status: 400 });
  }

  const ai = createAiClient();
  const systemPrompt = buildSystemPrompt(playerCtx);

  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Step 1: non-streaming call to resolve tool use
  let firstResponse: OpenAI.Chat.ChatCompletion;
  try {
    firstResponse = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: apiMessages,
      tools: profile ? PHASE1_TOOLS : undefined,
      tool_choice: profile ? 'auto' : undefined,
      max_tokens: 1024,
      stream: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI service error';
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const firstChoice = firstResponse.choices[0];
  const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...apiMessages, firstChoice.message];

  // Step 2: execute any tool calls
  if (firstChoice.finish_reason === 'tool_calls' && firstChoice.message.tool_calls && profile) {
    for (const tc of firstChoice.message.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
      let toolArgs: Record<string, unknown> = {};
      try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch { /* empty args */ }
      const result = await executeToolCall(tc.function.name, toolArgs, profile.id, supabase);
      conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  const encoder = new TextEncoder();

  // Step 3: stream final response
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        if (firstChoice.finish_reason !== 'tool_calls') {
          // No tools used — emit full content at once
          enqueue(firstChoice.message.content ?? '');
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        // Stream the post-tool response
        const finalStream = await ai.chat.completions.create({
          model: AI_MODEL,
          messages: conversationMessages,
          max_tokens: 1024,
          stream: true,
        });

        for await (const chunk of finalStream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) enqueue(text);
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
