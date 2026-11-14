import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES } from '@/lib/site';

/** Public pages, from lib/site.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!base) return [];
  return PUBLIC_PAGES.map(({ path, lastModified, priority }) => ({
    url: path === '/' ? `${base}/` : `${base}${path}`,
    lastModified,
    changeFrequency: 'monthly',
    priority,
  }));
}
