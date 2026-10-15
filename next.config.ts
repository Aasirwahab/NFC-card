import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The new landing page is the front door; the previous home page stays at /legacy.
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/insignar' }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
