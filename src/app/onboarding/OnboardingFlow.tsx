'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import BandejaLogo from '@/components/BandejaLogo';
import { completeOnboarding, type OnboardingData, type RatingGuessAnswers } from '@/app/actions/onboarding';

// ── Location data ─────────────────────────────────────────────
const LOCATIONS: Record<string, string[]> = {
  Cairo: ['Maadi', 'Zamalek', 'Heliopolis', 'Nasr City', '5th Settlement', 'Katameya', 'Rehab City', 'Shorouk City', 'El Tagamoa', 'New Cairo', 'Downtown Cairo', 'Other'],
  Giza:  ['Sheikh Zayed', '6th of October', 'Mohandessin', 'Dokki', 'Agouza', 'Other'],
  Alexandria: ['Smouha', 'Miami', 'Stanley', 'Muharram Bek', 'Sidi Bishr', 'Other'],
  'North Coast': ['Hacienda Bay', 'Marassi', 'Marina', 'Sahel', 'Other'],
  'Red Sea': ['Ain Sokhna', 'Hurghada', 'El Gouna', 'Other'],
  Other: ['Other'],
};

// ── Shared styles ─────────────────────────────────────────────
const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };
const input  = 'w-full bg-transparent border border-white/30 text-white placeholder-white/30 px-4 py-3 text-sm outline-none focus:border-brand-green transition-colors';
const select = 'w-full bg-[#111] border border-white/30 text-white px-4 py-3 text-sm outline-none focus:border-brand-green transition-colors appearance-none';

// ── Reusable pill option ──────────────────────────────────────
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-xs tracking-widest uppercase border transition-colors ${
        active
          ? 'border-brand-green bg-brand-green/10 text-brand-green'
          : 'border-white/30 text-white/70 hover:border-white/60'
      }`}
      style={G}
    >
      {children}
    </button>
  );
}

// ── Option card (for rating guess) ───────────────────────────
function OptionCard({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border transition-colors ${
        active
          ? 'border-brand-green bg-brand-green/10'
          : 'border-white/20 hover:border-white/50'
      }`}
    >
      <span className={`text-sm tracking-wide uppercase ${active ? 'text-brand-green' : 'text-white'}`} style={G}>{title}</span>
      {sub && <span className="block text-xs text-white/40 mt-0.5" style={I}>{sub}</span>}
    </button>
  );
}

// ── Yes / No toggle ───────────────────────────────────────────
function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-3">
      <Pill active={value === true}  onClick={() => onChange(true)}>Yes</Pill>
      <Pill active={value === false} onClick={() => onChange(false)}>No</Pill>
    </div>
  );
}

// ── Progress bar ─────────────────────────────────────────────
function ProgressBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ['Profile', 'Your Game', 'Rating Guess'];
  const pct = step >= 4 ? 100 : Math.round(((step - 1) / 3) * 100);
  return (
    <div className="mb-8">
      <div className="flex justify-between mb-2">
        {labels.map((l, i) => (
          <span
            key={l}
            className={`text-[10px] tracking-widest uppercase ${step > i + 1 ? 'text-brand-green' : step === i + 1 ? 'text-white' : 'text-white/30'}`}
            style={G}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="h-px bg-white/10">
        <div
          className="h-px bg-brand-green transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-brand-green text-[10px] tracking-[0.3em] uppercase border-b border-brand-green/30 pb-1 mb-5" style={G}>
      {children}
    </p>
  );
}

// ── Field wrapper ─────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-white/50 text-[10px] tracking-widest uppercase" style={G}>{label}</label>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════
type Step = 1 | 2 | 3 | 4;

interface FormState {
  // Step 1
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'prefer_not_to_say' | '';
  date_of_birth: string;
  city: string;
  primary_area: string;
  dominant_hand: 'right' | 'left' | 'ambidextrous' | '';
  // Step 2
  preferred_side: 'right' | 'left' | 'no_preference' | '';
  years_playing_padel: string;
  weekly_match_frequency: string;
  match_type_preference: 'friendly' | 'rated' | 'both' | '';
  // Step 3
  rating_guess_skipped: boolean;
  answers: Partial<RatingGuessAnswers>;
}

const initial: FormState = {
  first_name: '', last_name: '', gender: '', date_of_birth: '',
  city: '', primary_area: '', dominant_hand: '',
  preferred_side: '', years_playing_padel: '', weekly_match_frequency: '',
  match_type_preference: '', rating_guess_skipped: false, answers: {},
};

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep]   = useState<Step>(1);
  const [form, setForm]   = useState<FormState>(initial);
  const [result, setResult] = useState<{ rating: number; source: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  const setAnswer = (key: keyof RatingGuessAnswers, val: unknown) =>
    setForm((p) => ({ ...p, answers: { ...p.answers, [key]: val } }));

  // ── Step validation ───────────────────────────────────────
  function canAdvanceStep1() {
    return form.first_name.trim() && form.last_name.trim() && form.gender &&
           form.date_of_birth && form.city && form.primary_area && form.dominant_hand;
  }
  function canAdvanceStep2() {
    return form.preferred_side && form.weekly_match_frequency && form.match_type_preference;
  }

  // ── Submit ────────────────────────────────────────────────
  function handleSubmit(skipped: boolean) {
    setError(null);
    const answers: RatingGuessAnswers | null = skipped ? null : {
      has_played_padel: form.answers.has_played_padel ?? false,
      tournament_level: form.answers.tournament_level,
      has_tennis_background: form.answers.has_tennis_background,
      has_squash_background: form.answers.has_squash_background,
      is_padel_coach: form.answers.is_padel_coach,
      self_identifies_as_beginner: form.answers.self_identifies_as_beginner,
    };

    const data: OnboardingData = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender as OnboardingData['gender'],
      date_of_birth: form.date_of_birth,
      city: form.city,
      primary_area: form.primary_area,
      dominant_hand: form.dominant_hand as OnboardingData['dominant_hand'],
      preferred_side: form.preferred_side as OnboardingData['preferred_side'],
      years_playing_padel: form.years_playing_padel ? parseInt(form.years_playing_padel) : null,
      weekly_match_frequency: form.weekly_match_frequency,
      match_type_preference: form.match_type_preference as OnboardingData['match_type_preference'],
      rating_guess_skipped: skipped,
      answers,
    };

    startTransition(async () => {
      const res = await completeOnboarding(data);
      if (res.error) { setError(res.error); return; }
      setResult({ rating: res.starting_rating, source: res.rating_source });
      setStep(4);
    });
  }

  // ── Rating Guess completeness ─────────────────────────────
  function ratingGuessComplete() {
    const a = form.answers;
    if (a.has_played_padel === undefined) return false;
    if (!a.has_played_padel) return true;
    if (!a.tournament_level) return false;
    if (a.has_tennis_background === undefined) return false;
    if (a.has_squash_background === undefined) return false;
    if (a.is_padel_coach === undefined) return false;
    if (a.tournament_level !== 'beginner' && a.self_identifies_as_beginner === undefined) return false;
    return true;
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        {step < 4 && (
          <span className="text-white/30 text-xs tracking-widest uppercase" style={G}>
            Step {step} of 3
          </span>
        )}
      </header>

      <main className="flex-1 flex flex-col px-5 py-8 max-w-lg mx-auto w-full">
        {/* ── Step 1: Profile Basics ─────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>About You</h1>
              <p className="text-white/40 text-sm mt-1" style={I}>Let's set up your BANDEJA Rivals profile.</p>
            </div>

            <ProgressBar step={1} />

            <SectionLabel>Your Name</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name">
                <input className={input} style={I} placeholder="e.g. Mohamed" value={form.first_name}
                  onChange={(e) => set('first_name', e.target.value)} />
              </Field>
              <Field label="Last Name">
                <input className={input} style={I} placeholder="e.g. Ali" value={form.last_name}
                  onChange={(e) => set('last_name', e.target.value)} />
              </Field>
            </div>

            <SectionLabel>Personal Info</SectionLabel>
            <Field label="Gender">
              <div className="flex gap-3 flex-wrap">
                {(['male', 'female', 'prefer_not_to_say'] as const).map((g) => (
                  <Pill key={g} active={form.gender === g} onClick={() => set('gender', g)}>
                    {g === 'prefer_not_to_say' ? 'Prefer not to say' : g.charAt(0).toUpperCase() + g.slice(1)}
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label="Date of Birth">
              <input type="date" className={input} style={I} value={form.date_of_birth}
                onChange={(e) => set('date_of_birth', e.target.value)}
                max={new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} />
            </Field>

            <SectionLabel>Where You Play</SectionLabel>
            <Field label="City">
              <div className="relative">
                <select className={select} style={I} value={form.city}
                  onChange={(e) => { set('city', e.target.value); set('primary_area', ''); }}>
                  <option value="">Select city</option>
                  {Object.keys(LOCATIONS).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">▾</span>
              </div>
            </Field>

            {form.city && (
              <Field label="Primary Area">
                <div className="relative">
                  <select className={select} style={I} value={form.primary_area}
                    onChange={(e) => set('primary_area', e.target.value)}>
                    <option value="">Select area</option>
                    {LOCATIONS[form.city]?.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">▾</span>
                </div>
              </Field>
            )}

            <SectionLabel>Your Game</SectionLabel>
            <Field label="Dominant Hand">
              <div className="flex gap-3">
                {(['right', 'left', 'ambidextrous'] as const).map((h) => (
                  <Pill key={h} active={form.dominant_hand === h} onClick={() => set('dominant_hand', h)}>
                    {h.charAt(0).toUpperCase() + h.slice(1)}
                  </Pill>
                ))}
              </div>
            </Field>

            <button
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1()}
              className="w-full bg-brand-green text-black py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-30 transition-opacity mt-2"
              style={G}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── Step 2: Playing Preferences ───────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>Your Game</h1>
              <p className="text-white/40 text-sm mt-1" style={I}>How you play and what you're looking for.</p>
            </div>

            <ProgressBar step={2} />

            <SectionLabel>On Court</SectionLabel>
            <Field label="Preferred Side">
              <div className="flex gap-3">
                {(['right', 'left', 'no_preference'] as const).map((s) => (
                  <Pill key={s} active={form.preferred_side === s} onClick={() => set('preferred_side', s)}>
                    {s === 'no_preference' ? 'No Preference' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label="Years Playing Padel">
              <div className="relative">
                <select className={select} style={I} value={form.years_playing_padel}
                  onChange={(e) => set('years_playing_padel', e.target.value)}>
                  <option value="">Select (optional)</option>
                  <option value="0">Less than 1 year</option>
                  <option value="1">1 year</option>
                  <option value="2">2 years</option>
                  <option value="3">3 years</option>
                  <option value="4">4 years</option>
                  <option value="5">5 years</option>
                  <option value="7">6–7 years</option>
                  <option value="10">8–10 years</option>
                  <option value="15">10+ years</option>
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">▾</span>
              </div>
            </Field>

            <SectionLabel>Habits</SectionLabel>
            <Field label="How Often Do You Play?">
              <div className="relative">
                <select className={select} style={I} value={form.weekly_match_frequency}
                  onChange={(e) => set('weekly_match_frequency', e.target.value)}>
                  <option value="">Select frequency</option>
                  <option value="daily">Daily</option>
                  <option value="several_weekly">Several times a week</option>
                  <option value="once_weekly">Once a week</option>
                  <option value="few_monthly">A few times a month</option>
                  <option value="rarely">Rarely</option>
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">▾</span>
              </div>
            </Field>

            <Field label="Match Preference">
              <div className="flex gap-3">
                {(['friendly', 'rated', 'both'] as const).map((m) => (
                  <Pill key={m} active={form.match_type_preference === m} onClick={() => set('match_type_preference', m)}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Pill>
                ))}
              </div>
            </Field>

            {error && <p className="text-red-400 text-sm text-center" style={I}>{error}</p>}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-white/30 text-white/70 py-3 text-sm tracking-widest uppercase hover:border-white/60 transition-colors"
                style={G}
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canAdvanceStep2()}
                className="flex-[2] bg-brand-green text-black py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-30 transition-opacity"
                style={G}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Rating Guess ───────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-white text-2xl tracking-widest uppercase" style={G}>Rate Yourself</h1>
              <p className="text-white/40 text-sm mt-1" style={I}>
                Help us guess your starting rating. Takes 30 seconds — or skip for a default of 500.
              </p>
            </div>

            <ProgressBar step={3} />

            <SectionLabel>BANDEJA Rating Guess</SectionLabel>

            {/* Q1: Played before? */}
            <Field label="Have you played padel before?">
              <YesNo value={form.answers.has_played_padel} onChange={(v) => {
                setAnswer('has_played_padel', v);
                if (!v) {
                  // Clear irrelevant answers
                  setForm((p) => ({ ...p, answers: { has_played_padel: false } }));
                }
              }} />
            </Field>

            {/* Q2: Level (only if played) */}
            {form.answers.has_played_padel === true && (
              <Field label="What best describes your padel level?">
                <div className="flex flex-col gap-2">
                  {([
                    { key: 'A', label: 'Tournament — A Level', sub: 'Top competitive level' },
                    { key: 'B', label: 'Tournament — B Level', sub: 'Strong club/tournament player' },
                    { key: 'C', label: 'Tournament — C Level', sub: 'Intermediate tournament player' },
                    { key: 'D', label: 'Tournament — D Level', sub: 'Entry-level tournament player' },
                    { key: 'beginner', label: 'Recreational / Beginner', sub: 'Play for fun, no tournaments' },
                  ] as const).map(({ key, label, sub }) => (
                    <OptionCard
                      key={key}
                      active={form.answers.tournament_level === key}
                      onClick={() => {
                        setAnswer('tournament_level', key);
                        // Reset beginner modifier when level changes
                        if (key === 'beginner') setAnswer('self_identifies_as_beginner', undefined);
                      }}
                      title={label}
                      sub={sub}
                    />
                  ))}
                </div>
              </Field>
            )}

            {/* Q3-Q5: Modifiers (only if has played) */}
            {form.answers.has_played_padel === true && form.answers.tournament_level && (
              <>
                <Field label="Do you have a tennis background?">
                  <YesNo value={form.answers.has_tennis_background} onChange={(v) => setAnswer('has_tennis_background', v)} />
                </Field>
                <Field label="Do you have a squash background?">
                  <YesNo value={form.answers.has_squash_background} onChange={(v) => setAnswer('has_squash_background', v)} />
                </Field>
                <Field label="Are you currently a padel coach?">
                  <YesNo value={form.answers.is_padel_coach} onChange={(v) => setAnswer('is_padel_coach', v)} />
                </Field>
                {/* Q6: Beginner modifier — only for tournament-level players */}
                {form.answers.tournament_level !== 'beginner' && (
                  <Field label="Despite your tournament experience, do you consider yourself a beginner?">
                    <YesNo value={form.answers.self_identifies_as_beginner} onChange={(v) => setAnswer('self_identifies_as_beginner', v)} />
                  </Field>
                )}
              </>
            )}

            {error && <p className="text-red-400 text-sm text-center" style={I}>{error}</p>}

            <div className="flex flex-col gap-3 mt-2">
              <button
                onClick={() => handleSubmit(false)}
                disabled={!ratingGuessComplete() || isPending}
                className="w-full bg-brand-green text-black py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-30 transition-opacity"
                style={G}
              >
                {isPending ? 'Saving...' : 'Get My Rating →'}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  disabled={isPending}
                  className="flex-1 border border-white/30 text-white/70 py-3 text-sm tracking-widest uppercase hover:border-white/60 transition-colors disabled:opacity-30"
                  style={G}
                >
                  ← Back
                </button>
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={isPending}
                  className="flex-1 border border-white/20 text-white/40 py-3 text-sm tracking-widest uppercase hover:border-white/40 hover:text-white/60 transition-colors disabled:opacity-30"
                  style={G}
                >
                  {isPending ? '...' : 'Skip'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Result ─────────────────────────────── */}
        {step === 4 && result && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8 text-center py-8">
            <div className="space-y-2">
              <p className="text-brand-green text-[10px] tracking-[0.4em] uppercase" style={G}>
                Your Starting Rating
              </p>
              <div
                className="text-brand-green font-bold leading-none"
                style={{ ...G, fontSize: '96px' }}
              >
                {result.rating}
              </div>
              <p className="text-white/30 text-xs tracking-widest uppercase" style={G}>
                {result.source === 'rating_guess' ? 'From Rating Guess' : 'Default Rating'}
              </p>
            </div>

            <div className="border border-white/10 p-5 max-w-xs text-left space-y-2" style={{ background: '#111' }}>
              <p className="text-brand-green text-[10px] tracking-widest uppercase" style={G}>★ Good to Know</p>
              <p className="text-white/60 text-sm leading-relaxed" style={I}>
                This is BANDEJA&apos;s starting guess based on your answers.
                Your rating will become accurate as you play rated matches.
              </p>
            </div>

            <button
              onClick={() => router.push('/pass')}
              className="w-full max-w-xs bg-brand-green text-black py-4 text-sm tracking-widest uppercase font-bold"
              style={G}
            >
              Let&apos;s Play →
            </button>

            <p className="text-white/20 text-[10px] tracking-widest uppercase" style={G}>
              More Matches. More Rewards. More Rivals.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
