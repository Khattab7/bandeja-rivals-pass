import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  redirect(`/profile/${profile.id}`);
}
