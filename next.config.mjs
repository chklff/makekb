/** @type {import('next').NextConfig} */

// Derive the Supabase hostname from env so the repo works for any new install.
// Falls back to a wildcard supabase.co pattern if the env var isn't readable at build time.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = (() => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
})();

const isDev = process.env.NODE_ENV !== 'production';

// ──────────────────────────────────────────────────────────
// Security headers (SEC-M6)
// ──────────────────────────────────────────────────────────
// Content-Security-Policy is the big one. Tuned for:
//   - Next.js 15 + React 19 (server-render + hydration scripts)
//   - Tailwind + inline style attributes from utility classes
//   - Supabase browser client (auth + RLS-scoped queries)
//   - Google OAuth flow (top-level redirect, not iframe)
//   - Dev mode: Turbopack HMR over websocket + eval
//
// Known compromise: 'unsafe-inline' on script-src. Next.js still inlines its
// hydration bootstrap. A nonce-based CSP would be the proper fix — tracked
// in PLAN.md as a v1.5 hardening item.

const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : 'https://*.supabase.co';

const cspDirectives = [
  `default-src 'self'`,
  // Scripts: 'self' + 'unsafe-inline' for hydration; 'unsafe-eval' in dev for Turbopack.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Styles: 'unsafe-inline' for utility-class style attributes + Next.js critical CSS.
  `style-src 'self' 'unsafe-inline'`,
  // Images: 'self', data: URIs (Lucide SVGs occasionally inline), Supabase Storage
  // for future blueprint screenshots, and Google profile photos.
  `img-src 'self' data: blob: ${supabaseOrigin} https://lh3.googleusercontent.com`,
  // Fonts: 'self' (next/font self-hosts at build time), data: for inline fallbacks.
  `font-src 'self' data:`,
  // XHR/fetch targets: same-origin for /api/*, Supabase for browser auth + queries.
  // Anthropic + OpenAI are server-only (never called from browser) so not listed.
  // Dev adds the Turbopack HMR websocket.
  `connect-src 'self' ${supabaseOrigin} wss://${supabaseHost ?? '*.supabase.co'}${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  // No <object>, <embed>, <applet>.
  `object-src 'none'`,
  // Top-level navigation only — block being framed by any other site (clickjacking).
  `frame-ancestors 'none'`,
  // Form posts only to same-origin (sign-out form, etc.).
  `form-action 'self'`,
  // Lock <base href> tampering.
  `base-uri 'self'`,
  // Worker scripts: same-origin only.
  `worker-src 'self' blob:`,
  // Manifest (for PWA if we ever add one).
  `manifest-src 'self'`,
  // In prod only: silently upgrade any stray http:// URL to https://.
  ...(isDev ? [] : ['upgrade-insecure-requests']),
];

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspDirectives.join('; '),
  },
  // HSTS: force HTTPS for 1 year. No-op on localhost (browser ignores).
  // `preload` omitted — only set that if you submit to hstspreload.org.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // Clickjacking defense (redundant with CSP frame-ancestors but harmless).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referer leakage to other origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features we don't use. interest-cohort blocks FLoC.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  // typedRoutes: true,  // re-enable once /patterns /collections /versions /connections /settings exist (M2+)
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost }]
      : [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  async headers() {
    return [
      {
        // Apply to every route. JSON API responses get them too — harmless,
        // and means /api/health etc. also have the protection.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
