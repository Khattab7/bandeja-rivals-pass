import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BandejaLogo from '@/components/BandejaLogo';
import BottomNav from '@/components/BottomNav';
import QuestCard from './QuestCard';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

export default async function QuestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('id, onboarding_completed')
    .eq('user_id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  const now = new Date().toISOString();

  // Live quest instances
  const { data: rawInstances } = await supabase
    .from('quest_instances')
    .select(`
      id, name, description, starts_at, ends_at, status,
      reward_budget_total, reward_budget_used, max_completions, completions_count,
      template_id
    `)
    .eq('status', 'live')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('ends_at', { ascending: true });

  const instances = rawInstances ?? [];
  const instanceIds = instances.map((qi) => qi.id);
  const templateIds = [...new Set(instances.map((qi) => qi.template_id))];

  // Load templates
  const { data: templates } = templateIds.length > 0
    ? await supabase
        .from('quest_templates')
        .select('id, quest_type, difficulty, access_level, objective_json')
        .in('id', templateIds)
    : { data: [] };

  const templateById: Record<string, { quest_type: string; difficulty: string; access_level: string; objective_json: Record<string, unknown> }> = {};
  for (const t of templates ?? []) templateById[t.id] = t;

  // Load rewards
  const { data: rewards } = instanceIds.length > 0
    ? await supabase
        .from('quest_rewards')
        .select('quest_instance_id, reward_type, reward_amount, badge_key')
        .in('quest_instance_id', instanceIds)
    : { data: [] };

  const rewardByInstance: Record<string, { reward_type: string; reward_amount: number | null; badge_key: string | null }> = {};
  for (const r of rewards ?? []) rewardByInstance[r.quest_instance_id] = r;

  // Load player's participation
  const { data: participations } = instanceIds.length > 0
    ? await supabase
        .from('quest_participants')
        .select('quest_instance_id, status, progress_current, progress_target, completed_at, claimed_at, reward_locked, id')
        .eq('player_id', profile.id)
        .in('quest_instance_id', instanceIds)
    : { data: [] };

  type ParticipationRow = { id: string; quest_instance_id: string; status: string; progress_current: number; progress_target: number; completed_at: string | null; claimed_at: string | null; reward_locked: boolean };
  const participationByInstance: Record<string, ParticipationRow> = {};
  for (const p of (participations as ParticipationRow[] | null) ?? []) participationByInstance[p.quest_instance_id] = p;

  // Bucket: claimable, in-progress, available, completed
  const claimable = instances.filter((qi) => {
    const p = participationByInstance[qi.id];
    return p?.status === 'completed';
  });
  const inProgress = instances.filter((qi) => {
    const p = participationByInstance[qi.id];
    return p?.status === 'active';
  });
  const available = instances.filter((qi) => !participationByInstance[qi.id]);
  const claimed = instances.filter((qi) => {
    const p = participationByInstance[qi.id];
    return p?.status === 'claimed';
  });

  const poolFull = (qi: typeof instances[number]) => {
    return qi.max_completions !== null && qi.completions_count >= qi.max_completions;
  };

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-safe-nav">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <span className="text-brand-green text-xs tracking-widest uppercase" style={G}>Quests</span>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-8">

        {/* ── Claimable ──────────────────────────────────────── */}
        {claimable.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Ready to Claim
            </h2>
            <div className="space-y-3">
              {claimable.map((qi) => (
                <QuestCard
                  key={qi.id}
                  instance={qi}
                  template={templateById[qi.template_id] ?? null}
                  reward={rewardByInstance[qi.id] ?? null}
                  participation={participationByInstance[qi.id] ?? null}
                  poolFull={poolFull(qi)}
                  highlight="claim"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── In Progress ─────────────────────────────────────── */}
        {inProgress.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              In Progress
            </h2>
            <div className="space-y-3">
              {inProgress.map((qi) => (
                <QuestCard
                  key={qi.id}
                  instance={qi}
                  template={templateById[qi.template_id] ?? null}
                  reward={rewardByInstance[qi.id] ?? null}
                  participation={participationByInstance[qi.id] ?? null}
                  poolFull={poolFull(qi)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Available ───────────────────────────────────────── */}
        {available.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Available Quests
            </h2>
            <div className="space-y-3">
              {available.filter((qi) => !poolFull(qi)).map((qi) => (
                <QuestCard
                  key={qi.id}
                  instance={qi}
                  template={templateById[qi.template_id] ?? null}
                  reward={rewardByInstance[qi.id] ?? null}
                  participation={null}
                  poolFull={false}
                />
              ))}
              {available.filter(poolFull).map((qi) => (
                <QuestCard
                  key={qi.id}
                  instance={qi}
                  template={templateById[qi.template_id] ?? null}
                  reward={rewardByInstance[qi.id] ?? null}
                  participation={null}
                  poolFull
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Completed & Claimed ─────────────────────────────── */}
        {claimed.length > 0 && (
          <section>
            <h2 className="text-white/40 text-[10px] tracking-widest uppercase mb-3" style={G}>
              Completed
            </h2>
            <div className="space-y-2">
              {claimed.map((qi) => (
                <QuestCard
                  key={qi.id}
                  instance={qi}
                  template={templateById[qi.template_id] ?? null}
                  reward={rewardByInstance[qi.id] ?? null}
                  participation={participationByInstance[qi.id] ?? null}
                  poolFull={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Empty ───────────────────────────────────────────── */}
        {instances.length === 0 && (
          <div className="text-center py-20">
            <p className="text-white text-xl tracking-widest uppercase" style={G}>No Active Quests</p>
            <p className="text-white/30 text-sm mt-2" style={I}>
              Quests are created by admins. Check back soon.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
