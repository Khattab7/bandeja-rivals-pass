'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const input = b64.trim();
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // raw is now a binary string of bytes 0-255
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = 'loading' | 'hidden' | 'prompt' | 'subscribing' | 'done' | 'error';

export default function EnablePushBanner() {
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState('hidden');
      return;
    }
    if (Notification.permission === 'denied') { setState('hidden'); return; }

    if (Notification.permission === 'granted') {
      // Permission already given — try to subscribe silently, show retry if it fails
      subscribe().then(() => setState('done')).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setState('error');
      });
      return;
    }

    setState('prompt');
  }, []);

  async function handleAllow() {
    setState('subscribing');
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('hidden'); return; }
      await subscribe();
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  async function handleRetry() {
    setState('subscribing');
    setError('');
    try {
      await subscribe();
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  if (state === 'loading' || state === 'hidden' || state === 'done') return null;

  return (
    <div className="mx-4 mb-4 border border-brand-green/30 bg-brand-green/5 rounded px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p
            className="text-white text-xs tracking-widest uppercase"
            style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}
          >
            {state === 'error' ? 'Push Notifications' : 'Enable Push Notifications'}
          </p>
          <p
            className="text-white/40 text-xs mt-0.5"
            style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
          >
            {state === 'error'
              ? 'Tap Retry to reconnect'
              : 'Get notified about matches, challenges & more'}
          </p>
        </div>
        {state === 'prompt' && (
          <button
            onClick={handleAllow}
            className="shrink-0 border border-brand-green text-brand-green text-xs tracking-widest uppercase px-3 py-2 hover:bg-brand-green/10 transition-colors"
            style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}
          >
            Allow
          </button>
        )}
        {state === 'subscribing' && (
          <span className="text-brand-green text-xs tracking-widest uppercase" style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}>
            ...
          </span>
        )}
        {state === 'error' && (
          <button
            onClick={handleRetry}
            className="shrink-0 border border-brand-green text-brand-green text-xs tracking-widest uppercase px-3 py-2 hover:bg-brand-green/10 transition-colors"
            style={{ fontFamily: 'Gobold, Arial Narrow, Arial, sans-serif' }}
          >
            Retry
          </button>
        )}
      </div>
      {state === 'error' && error && (
        <p className="text-red-400 text-[10px]">{error}</p>
      )}
    </div>
  );
}

async function subscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    ) as BufferSource,
  });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys?.p256dh) {
    throw new Error('Subscription object missing keys');
  }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Server error ${res.status}: ${text}`);
  }
}
