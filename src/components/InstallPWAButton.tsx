'use client';

import { useState, useEffect } from 'react';

const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };
const I = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPWAButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — hide everything
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
      return;
    }

    // iOS Safari doesn't fire beforeinstallprompt
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
    setIsIOS(ios);

    // Android / Chrome / Edge: capture the deferred prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleAndroidInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setAccepted(true);
      setInstallPrompt(null);
    }
  }

  // Already installed or accepted this session
  if (isStandalone || accepted) return null;

  // iOS: show a guide button
  if (isIOS) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setShowIOSGuide(v => !v)}
          className="w-full flex items-center justify-center gap-2 border border-white/15 py-3 text-[10px] tracking-widest uppercase text-white/50 hover:border-white/30 hover:text-white/70 transition-colors"
          style={G}
        >
          <ShareIcon />
          Add to Home Screen
        </button>

        {showIOSGuide && (
          <div className="border border-white/10 bg-white/3 px-4 py-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>How to install</p>
            {[
              { step: '1', text: 'Tap the Share button (⬆) in the Safari toolbar at the bottom of your screen' },
              { step: '2', text: 'Scroll down in the share sheet and tap "Add to Home Screen"' },
              { step: '3', text: 'Tap "Add" in the top-right corner to confirm' },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-3">
                <span
                  className="shrink-0 w-5 h-5 rounded-full border border-brand-green/40 flex items-center justify-center text-brand-green text-[9px] font-bold"
                  style={G}
                >
                  {step}
                </span>
                <p className="text-white/50 text-xs leading-relaxed" style={I}>{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Android/Chrome: show button only when the browser has a pending install prompt
  if (!installPrompt) return null;

  return (
    <button
      onClick={handleAndroidInstall}
      className="w-full flex items-center justify-center gap-2 border border-brand-green/30 bg-brand-green/5 py-3 text-[10px] tracking-widest uppercase text-brand-green hover:bg-brand-green/10 transition-colors"
      style={G}
    >
      <DownloadIcon />
      Add to Home Screen
    </button>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
