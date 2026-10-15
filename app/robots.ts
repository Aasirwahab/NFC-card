import type { MetadataRoute } from 'next';

/**
 * The landing is public; prospect pages (/c/…), the rep app and the operator
 * console are not. The root layout already sets noindex, and the landing opts in.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/insignar', '/facts', '/how-it-works', '/llms.txt'],
        disallow: [
          '/c/',
          '/ops',
          '/dashboard',
          '/events',
          '/sessions',
          '/cards',
          '/settings',
          '/api/',
        ],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
