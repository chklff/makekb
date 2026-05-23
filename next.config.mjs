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

const nextConfig = {
  reactStrictMode: true,
  // typedRoutes: true,  // re-enable once /patterns /collections /versions /connections /settings exist (M2+)
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost }]
      : [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
