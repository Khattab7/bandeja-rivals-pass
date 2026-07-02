import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check onboarding status
  const { data: profile } = await supabase
    .from('player_profiles')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile || !profile.onboarding_completed) {
    redirect('/onboarding');
  }

  redirect('/pass');
}
