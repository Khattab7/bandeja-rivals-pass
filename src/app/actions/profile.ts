'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export interface ProfileUpdateData {
  display_name?: string | null;
  username?: string | null;
  city?: string | null;
  primary_area?: string | null;
  dominant_hand?: string | null;
  preferred_side?: string | null;
  years_playing_padel?: number | null;
  match_type_preference?: string | null;
  avatar_url?: string | null;
}

export async function updateProfile(
  playerId: string,
  data: ProfileUpdateData
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, user_id, username')
    .eq('id', playerId)
    .single();

  if (!profile) return { error: 'Profile not found.' };
  if (profile.user_id !== user.id) return { error: 'Not authorized.' };

  // Username uniqueness check
  const trimmedUsername = data.username?.trim() || null;
  if (trimmedUsername && trimmedUsername !== profile.username) {
    const { data: existing } = await supabase
      .from('player_profiles')
      .select('id')
      .eq('username', trimmedUsername)
      .neq('id', playerId)
      .maybeSingle();
    if (existing) return { error: 'Username already taken. Try a different handle.' };
  }

  const { error } = await supabase
    .from('player_profiles')
    .update({
      ...('display_name' in data && { display_name: data.display_name?.trim() || null }),
      ...('username' in data && { username: trimmedUsername }),
      ...('city' in data && { city: data.city?.trim() || null }),
      ...('primary_area' in data && { primary_area: data.primary_area?.trim() || null }),
      ...('dominant_hand' in data && { dominant_hand: (data.dominant_hand || null) as 'right' | 'left' | 'ambidextrous' | null }),
      ...('preferred_side' in data && { preferred_side: (data.preferred_side || null) as 'right' | 'left' | 'no_preference' | null }),
      ...('years_playing_padel' in data && { years_playing_padel: data.years_playing_padel ?? null }),
      ...('match_type_preference' in data && { match_type_preference: (data.match_type_preference || null) as 'friendly' | 'rated' | 'both' | null }),
      ...('avatar_url' in data && { avatar_url: data.avatar_url || null }),
    })
    .eq('id', playerId);

  if (error) return { error: error.message };

  revalidatePath(`/profile/${playerId}`);
  return {};
}
