import { describe, expect, it } from 'vitest';
import { classifyLink, reconcileCard, type FormValues } from '@/lib/capture/reconcile';
import { NO_CARD } from '@/lib/capture/card';

const empty: FormValues = { name: '', company: '', email: '', phone: '', website: '' };

describe('reconcileCard', () => {
  it('fills what is empty', () => {
    const r = reconcileCard(empty, { ...NO_CARD, name: 'Tom Hughes', email: 'tom@hughes.co.uk' });
    expect(r.fill).toEqual({ name: 'Tom Hughes', email: 'tom@hughes.co.uk' });
    expect(r.conflicts).toEqual([]);
  });

  it('ticks values that are the same thing written differently', () => {
    const r = reconcileCard(
      {
        name: 'tom  hughes',
        company: 'Hughes Legal Limited',
        email: 'Tom@Hughes.co.uk',
        phone: '+44 7700 900123',
        website: 'https://www.hugheslegal.co.uk/about',
      },
      {
        ...NO_CARD,
        name: 'Tom Hughes',
        company: 'Hughes Legal LLP',
        email: 'tom@hughes.co.uk',
        phone: '07700 900123',
        website: 'hugheslegal.co.uk',
      },
    );
    expect(r.matched.sort()).toEqual(['company', 'email', 'name', 'phone', 'website']);
    expect(r.fill).toEqual({});
    expect(r.conflicts).toEqual([]);
  });

  it('asks when they differ, never overwrites, and catches a misspelling', () => {
    const r = reconcileCard(
      { ...empty, name: 'Zaid Zamer', company: 'Webvoxel' },
      { ...NO_CARD, name: 'Zaidh Zameer', company: 'Webvoxel' },
    );
    expect(r.conflicts).toEqual([{ field: 'name', typed: 'Zaid Zamer', card: 'Zaidh Zameer' }]);
    expect(r.matched).toEqual(['company']);
    expect(r.fill).toEqual({});
  });

  it('ignores fields the card did not print', () => {
    expect(reconcileCard({ ...empty, name: 'A B' }, NO_CARD)).toEqual({
      fill: {},
      matched: [],
      conflicts: [],
    });
  });
});

describe('reconcileCard edge cases', () => {
  it('does not treat different area codes as the same phone', () => {
    const r = reconcileCard(
      { ...empty, phone: '020 7123 4567' },
      { ...NO_CARD, phone: '030 7123 4567' },
    );
    expect(r.matched).toEqual([]);
    expect(r.conflicts).toHaveLength(1);
  });

  it('keeps non-Latin names apart', () => {
    const r = reconcileCard({ ...empty, name: '李明' }, { ...NO_CARD, name: '王伟' });
    expect(r.conflicts).toHaveLength(1);
  });
});

describe('classifyLink', () => {
  it('routes LinkedIn profiles, with or without a scheme', () => {
    expect(classifyLink('https://uk.linkedin.com/in/zaid-z/?trk=x')).toEqual({
      kind: 'linkedin',
      value: 'https://www.linkedin.com/in/zaid-z',
    });
    expect(classifyLink('linkedin.com/in/zaid-z')?.kind).toBe('linkedin');
  });

  it('routes an obvious website link', () => {
    expect(classifyLink('https://www.webvoxel.co.uk/team')).toEqual({
      kind: 'website',
      value: 'webvoxel.co.uk',
    });
    expect(classifyLink('www.webvoxel.co.uk')?.kind).toBe('website');
  });

  it('leaves ordinary text, emails and company pages alone', () => {
    for (const t of [
      'Webvoxel',
      'Booking.com',
      'a@b.co',
      'hello world',
      '',
      'https://linkedin.com/company/x',
    ]) {
      expect(classifyLink(t)).toBeNull();
    }
  });
});
