import type { MetadataRoute } from 'next';

/** Public pages. Add /privacy once the controller details are real. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!base) return [];
  return [
    { url: `${base}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/facts`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/vs/digital-business-cards`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
