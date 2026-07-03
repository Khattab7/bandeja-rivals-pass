'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };

const NAV = [
  { href: '/pass',         label: 'Pass',    icon: PassIcon         },
  { href: '/teams',        label: 'Teams',   icon: TeamsIcon        },
  { href: '/play',         label: 'Play',    icon: PlayIcon         },
  { href: '/matches',      label: 'Matches', icon: MatchesIcon      },
  { href: '/leaderboards', label: 'Ranks',   icon: LeaderboardIcon  },
];

function PassIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#8CF702' : 'rgba(255,255,255,0.4)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
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

  return (
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
  );
}
