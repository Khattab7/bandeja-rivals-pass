import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy server-side packages out of the bundled Lambda JS so V8 only
  // parses them on first require() rather than at every cold-start.
  serverExternalPackages: [
    '@supabase/supabase-js',
    '@supabase/ssr',
    'web-push',
    'sharp',
  ],
  async headers() {
    return [
      {
        // Prevent iOS Safari from caching the SW script via HTTP cache.
        // Without this the browser serves a stale sw.js and the SW never updates.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
