import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingFlow from './OnboardingFlow';

export const metadata = { title: 'Set Up Your Profile — BANDEJA Rivals' };

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Safety fallback: ensure player_profile row exists
  await supabase.rpc('ensure_player_profile', { p_user_id: user.id });

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('onboarding_completed, first_name')
    .eq('user_id', user.id)
    .single();

  // Already onboarded → skip
  if (profile?.onboarding_completed) redirect('/pass');

  return <OnboardingFlow />;
}
