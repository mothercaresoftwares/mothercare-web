import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* ── Dev Origins ──────────────────────────────── */
  /* Next.js blocks cross-origin requests to dev-only assets and endpoints by
     default. When the dev server is opened from the LAN address, the machine
     hostname, or a tunnel, those requests are rejected and the React Flight
     client fails with "Cannot read properties of null (reading 'enqueueModel')".
     Only the hostname is matched — no scheme, no port. */
  allowedDevOrigins: [
    '127.0.0.1',
    '0.0.0.0',
    '192.168.0.107',
    'hasan-Latitude-E6430',
    '*.local',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.trycloudflare.com',
    '*.loca.lt',
  ],

  /* ── Server ──────────────────────────────────── */
  serverExternalPackages: ['dotenv'],

  /* ── Headers (CORS + Security) ──────────────── */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },

  /* ── Redirects ───────────────────────────────── */
  async redirects() {
    return [];
  },
};

export default nextConfig;
