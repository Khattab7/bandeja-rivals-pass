-- ============================================================
-- Migration 011: AI Agent Module — Phase 1
-- Run AFTER 010_fixes.sql
-- Creates ai_conversations and ai_messages tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id   UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'deepseek',
  model             TEXT DEFAULT 'deepseek-chat',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS ai_conversations_created_at_idx ON public.ai_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_id_idx ON public.ai_messages(conversation_id);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_ai_conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_ai_messages"
  ON public.ai_messages FOR ALL TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admins_all_ai_conversations"
  ON public.ai_conversations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_ai_messages"
  ON public.ai_messages FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
