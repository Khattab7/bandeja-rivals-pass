import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import ProfileClient from './ProfileClient';

async function handleSignOut() {
  'use server';
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: viewer } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!viewer?.onboarding_completed) redirect('/onboarding');

  // Load the profile being viewed
  const { data: profile } = await supabase
    .from('player_profiles')
    .select(`
      id, user_id, public_player_id, first_name, last_name, display_name, username,
      avatar_url, city, primary_area, country, gender, dominant_hand,
      preferred_side, years_playing_padel, match_type_preference,
      current_rating, starting_rating, starting_rating_source,
      profile_completion_percent, onboarding_completed, match_ready,
      is_discoverable, match_history_privacy,
      is_suspended, is_banned,
      member_id
    `)
    .eq('id', playerId)
    .single();

  if (!profile || profile.is_banned) notFound();

  const isOwnProfile = profile.user_id === user.id;

  // Load stats
  const { data: stats } = await supabase
    .from('player_stats')
    .select(`
      matches_played, rated_matches_played, friendly_matches_played,
      wins, losses,
      current_winning_streak, best_winning_streak,
      current_beat_expected_streak, best_beat_expected_streak,
      times_beat_expected, upset_wins,
      bars_active_balance, bars_locked_pending, bars_total_earned,
      highest_rating_ever, lowest_rating_ever,
      cached_recent_form
    `)
    .eq('player_id', playerId)
    .single();

  // Load teams this player is on
  const { data: memberRows } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('player_id', playerId);

  const teamIds = (memberRows ?? []).map((m) => m.team_id);
  const { data: teams } = teamIds.length > 0
    ? await supabase
        .from('teams')
        .select('id, name, auto_name, cached_current_team_rating, status, captain_player_id')
        .in('id', teamIds)
        .in('status', ['active'])
    : { data: [] };

  // Load recent rating events (last 10)
  const { data: ratingEvents } = await supabase
    .from('rating_events')
    .select('id, event_type, rating_before, rating_change, rating_after, created_at, visible_to_player')
    .eq('player_id', playerId)
    .eq('visible_to_player', true)
    .order('created_at', { ascending: false })
    .limit(10);

  // For own profile: load member/pass info
  let memberInfo: { is_active: boolean; valid_until: string; member_id_ref: string } | null = null;
  if (isOwnProfile && profile.member_id) {
    const { data: member } = await supabase
      .from('members')
      .select('is_active, valid_until, member_id')
      .eq('id', profile.member_id)
      .single();
    if (member) {
      memberInfo = {
        is_active: member.is_active,
        valid_until: member.valid_until,
        member_id_ref: member.member_id,
      };
    }
  }

  const displayName =
    profile.display_name ??
    (profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.username ?? 'Player');

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        {isOwnProfile && (
          <div className="flex items-center gap-4">
            <NotificationBell />
            <span
              className="text-brand-green text-xs tracking-widest uppercase"
              style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}
            >
              My Profile
            </span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-white/30 text-xs tracking-widest uppercase hover:text-white/60 transition-colors"
                style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}
              >
                Sign Out
              </button>
            </form>
          </div>
        )}
      </header>

      <ProfileClient
        profile={{
          id: profile.id,
          displayName,
          username: profile.username,
          city: profile.city,
          primary_area: profile.primary_area,
          gender: profile.gender,
          dominant_hand: profile.dominant_hand,
          preferred_side: profile.preferred_side,
          years_playing_padel: profile.years_playing_padel,
          match_type_preference: profile.match_type_preference,
          current_rating: profile.current_rating,
          starting_rating: profile.starting_rating,
          starting_rating_source: profile.starting_rating_source,
          profile_completion_percent: profile.profile_completion_percent,
          match_ready: profile.match_ready,
          is_suspended: profile.is_suspended,
          public_player_id: profile.public_player_id,
        }}
        stats={stats ?? null}
        teams={(teams ?? []).map((t) => ({
          id: t.id,
          name: t.name ?? t.auto_name ?? 'My Team',
          rating: t.cached_current_team_rating ?? 500,
          status: t.status,
          isCaptain: t.captain_player_id === playerId,
        }))}
        ratingEvents={(ratingEvents ?? []).map((e) => ({
          id: e.id,
          event_type: e.event_type,
          rating_before: e.rating_before,
          rating_change: e.rating_change,
          rating_after: e.rating_after,
          created_at: e.created_at,
        }))}
        memberInfo={memberInfo}
        isOwnProfile={isOwnProfile}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}
      />

      <BottomNav />
    </div>
  );
}
