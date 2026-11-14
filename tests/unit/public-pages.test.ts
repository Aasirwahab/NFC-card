import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from 'next';
import { PUBLIC_PAGES } from '@/lib/site';
import { PRICE, copy, meta as pricingMeta } from '@/app/(marketing)/pricing/copy';

const pages: Record<string, () => Promise<{ metadata: Metadata }>> = {
  '/': () => import('@/app/(landing)/insignar/page'),
  '/pricing': () => import('@/app/(marketing)/pricing/page'),
  '/facts': () => import('@/app/(marketing)/facts/page'),
  '/vs/digital-business-cards': () => import('@/app/(marketing)/vs/digital-business-cards/page'),
  '/after-networking-follow-up': () => import('@/app/(marketing)/after-networking-follow-up/page'),
  '/how-it-works': () => import('@/app/(marketing)/how-it-works/page'),
  '/insignar/transcript': () => import('@/app/(landing)/insignar/transcript/page'),
  '/privacy': () => import('@/app/(marketing)/privacy/page'),
  '/terms': () => import('@/app/(marketing)/terms/page'),
};

describe('public pages', () => {
  it('every public page is indexable and has a canonical that matches its path', async () => {
    expect(Object.keys(pages).sort()).toEqual(PUBLIC_PAGES.map((p) => p.path).sort());
    for (const { path } of PUBLIC_PAGES) {
      const { metadata } = await pages[path]!();
      expect(metadata.alternates?.canonical, path).toBe(path);
      expect(metadata.robots, path).toMatchObject({ index: true });
    }
  });

  it('every page has its own title under 60 characters and a description under 155', async () => {
    const titles = new Set<string>();
    for (const { path } of PUBLIC_PAGES) {
      const { metadata } = await pages[path]!();
      const t = metadata.title;
      const raw = typeof t === 'string' ? `${t} · INSIGNAR` : (t as { absolute: string }).absolute;
      expect(raw, path).toMatch(/INSIGNAR/);
      expect(raw.length, path).toBeLessThan(60);
      expect(metadata.description?.length ?? 0, path).toBeGreaterThan(50);
      expect(metadata.description!.length, path).toBeLessThan(155);
      expect(titles.has(raw), path).toBe(false);
      titles.add(raw);
    }
  });

  it('robots.txt allows the new page and keeps private routes out', async () => {
    const { default: robots } = await import('@/app/robots');
    const rule = [robots().rules].flat()[0]!;
    expect(rule.allow).toContain('/after-networking-follow-up');
    for (const p of ['/c/', '/dashboard', '/api/']) expect(rule.disallow).toContain(p);
  });

  it('the pages that get shared carry a link-preview image', async () => {
    for (const path of [
      '/facts',
      '/vs/digital-business-cards',
      '/pricing',
      '/after-networking-follow-up',
    ]) {
      const { metadata } = await pages[path]!();
      expect(JSON.stringify(metadata.openGraph?.images), path).toContain('/insignar/og.jpg');
    }
  });
});

describe('sitemap', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists every public page once, with a lastmod, and nothing private', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://insignar.com/');
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = sitemap();
    expect(entries.map((e) => e.url).sort()).toEqual(
      PUBLIC_PAGES.map((p) =>
        p.path === '/' ? 'https://insignar.com/' : `https://insignar.com${p.path}`,
      ).sort(),
    );
    for (const e of entries) expect(String(e.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entries.some((e) => /\/c\/|\/dashboard|\/api\//.test(e.url))).toBe(false);
  });
});

describe('pricing copy', () => {
  it('states the prices from the one constants object', () => {
    expect(copy.h1).toContain(`£${PRICE.perRepPerMonth}`);
    expect(copy.founding.price).toBe(`£${PRICE.founding.total}`);
    expect(pricingMeta.description).toContain(`£${PRICE.founding.total}`);
  });
});
