-- ── Module 10: Explore Tab & Curated Matchmaking ─────────────

-- ── Core tile table ───────────────────────────────────────────
create table explore_tiles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  image_url text,
  icon_key text,
  background_color text not null default '#111111',

  content_type text not null default 'team_discovery'
    check (content_type in ('team_discovery')),

  access_level text not null default 'everyone'
    check (access_level in (
      'everyone', 'paid_members_only', 'free_locked_preview',
      'admin_testing_only', 'invitation_only'
    )),

  status text not null default 'draft'
    check (status in (
      'draft', 'pending_approval', 'approved', 'scheduled',
      'live', 'paused', 'ended', 'archived', 'cancelled'
    )),

  position_order integer not null default 100,
  is_featured boolean not null default false,
  is_sponsored boolean not null default false,
  sponsor_name text,
  sponsored_label text,

  max_visible_candidates integer,
  max_swipes_per_team integer,
  max_challenges_per_team integer,

  empty_state_behavior text not null default 'hide'
    check (empty_state_behavior in ('hide')),

  paid_member_boost_enabled boolean not null default false,

  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Eligibility rules ─────────────────────────────────────────
-- Supported rule_key values:
--   my_rating_min / my_rating_max   — selected team's rating bracket (for tile entry)
--   rating_min / rating_max          — candidate team rating filter
--   gender_rule                      — value: 'women_only' | 'men_only' | 'mixed_required'
--   match_history                    — value: 'new_rivals' | 'rematches_only'
--   ready_tonight                    — value: true  (candidates must be ready)
--   paid_membership                  — value: true  (entry requires paid member)
create table explore_tile_eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  rule_key text not null,
  rule_mode text not null default 'mandatory'
    check (rule_mode in ('mandatory', 'notify_only', 'not_used')),
  operator text,
  rule_value_json jsonb,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Ranking rules ─────────────────────────────────────────────
-- Supported signal_key values:
--   rating_balance         — prefer teams with similar rating (lower diff = better)
--   higher_rated_opponents — prefer stronger opponents
--   lower_rated_opponents  — prefer weaker opponents
--   same_area              — prefer same city/area
--   ready_tonight          — prefer ready teams (weight bonus)
--   never_played           — prefer teams never faced
create table explore_tile_ranking_rules (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  signal_key text not null,
  weight numeric not null default 1,
  priority integer not null,
  direction text not null default 'desc'
    check (direction in ('asc', 'desc')),
  configuration_json jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Schedules ─────────────────────────────────────────────────
create table explore_tile_schedules (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Africa/Cairo',
  is_recurring boolean not null default false,
  recurrence_rule text,
  auto_archive_after_end boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Invitations ───────────────────────────────────────────────
create table explore_tile_invitations (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  invited_player_id uuid references player_profiles(id) on delete cascade,
  invited_team_id uuid references teams(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ── Sessions ──────────────────────────────────────────────────
create table explore_sessions (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  opened_by_user_id uuid not null references auth.users(id),
  selected_team_id uuid not null references teams(id),
  configuration_snapshot_json jsonb not null default '{}'::jsonb,
  configuration_hash text not null default '',
  candidate_count integer not null default 0,
  candidates_viewed integer not null default 0,
  actions_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  exit_reason text
);

-- ── Actions ───────────────────────────────────────────────────
create table explore_actions (
  id uuid primary key default gen_random_uuid(),
  explore_session_id uuid not null references explore_sessions(id) on delete cascade,
  explore_tile_id uuid not null references explore_tiles(id) on delete cascade,
  selected_team_id uuid not null references teams(id),
  candidate_team_id uuid references teams(id),
  action_type text not null check (action_type in (
    'impression', 'open', 'candidate_view', 'pass', 'save',
    'view_profile', 'preview_match', 'challenge',
    'mark_ready_tonight', 'upgrade_click', 'exit'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ── Source attributions ───────────────────────────────────────
create table explore_source_attributions (
  id uuid primary key default gen_random_uuid(),
  explore_tile_id uuid not null references explore_tiles(id),
  explore_session_id uuid references explore_sessions(id),
  source_entity_type text not null check (source_entity_type in (
    'challenge', 'match', 'membership_conversion', 'quest_completion'
  )),
  source_entity_id uuid not null,
  configuration_snapshot_json jsonb not null default '{}'::jsonb,
  configuration_hash text not null default '',
  created_at timestamptz not null default now()
);

-- ── Ready Tonight ─────────────────────────────────────────────
create table team_ready_statuses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  readiness_type text not null default 'ready_tonight',
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  activated_by_player_id uuid references player_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active ready status per team per type
create unique index team_ready_active_unique
  on team_ready_statuses(team_id, readiness_type)
  where status = 'active';

-- ── Indexes ───────────────────────────────────────────────────
create index explore_tiles_status_order on explore_tiles(status, position_order);
create index explore_sessions_user on explore_sessions(opened_by_user_id);
create index explore_sessions_tile on explore_sessions(explore_tile_id);
create index explore_actions_session on explore_actions(explore_session_id);
create index explore_actions_tile on explore_actions(explore_tile_id);
create index team_ready_statuses_team on team_ready_statuses(team_id, status);

-- ── RLS ───────────────────────────────────────────────────────
alter table explore_tiles enable row level security;
alter table explore_tile_eligibility_rules enable row level security;
alter table explore_tile_ranking_rules enable row level security;
alter table explore_tile_schedules enable row level security;
alter table explore_tile_invitations enable row level security;
alter table explore_sessions enable row level security;
alter table explore_actions enable row level security;
alter table explore_source_attributions enable row level security;
alter table team_ready_statuses enable row level security;

-- Tiles: authenticated players can read live/scheduled (not admin_testing_only)
create policy "players read live explore tiles" on explore_tiles
  for select to authenticated
  using (status in ('live', 'scheduled') and access_level <> 'admin_testing_only');

-- Eligibility + ranking rules: readable for live tiles
create policy "players read explore eligibility rules" on explore_tile_eligibility_rules
  for select to authenticated
  using (exists (
    select 1 from explore_tiles t
    where t.id = explore_tile_id and t.status in ('live', 'scheduled')
  ));

create policy "players read explore ranking rules" on explore_tile_ranking_rules
  for select to authenticated
  using (exists (
    select 1 from explore_tiles t
    where t.id = explore_tile_id and t.status in ('live', 'scheduled')
  ));

create policy "players read explore schedules" on explore_tile_schedules
  for select to authenticated
  using (exists (
    select 1 from explore_tiles t
    where t.id = explore_tile_id and t.status in ('live', 'scheduled')
  ));

-- Invitations: players see their own
create policy "players read own invitations" on explore_tile_invitations
  for select to authenticated
  using (
    invited_player_id in (select id from player_profiles where user_id = auth.uid())
    or invited_team_id in (
      select tm.team_id from team_members tm
      join player_profiles pp on pp.id = tm.player_id
      where pp.user_id = auth.uid()
    )
  );

-- Sessions: own only
create policy "players manage own sessions" on explore_sessions
  for all to authenticated
  using (opened_by_user_id = auth.uid())
  with check (opened_by_user_id = auth.uid());

-- Actions: insert with valid session, read own
create policy "players log explore actions" on explore_actions
  for insert to authenticated
  with check (
    exists (
      select 1 from explore_sessions s
      where s.id = explore_session_id and s.opened_by_user_id = auth.uid()
    )
  );

create policy "players read own explore actions" on explore_actions
  for select to authenticated
  using (
    exists (
      select 1 from explore_sessions s
      where s.id = explore_session_id and s.opened_by_user_id = auth.uid()
    )
  );

-- Attributions
create policy "players insert attributions" on explore_source_attributions
  for insert to authenticated
  with check (true);

create policy "players read own attributions" on explore_source_attributions
  for select to authenticated
  using (
    explore_session_id is null
    or exists (
      select 1 from explore_sessions s
      where s.id = explore_session_id and s.opened_by_user_id = auth.uid()
    )
  );

-- Ready statuses: read all active, captains manage own team
create policy "players read active ready statuses" on team_ready_statuses
  for select to authenticated
  using (status = 'active');

create policy "captains manage team ready status" on team_ready_statuses
  for all to authenticated
  using (
    team_id in (
      select tm.team_id from team_members tm
      join player_profiles pp on pp.id = tm.player_id
      where pp.user_id = auth.uid() and tm.role = 'captain'
    )
  )
  with check (
    team_id in (
      select tm.team_id from team_members tm
      join player_profiles pp on pp.id = tm.player_id
      where pp.user_id = auth.uid() and tm.role = 'captain'
    )
  );
