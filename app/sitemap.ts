import type { MetadataRoute } from 'next';

/** One public page today. Add /privacy once the controller details are real. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!base) return [];
  return [{ url: `${base}/`, changeFrequency: 'monthly', priority: 1 }];
}
