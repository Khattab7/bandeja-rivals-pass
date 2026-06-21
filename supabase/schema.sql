-- ============================================================
-- BANDEJA RIVALS PASS — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Members table
CREATE TABLE IF NOT EXISTS public.members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  member_id    TEXT NOT NULL DEFAULT 'PENDING',
  avatar_url   TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  valid_until  DATE NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members(user_id);
CREATE INDEX IF NOT EXISTS members_member_id_idx ON public.members(member_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Members can read their own record
CREATE POLICY "members_read_own"
  ON public.members FOR SELECT
  USING (auth.uid() = user_id);

-- Members can insert their own record on signup
CREATE POLICY "members_insert_own"
  ON public.members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read basic validation info (for the /validate/[id] public page)
-- Only exposes: name, member_id, is_active, valid_until, avatar_url
-- We achieve this via a separate security definer function below

-- Admins (role set in app_metadata) can read/write all records
CREATE POLICY "admins_all"
  ON public.members FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Public validation function (bypasses RLS for partner QR scans)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_for_validation(member_uuid UUID)
RETURNS TABLE (
  name         TEXT,
  member_id    TEXT,
  is_active    BOOLEAN,
  valid_until  DATE,
  avatar_url   TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, member_id, is_active, valid_until, avatar_url
  FROM public.members
  WHERE id = member_uuid;
$$;

-- Grant execute to anonymous users (partners scanning QR)
GRANT EXECUTE ON FUNCTION public.get_member_for_validation(UUID) TO anon;

-- ============================================================
-- To make a user an admin:
-- Run this in the SQL editor, replacing USER_ID with their auth.users id:
--
-- UPDATE auth.users
-- SET app_metadata = jsonb_set(
--   COALESCE(app_metadata, '{}'),
--   '{role}',
--   '"admin"'
-- )
-- WHERE id = 'USER_ID_HERE';
-- ============================================================
