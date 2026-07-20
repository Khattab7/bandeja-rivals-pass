'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { updateProfile } from '@/app/actions/profile';
import InstallPWAButton from '@/components/InstallPWAButton';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

type Profile = {
  id: string;
  displayName: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  primary_area: string | null;
  gender: string | null;
  dominant_hand: string | null;
  preferred_side: string | null;
  years_playing_padel: number | null;
  match_type_preference: string | null;
  current_rating: number;
  starting_rating: number;
  starting_rating_source: string;
  profile_completion_percent: number;
  match_ready: boolean;
  is_suspended: boolean;
  public_player_id: string | null;
};

type Stats = {
  matches_played: number;
  rated_matches_played: number;
  friendly_matches_played: number;
  wins: number;
  losses: number;
  current_winning_streak: number;
  best_winning_streak: number;
  current_beat_expected_streak: number;
  best_beat_expected_streak: number;
  times_beat_expected: number;
  upset_wins: number;
  bars_active_balance: number;
  bars_locked_pending: number;
  bars_total_earned: number;
  highest_rating_ever: number | null;
  lowest_rating_ever: number | null;
  cached_recent_form: string | null;
} | null;

type Team = { id: string; name: string; rating: number; status: string; isCaptain: boolean };

type RatingEvent = {
  id: string;
  event_type: string;
  rating_before: number;
  rating_change: number;
  rating_after: number;
  created_at: string;
};

type MemberInfo = { is_active: boolean; valid_until: string; member_id_ref: string } | null;

type EditDraft = {
  display_name: string | null;
  username: string | null;
  city: string | null;
  primary_area: string | null;
  dominant_hand: string | null;
  preferred_side: string | null;
  years_playing_padel: number | null;
  match_type_preference: string | null;
};

export default function ProfileClient({
  profile,
  stats,
  teams,
  ratingEvents,
  memberInfo,
  isOwnProfile,
  appUrl,
  userId,
}: {
  profile: Profile;
  stats: Stats;
  teams: Team[];
  ratingEvents: RatingEvent[];
  memberInfo: MemberInfo;
  isOwnProfile: boolean;
  appUrl: string;
  userId?: string;
}) {
  type Tab = 'overview' | 'stats' | 'pass';
  const tabs: Tab[] = isOwnProfile ? ['overview', 'stats', 'pass'] : ['overview', 'stats'];
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // ─── Local profile fields (updated after successful edit save) ──────────
  const [localDisplayName, setLocalDisplayName] = useState(profile.displayName);
  const [localAvatarUrl, setLocalAvatarUrl] = useState(profile.avatar_url);
  const [localUsername, setLocalUsername] = useState(profile.username);
  const [localCity, setLocalCity] = useState(profile.city);
  const [localArea, setLocalArea] = useState(profile.primary_area);
  const [localHand, setLocalHand] = useState(profile.dominant_hand);
  const [localSide, setLocalSide] = useState(profile.preferred_side);
  const [localYears, setLocalYears] = useState(profile.years_playing_padel);
  const [localMatchPref, setLocalMatchPref] = useState(profile.match_type_preference);

  // ─── PWA install state ──────────────────────────────────────────────────
  const [isPwaInstalled, setIsPwaInstalled] = useState(true); // default true to avoid flash

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isDismissed = localStorage.getItem('pwa_install_dismissed') === '1';
    setIsPwaInstalled(isStandalone || isDismissed);
  }, []);

  // ─── Edit mode ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<File | null>(null);

  const [draft, setDraft] = useState<EditDraft>({
    display_name: profile.display_name,
    username: profile.username,
    city: profile.city,
    primary_area: profile.primary_area,
    dominant_hand: profile.dominant_hand,
    preferred_side: profile.preferred_side,
    years_playing_padel: profile.years_playing_padel,
    match_type_preference: profile.match_type_preference,
  });

  function openEdit() {
    setDraft({
      display_name: profile.display_name,
      username: localUsername,
      city: localCity,
      primary_area: localArea,
      dominant_hand: localHand,
      preferred_side: localSide,
      years_playing_padel: localYears,
      match_type_preference: localMatchPref,
    });
    setAvatarPreview(null);
    avatarFileRef.current = null;
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
    setAvatarPreview(null);
    avatarFileRef.current = null;
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be under 5MB.');
      return;
    }
    avatarFileRef.current = file;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      let newAvatarUrl = localAvatarUrl;

      if (avatarFileRef.current && userId) {
        const file = avatarFileRef.current;
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${userId}/avatar.${ext}`;
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) {
          setSaveError('Avatar upload failed: ' + uploadError.message);
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        newAvatarUrl = publicUrl;
      }

      const result = await updateProfile(profile.id, {
        ...draft,
        avatar_url: newAvatarUrl,
      });

      if (result.error) {
        setSaveError(result.error);
        return;
      }

      // Compute new display name with same fallback logic as the server
      const computedName =
        draft.display_name?.trim() ||
        (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : null) ||
        draft.username?.trim() ||
        localDisplayName;

      setLocalDisplayName(computedName ?? localDisplayName);
      setLocalAvatarUrl(newAvatarUrl ?? null);
      setLocalUsername(draft.username);
      setLocalCity(draft.city);
      setLocalArea(draft.primary_area);
      setLocalHand(draft.dominant_hand);
      setLocalSide(draft.preferred_side);
      setLocalYears(draft.years_playing_padel);
      setLocalMatchPref(draft.match_type_preference);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // ─── Derived values ─────────────────────────────────────────────────────
  const winRate = (stats?.rated_matches_played ?? 0) > 0
    ? Math.round(((stats?.wins ?? 0) / (stats?.rated_matches_played ?? 1)) * 100)
    : 0;

  const passActive = memberInfo?.is_active && memberInfo.valid_until && new Date(memberInfo.valid_until) > new Date();
  const passExpired = memberInfo && !passActive;

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  }

  function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return formatDate(d);
  }

  // ─── Avatar element (shared between view and edit) ──────────────────────
  const avatarSrc = avatarPreview ?? localAvatarUrl;

  return (
    <main className="flex-1 max-w-lg mx-auto w-full">

      {/* ── Edit overlay ─────────────────────────────────────────── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: '#0a0a0a', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
            <button
              onClick={cancelEdit}
              className="text-white/50 text-sm hover:text-white/80 transition-colors"
              style={I}
            >
              Cancel
            </button>
            <span className="text-white text-[11px] tracking-widest uppercase" style={G}>Edit Profile</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-brand-green text-sm font-semibold hover:text-brand-green/70 transition-colors disabled:opacity-40"
              style={I}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {saveError && (
            <div className="mx-5 mt-3 px-4 py-2.5 border border-red-500/30 bg-red-500/8 flex-shrink-0">
              <p className="text-red-400 text-xs" style={I}>{saveError}</p>
            </div>
          )}

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7">

            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative group"
                aria-label="Change profile photo"
              >
                <div
                  className="w-24 h-24 rounded-full border-2 overflow-hidden flex items-center justify-center"
                  style={{ borderColor: '#444', background: '#1a1a1a' }}
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-12 h-12" fill="#555">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                  )}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
                    <path d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM19 6.5h-2.17l-1.24-1.35A2 2 0 0 0 14.12 4.5H9.88A2 2 0 0 0 8.41 5.15L7.17 6.5H5A2 2 0 0 0 3 8.5v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-10a2 2 0 0 0-2-2z"/>
                  </svg>
                </div>
              </button>
              <span className="text-white/25 text-[9px] tracking-widest uppercase" style={G}>Tap to change photo</span>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>

            <div className="border-t border-white/8" />

            {/* Nickname / Display Name */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Nickname
              </label>
              <input
                type="text"
                value={draft.display_name ?? ''}
                onChange={(e) => setDraft(d => ({ ...d, display_name: e.target.value }))}
                placeholder="e.g. El Diablo"
                maxLength={50}
                className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-white text-sm focus:border-brand-green/40 focus:outline-none transition-colors"
                style={I}
              />
              <p className="text-white/20 text-[9px] mt-1.5 leading-relaxed" style={I}>
                Shown as your name on the platform. Leave blank to use your real name.
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Username
              </label>
              <div className="flex items-center border border-white/20 focus-within:border-brand-green/40 transition-colors">
                <span className="text-white/25 text-sm px-3 select-none" style={I}>@</span>
                <input
                  type="text"
                  value={draft.username ?? ''}
                  onChange={(e) =>
                    setDraft(d => ({ ...d, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') }))
                  }
                  placeholder="your_handle"
                  maxLength={30}
                  className="flex-1 bg-transparent py-2.5 pr-3 text-white text-sm focus:outline-none"
                  style={I}
                />
              </div>
            </div>

            {/* City & Area */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>City</label>
                <input
                  type="text"
                  value={draft.city ?? ''}
                  onChange={(e) => setDraft(d => ({ ...d, city: e.target.value }))}
                  placeholder="Cairo"
                  maxLength={60}
                  className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-white text-sm focus:border-brand-green/40 focus:outline-none transition-colors"
                  style={I}
                />
              </div>
              <div>
                <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>Area</label>
                <input
                  type="text"
                  value={draft.primary_area ?? ''}
                  onChange={(e) => setDraft(d => ({ ...d, primary_area: e.target.value }))}
                  placeholder="Maadi"
                  maxLength={60}
                  className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-white text-sm focus:border-brand-green/40 focus:outline-none transition-colors"
                  style={I}
                />
              </div>
            </div>

            {/* Dominant Hand */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Dominant Hand
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['right', 'left', 'ambidextrous'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, dominant_hand: d.dominant_hand === val ? null : val }))}
                    className="py-2 border text-[10px] tracking-widest uppercase transition-colors"
                    style={{
                      ...G,
                      borderColor: draft.dominant_hand === val ? '#8CF702' : 'rgba(255,255,255,0.15)',
                      color: draft.dominant_hand === val ? '#8CF702' : 'rgba(255,255,255,0.35)',
                      background: draft.dominant_hand === val ? 'rgba(140,247,2,0.08)' : 'transparent',
                    }}
                  >
                    {val === 'ambidextrous' ? 'Both' : val.charAt(0).toUpperCase() + val.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred Side */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Preferred Court Side
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['right', 'left', 'no_preference'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, preferred_side: d.preferred_side === val ? null : val }))}
                    className="py-2 border text-[10px] tracking-widest uppercase transition-colors"
                    style={{
                      ...G,
                      borderColor: draft.preferred_side === val ? '#8CF702' : 'rgba(255,255,255,0.15)',
                      color: draft.preferred_side === val ? '#8CF702' : 'rgba(255,255,255,0.35)',
                      background: draft.preferred_side === val ? 'rgba(140,247,2,0.08)' : 'transparent',
                    }}
                  >
                    {val === 'no_preference' ? 'Either' : val.charAt(0).toUpperCase() + val.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Years Playing Padel */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Years Playing Padel
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={draft.years_playing_padel ?? ''}
                onChange={(e) =>
                  setDraft(d => ({ ...d, years_playing_padel: e.target.value === '' ? null : Number(e.target.value) }))
                }
                placeholder="0"
                className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-white text-sm focus:border-brand-green/40 focus:outline-none transition-colors"
                style={I}
              />
            </div>

            {/* Match Type Preference */}
            <div>
              <label className="block text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>
                Match Preference
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['friendly', 'rated', 'both'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, match_type_preference: d.match_type_preference === val ? null : val }))}
                    className="py-2 border text-[10px] tracking-widest uppercase transition-colors"
                    style={{
                      ...G,
                      borderColor: draft.match_type_preference === val ? '#8CF702' : 'rgba(255,255,255,0.15)',
                      color: draft.match_type_preference === val ? '#8CF702' : 'rgba(255,255,255,0.35)',
                      background: draft.match_type_preference === val ? 'rgba(140,247,2,0.08)' : 'transparent',
                    }}
                  >
                    {val.charAt(0).toUpperCase() + val.slice(1)}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Hero card ──────────────────────────────────────── */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-full border-2 flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ borderColor: passActive ? '#8CF702' : '#444', background: '#1a1a1a' }}
          >
            {localAvatarUrl ? (
              <img src={localAvatarUrl} alt={localDisplayName} className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill={passActive ? '#8CF702' : '#555'}>
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-lg tracking-wide uppercase" style={G}>
                {localDisplayName}
              </h1>
              {passActive && (
                <span className="text-[8px] tracking-widest px-2 py-0.5 uppercase" style={{ ...G, background: 'rgba(140,247,2,0.12)', color: '#8CF702', border: '1px solid rgba(140,247,2,0.4)' }}>
                  RIVAL
                </span>
              )}
              {profile.is_suspended && (
                <span className="text-[8px] tracking-widest px-2 py-0.5 uppercase" style={{ ...G, background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)' }}>
                  SUSPENDED
                </span>
              )}
            </div>
            {localUsername && (
              <p className="text-white/30 text-xs mt-0.5" style={I}>@{localUsername}</p>
            )}
            {(localCity || localArea) && (
              <p className="text-white/40 text-xs mt-1" style={I}>
                {localCity}{localArea ? ` · ${localArea}` : ''}
              </p>
            )}
            {isOwnProfile && (
              <button
                onClick={openEdit}
                className="mt-2.5 text-[9px] tracking-widest uppercase border border-white/15 px-3 py-1 text-white/35 hover:text-white/60 hover:border-white/30 transition-colors"
                style={G}
              >
                Edit Profile
              </button>
            )}
          </div>

          {/* Rating */}
          <div className="text-right flex-shrink-0">
            <div className="text-white text-3xl font-bold leading-none" style={G}>
              {profile.current_rating}
            </div>
            <div className="text-white/30 text-[9px] tracking-widest uppercase mt-0.5" style={G}>Rating</div>
            {stats?.cached_recent_form && (
              <div className="flex gap-0.5 justify-end mt-1.5">
                {stats.cached_recent_form.split('').slice(0, 5).map((c, i) => (
                  <span key={i} className="w-3 h-3 text-[7px] flex items-center justify-center font-bold"
                    style={{ color: c === 'W' ? '#8CF702' : '#ef4444' }}>
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick stat chips */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { label: 'Rated', value: stats?.rated_matches_played ?? 0 },
            { label: 'Wins', value: stats?.wins ?? 0, color: '#8CF702' },
            { label: 'Win %', value: `${winRate}%` },
            { label: 'Streak', value: stats?.current_winning_streak ?? 0 },
          ].map((s) => (
            <div key={s.label} className="border border-white/10 px-3 py-1.5 text-center" style={{ background: '#111' }}>
              <div className="text-[8px] tracking-widest uppercase text-white/30" style={G}>{s.label}</div>
              <div className="text-sm font-bold" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-[10px] tracking-widest uppercase transition-colors"
            style={{
              ...G,
              color: activeTab === tab ? '#8CF702' : 'rgba(255,255,255,0.3)',
              borderBottom: activeTab === tab ? '2px solid #8CF702' : '2px solid transparent',
            }}
          >
            {tab === 'pass' ? 'Rivals Pass' : tab}
          </button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="px-4 py-5 space-y-6">

          {/* Teams */}
          {teams.length > 0 && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Teams</h3>
              <div className="space-y-2">
                {teams.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${t.id}`}
                    className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-white/20 transition-colors"
                    style={{ background: '#111' }}
                  >
                    <div>
                      <p className="text-white text-sm tracking-wide" style={G}>{t.name}</p>
                      {t.isCaptain && <p className="text-brand-green text-[9px] tracking-widest uppercase mt-0.5" style={G}>Captain</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold" style={G}>{t.rating}</div>
                      <div className="text-white/30 text-[8px]" style={G}>Rating</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent rating history */}
          {ratingEvents.length > 0 && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Rating History</h3>
              <div className="space-y-1.5">
                {ratingEvents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 border border-white/5" style={{ background: '#0d0d0d' }}>
                    <div>
                      <span className="text-white/40 text-[10px] tracking-widest uppercase" style={G}>
                        {e.event_type.replace('_', ' ')}
                      </span>
                      <span className="text-white/20 text-[9px] ml-2" style={I}>{formatRelative(e.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-bold"
                        style={{ ...G, color: e.rating_change > 0 ? '#8CF702' : e.rating_change < 0 ? '#ef4444' : '#666' }}
                      >
                        {e.rating_change > 0 ? '+' : ''}{e.rating_change}
                      </span>
                      <span className="text-white/50 text-sm font-bold" style={G}>{e.rating_after}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Playing info */}
          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Playing Info</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Hand', value: localHand ? localHand.charAt(0).toUpperCase() + localHand.slice(1) : '—' },
                { label: 'Side', value: localSide ? localSide.replace('_', ' ') : '—' },
                { label: 'Years Playing', value: localYears != null ? `${localYears}y` : '—' },
                { label: 'Prefers', value: localMatchPref ?? '—' },
              ].map((item) => (
                <div key={item.label} className="border border-white/10 px-3 py-2" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>{item.label}</div>
                  <div className="text-white text-sm mt-0.5 capitalize" style={I}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Bars teaser (own profile only) */}
          {isOwnProfile && (
            <section>
              <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>BANDEJA Bars</h3>
              <Link
                href="/bars"
                className="flex items-center justify-between border border-white/10 px-4 py-3 hover:border-brand-green/30 transition-colors"
                style={{ background: '#111' }}
              >
                <div>
                  <p className="text-white/50 text-[9px] tracking-widest uppercase" style={G}>Active Balance</p>
                  <p className="text-brand-green text-xl font-bold mt-0.5" style={G}>
                    {(stats?.bars_active_balance ?? 0).toFixed(1)} <span className="text-xs text-brand-green/60">BARS</span>
                  </p>
                  {(stats?.bars_locked_pending ?? 0) > 0 && (
                    <p className="text-white/30 text-[9px] mt-0.5" style={I}>
                      + {(stats?.bars_locked_pending ?? 0).toFixed(1)} locked
                    </p>
                  )}
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/30" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
            </section>
          )}

          {/* Profile completion checklist */}
          {isOwnProfile && (profile.profile_completion_percent < 100 || !isPwaInstalled) && (() => {
            const items: { label: string; done: boolean; editable: boolean; note?: string }[] = [
              { label: 'First name',     done: !!profile.first_name?.trim(),    editable: false, note: 'set during sign-up' },
              { label: 'Last name',      done: !!profile.last_name?.trim(),     editable: false, note: 'set during sign-up' },
              { label: 'Gender',         done: !!profile.gender,                editable: false, note: 'set during sign-up' },
              { label: 'City',           done: !!profile.city?.trim(),          editable: true },
              { label: 'Home area',      done: !!profile.primary_area?.trim(),  editable: true },
              { label: 'Dominant hand',  done: !!profile.dominant_hand,         editable: true },
              { label: 'Install the app', done: isPwaInstalled,                 editable: false, note: 'check your notifications' },
            ];
            const missing = items.filter(i => !i.done);
            const hasEditable = missing.some(i => i.editable);
            const completedCount = items.filter(i => i.done).length;
            const pct = Math.round((completedCount / items.length) * 100);
            return (
              <div className="border border-yellow-500/20 bg-yellow-500/5 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-yellow-400 text-[10px] tracking-widest uppercase" style={G}>
                    Profile {pct}% complete
                  </p>
                  {hasEditable && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-yellow-400 text-[10px] tracking-widest uppercase hover:text-yellow-300 transition-colors"
                      style={G}
                    >
                      Fill in missing →
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className={`text-[10px] w-3 ${item.done ? 'text-brand-green' : 'text-yellow-400/60'}`}>
                        {item.done ? '✓' : '○'}
                      </span>
                      <span className={`text-xs ${item.done ? 'text-white/30 line-through' : 'text-white/60'}`} style={I}>
                        {item.label}
                      </span>
                      {!item.done && item.note && (
                        <span className="text-white/20 text-[9px]" style={I}>— {item.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Stats tab ─────────────────────────────────────── */}
      {activeTab === 'stats' && (
        <div className="px-4 py-5 space-y-6">
          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Match Record</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Rated', value: stats?.rated_matches_played ?? 0 },
                { label: 'Wins', value: stats?.wins ?? 0, color: '#8CF702' },
                { label: 'Losses', value: stats?.losses ?? 0, color: '#ef4444' },
                { label: 'Win Rate', value: `${winRate}%` },
                { label: 'Friendly', value: stats?.friendly_matches_played ?? 0 },
                { label: 'Total', value: stats?.matches_played ?? 0 },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase" style={G}>{s.label}</div>
                  <div className="text-lg font-bold mt-0.5" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Streaks</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Current Win Streak', value: stats?.current_winning_streak ?? 0, color: '#8CF702' },
                { label: 'Best Win Streak', value: stats?.best_winning_streak ?? 0 },
                { label: 'Beat Expected Streak', value: stats?.current_beat_expected_streak ?? 0, color: '#8CF702' },
                { label: 'Best Beat Expected', value: stats?.best_beat_expected_streak ?? 0 },
                { label: 'Times Beat Expected', value: stats?.times_beat_expected ?? 0 },
                { label: 'Upset Wins', value: stats?.upset_wins ?? 0 },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase leading-tight" style={G}>{s.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Rating Extremes</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Current', value: profile.current_rating },
                { label: 'Highest Ever', value: stats?.highest_rating_ever ?? profile.current_rating, color: '#8CF702' },
                { label: 'Starting', value: profile.starting_rating, sub: profile.starting_rating_source === 'rating_guess' ? 'from guess' : profile.starting_rating_source === 'admin_override' ? 'admin set' : 'default' },
              ].map((s) => (
                <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: '#111' }}>
                  <div className="text-white/30 text-[8px] tracking-widest uppercase leading-tight" style={G}>{s.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ ...G, color: (s.color as string | undefined) ?? '#fff' }}>{s.value}</div>
                  {s.sub && <div className="text-white/20 text-[8px] mt-0.5" style={I}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Pass tab (own profile only) ───────────────────── */}
      {activeTab === 'pass' && isOwnProfile && (
        <div className="px-4 py-5 space-y-4">

          {/* Pass status */}
          <div
            className="border p-5 text-center"
            style={{
              background: passActive ? 'rgba(140,247,2,0.05)' : '#111',
              borderColor: passActive ? 'rgba(140,247,2,0.3)' : '#333',
            }}
          >
            {passActive ? (
              <>
                <div className="text-brand-green text-[9px] tracking-widest uppercase mb-2" style={G}>RIVAL Pass Active</div>
                <div className="text-white text-xl font-bold" style={G}>
                  {memberInfo!.member_id_ref}
                </div>
                <div className="text-white/40 text-xs mt-2" style={I}>
                  Valid until {formatDate(memberInfo!.valid_until)}
                </div>
              </>
            ) : passExpired ? (
              <>
                <div className="text-orange-400 text-[9px] tracking-widest uppercase mb-2" style={G}>Pass Expired</div>
                <div className="text-white/50 text-sm" style={I}>
                  Your membership expired on {formatDate(memberInfo!.valid_until)}
                </div>
                <div className="text-white/30 text-xs mt-2" style={I}>Contact admin to renew</div>
              </>
            ) : (
              <>
                <div className="text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>Free Player</div>
                <div className="text-white/50 text-sm" style={I}>
                  Upgrade to RIVAL to earn active Bars and access premium features.
                </div>
              </>
            )}
          </div>

          {/* Apple Wallet button — paid members only */}
          {passActive && (
            <Link
              href="/pass"
              className="flex items-center justify-center gap-3 border border-white/20 py-4 hover:border-white/40 transition-colors"
              style={{ background: '#111' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="text-white text-sm tracking-widest uppercase" style={G}>View in Apple Wallet</span>
            </Link>
          )}

          {/* Bars summary */}
          <div className="border border-white/10 px-4 py-4" style={{ background: '#111' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>BANDEJA Bars</p>
                <p className="text-brand-green text-2xl font-bold mt-1" style={G}>
                  {(stats?.bars_active_balance ?? 0).toFixed(1)}
                </p>
                {(stats?.bars_locked_pending ?? 0) > 0 && (
                  <p className="text-white/30 text-[10px] mt-1" style={I}>
                    {(stats?.bars_locked_pending ?? 0).toFixed(1)} locked
                    {!passActive ? ' — upgrade to unlock' : ''}
                  </p>
                )}
              </div>
              <Link
                href="/bars"
                className="text-brand-green text-[10px] tracking-widest uppercase border border-brand-green/30 px-3 py-1.5 hover:bg-brand-green/5 transition-colors"
                style={G}
              >
                View History
              </Link>
            </div>
          </div>

          {/* Add to Home Screen */}
          <div className="space-y-1.5">
            <p className="text-white/20 text-[9px] tracking-widest uppercase" style={G}>App</p>
            <InstallPWAButton />
          </div>

        </div>
      )}
    </main>
  );
}
