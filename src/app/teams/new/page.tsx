import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BandejaLogo from '@/components/BandejaLogo';
import CreateTeamFlow from './CreateTeamFlow';

export default async function NewTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, first_name, last_name, current_rating, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 pt-safe-header border-b border-white/10">
        <BandejaLogo width={120} height={30} />
      </header>
      <CreateTeamFlow
        captainName={`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()}
        captainRating={profile.current_rating}
      />
    </div>
  );
}
