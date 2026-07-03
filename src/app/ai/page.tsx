import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import AiChat from './AiChat';

export default async function AiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, display_name, first_name, last_name, current_rating, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  const playerName = (profile.display_name ?? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || 'Player';

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <AiChat playerName={playerName} playerRating={profile.current_rating ?? 500} />
      <BottomNav />
    </div>
  );
}
