'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };

const NAV = [
  { href: '/profile',      label: 'Profile', icon: ProfileIcon      },
  { href: '/teams',        label: 'Teams',   icon: TeamsIcon        },
  { href: '/play',         label: 'Play',    icon: PlayIcon         },
  { href: '/matches',      label: 'Matches', icon: MatchesIcon      },
  { href: '/leaderboards', label: 'Ranks',   icon: LeaderboardIcon  },
];

function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? '#8CF702' : 'rgba(255,255,255,0.4)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.58-6 8-6s8 2 8 6"/>
    </svg>
  );
}

function TeamsIcon({ active }: { active: boolean }) {
  const c = active ? '#8CF702' : 'rgba(255,255,255,0.4)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3"/>
      <circle cx="15" cy="8" r="3"/>
      <path d="M3 19c0-3.314 2.686-5 6-5"/>
      <path d="M21 19c0-3.314-2.686-5-6-5"/>
    </svg>
  );
}

function PlayIcon({ active }: { active: boolean }) {
  const c = active ? '#8CF702' : 'rgba(255,255,255,0.4)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" fill={active ? '#8CF702' : 'none'}/>
    </svg>
  );
}

function LeaderboardIcon({ active }: { active: boolean }) {
  const c = active ? '#8CF702' : 'rgba(255,255,255,0.4)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="12" width="4" height="9" rx="1"/>
      <rect x="9" y="7" width="4" height="14" rx="1"/>
      <rect x="16" y="3" width="4" height="18" rx="1"/>
    </svg>
  );
}

function MatchesIcon({ active }: { active: boolean }) {
  const c = active ? '#8CF702' : 'rgba(255,255,255,0.4)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="12" y1="3" x2="12" y2="21"/>
      <circle cx="8" cy="12" r="1.5" fill={c} stroke="none"/>
      <circle cx="16" cy="12" r="1.5" fill={c} stroke="none"/>
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const aiActive = pathname === '/ai';

  return (
    <>
      {/* Floating AI button — hidden on /ai page */}
      {!aiActive && (
        <Link
          href="/ai"
          className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, #8CF702 0%, #6bc500 100%)', boxShadow: '0 0 20px rgba(140,247,2,0.35)' }}
          aria-label="Open BANDEJA AI"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z" fill="#000" />
            <path d="M19 2L19.75 5.25L23 6L19.75 6.75L19 10L18.25 6.75L15 6L18.25 5.25L19 2Z" fill="#000" opacity="0.5" />
          </svg>
        </Link>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-brand-dark border-t border-white/10 flex justify-around items-center h-16 z-50 max-w-lg mx-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1 py-2"
            >
              <Icon active={active} />
              <span
                className="text-[9px] tracking-widest uppercase"
                style={{ ...G, color: active ? '#8CF702' : 'rgba(255,255,255,0.4)' }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
