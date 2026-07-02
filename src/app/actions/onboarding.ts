'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface RatingGuessAnswers {
  has_played_padel: boolean;
  tournament_level?: 'A' | 'B' | 'C' | 'D' | 'beginner';
  has_tennis_background?: boolean;
  has_squash_background?: boolean;
  is_padel_coach?: boolean;
  self_identifies_as_beginner?: boolean;
}

export interface OnboardingData {
  // Step 1 — Profile basics
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'prefer_not_to_say';
  date_of_birth: string;
  city: string;
  primary_area: string;
  dominant_hand: 'right' | 'left' | 'ambidextrous';
  // Step 2 — Playing preferences
  preferred_side: 'right' | 'left' | 'no_preference';
  years_playing_padel: number | null;
  weekly_match_frequency: string;
  match_type_preference: 'friendly' | 'rated' | 'both';
  // Step 3 — Rating Guess (optional)
  rating_guess_skipped: boolean;
  answers: RatingGuessAnswers | null;
}

export interface OnboardingResult {
  starting_rating: number;
  rating_source: 'default_500' | 'rating_guess';
  error?: string;
}

function computeStartingRating(
  skipped: boolean,
  answers: RatingGuessAnswers | null
): { rating: number; source: 'default_500' | 'rating_guess' } {
  if (skipped || !answers) return { rating: 500, source: 'default_500' };

  if (!answers.has_played_padel) return { rating: 300, source: 'rating_guess' };

  const levelBase: Record<string, number> = {
    A: 700, B: 650, C: 600, D: 550, beginner: 500,
  };
  const base = levelBase[answers.tournament_level ?? 'beginner'] ?? 500;

  let modifier = 0;
  if (answers.has_tennis_background)  modifier += 100;
  if (answers.has_squash_background)  modifier += 50;
  if (answers.is_padel_coach)         modifier += 50;
  // Only apply beginner penalty for players who chose a tournament level
  if (answers.self_identifies_as_beginner && answers.tournament_level !== 'beginner') {
    modifier -= 100;
  }

  const rating = Math.min(700, Math.max(300, base + modifier));
  return { rating, source: 'rating_guess' };
}

function computeProfileCompletion(data: OnboardingData): number {
  const fields = [
    data.first_name,
    data.last_name,
    data.gender,
    data.date_of_birth,
    data.city,
    data.primary_area,
    data.dominant_hand,
  ];
  const filled = fields.filter((f) => f && String(f).trim() !== '').length;
  return Math.round((filled / fields.length) * 100);
}

export async function completeOnboarding(data: OnboardingData): Promise<OnboardingResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Ensure profile exists (safety fallback)
  await supabase.rpc('ensure_player_profile', { p_user_id: user.id });

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, current_rating')
    .eq('user_id', user.id)
    .single();

  if (!profile) return { starting_rating: 500, rating_source: 'default_500', error: 'Profile not found.' };

  const { rating, source } = computeStartingRating(data.rating_guess_skipped, data.answers);
  const completionPercent = computeProfileCompletion(data);

  // Update player_profiles
  const { error: updateError } = await supabase
    .from('player_profiles')
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      gender: data.gender,
      date_of_birth: data.date_of_birth,
      city: data.city,
      primary_area: data.primary_area,
      dominant_hand: data.dominant_hand,
      preferred_side: data.preferred_side,
      years_playing_padel: data.years_playing_padel,
      weekly_match_frequency: data.weekly_match_frequency,
      match_type_preference: data.match_type_preference,
      current_rating: rating,
      starting_rating: rating,
      starting_rating_source: source,
      rating_confidence: 'low',
      // Set leaderboard location on first onboarding — will update after first match in new location
      leaderboard_city: data.city,
      leaderboard_area: data.primary_area,
      profile_completion_percent: completionPercent,
      onboarding_completed: true,
      // match_ready stays false until team is formed (Phase 2 feature)
    })
    .eq('id', profile.id);

  if (updateError) return { starting_rating: 500, rating_source: 'default_500', error: updateError.message };

  // Save Rating Guess answers (if taken)
  if (!data.rating_guess_skipped && data.answers) {
    await supabase
      .from('player_onboarding_answers')
      .update({ answers: data.answers as unknown as Record<string, unknown> })
      .eq('player_id', profile.id);
  }

  // Record starting rating event (immutable history)
  const prevRating = profile.current_rating ?? 500;
  await supabase.from('rating_events').insert({
    player_id: profile.id,
    event_type: 'starting_rating',
    rating_before: prevRating,
    rating_change: rating - prevRating,
    rating_after: rating,
    reason: data.rating_guess_skipped
      ? 'Default starting rating (Rating Guess skipped)'
      : 'Starting rating from BANDEJA Rating Guess questionnaire',
    algorithm_version: '1.0',
    visible_to_player: true,
  });

  // Add preferred area record
  if (data.city && data.primary_area) {
    await supabase.from('player_preferred_areas').upsert(
      { player_id: profile.id, city: data.city, area: data.primary_area, priority: 1 },
      { onConflict: 'player_id,city,area' }
    );
  }

  return { starting_rating: rating, rating_source: source };
}
