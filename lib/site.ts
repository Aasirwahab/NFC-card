/**
 * The public, indexable pages. The sitemap is built from this list and
 * tests/unit/public-pages.test.ts checks each one has a canonical that matches its path.
 * Bump `lastModified` when a page's content changes.
 */
export const PUBLIC_PAGES: { path: string; lastModified: string; priority: number }[] = [
  { path: '/', lastModified: '2026-11-13', priority: 1 },
  { path: '/pricing', lastModified: '2026-11-13', priority: 0.8 },
  { path: '/facts', lastModified: '2026-11-13', priority: 0.6 },
  { path: '/vs/digital-business-cards', lastModified: '2026-11-13', priority: 0.6 },
  { path: '/after-networking-follow-up', lastModified: '2026-11-14', priority: 0.6 },
  { path: '/how-it-works', lastModified: '2026-11-13', priority: 0.4 },
  { path: '/insignar/transcript', lastModified: '2026-11-13', priority: 0.2 },
  { path: '/privacy', lastModified: '2026-11-13', priority: 0.2 },
  { path: '/terms', lastModified: '2026-11-13', priority: 0.2 },
];

/** 1200x630 link-preview image, the same one the home page uses. */
export const OG_IMAGE = '/insignar/og.jpg';
