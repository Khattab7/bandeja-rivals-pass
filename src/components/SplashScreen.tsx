'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function SplashScreen() {
  // Start visible so the splash is in the initial HTML — prevents content flash before hydration
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Already shown this session — hide immediately with no animation
    if (sessionStorage.getItem('splash_shown')) {
      setVisible(false);
      return;
    }
    sessionStorage.setItem('splash_shown', '1');

    // Start fade-out after 1.6s
    const fadeTimer = setTimeout(() => setFading(true), 1600);
    // Remove from DOM after fade completes
    const removeTimer = setTimeout(() => setVisible(false), 2100);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        transition: 'opacity 0.5s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      <style>{`
        @keyframes splashLogoIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashTagIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .splash-logo {
          animation: splashLogoIn 0.5s ease forwards;
        }
        .splash-tag {
          animation: splashTagIn 0.5s ease 0.6s forwards;
          opacity: 0;
        }
        .splash-dot {
          animation: splashTagIn 0.5s ease 0.9s forwards;
          opacity: 0;
        }
      `}</style>

      <div className="splash-logo">
        <Image
          src="/bandeja-logo.png"
          alt="BANDEJA"
          width={180}
          height={44}
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      <p
        className="splash-tag"
        style={{
          fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif',
          color: 'rgba(255,255,255,0.25)',
          fontSize: '10px',
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
        }}
      >
        Swipe · Battle · Repeat
      </p>

      <div className="splash-dot" style={{ position: 'absolute', bottom: '2.5rem' }}>
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#8CF702',
          opacity: 0.6,
        }} />
      </div>
    </div>
  );
}
