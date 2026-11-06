import { describe, expect, it } from 'vitest';
import type { callFixedApi } from '@/lib/http/fixed-api';
import { companiesHouseFact } from '@/lib/enrich/companies-house';

const reply = (items: unknown[]) => (async () => ({ items })) as unknown as typeof callFixedApi;
const co = (title: string, company_status = 'active', date_of_creation = '2014-03-02') => ({
  title,
  company_status,
  date_of_creation,
});

describe('companiesHouseFact', () => {
  it('returns the year for one exact active match, ignoring Ltd and &', async () => {
    const f = reply([co('SMITH AND CO LIMITED'), co('Smith Holdings Ltd')]);
    expect(await companiesHouseFact('Smith & Co. Ltd', 'k', f)).toBe(
      'Registered with Companies House since 2014',
    );
  });
  it('returns null when two companies share the name, or none matches', async () => {
    expect(
      await companiesHouseFact('Acme', 'k', reply([co('ACME LTD'), co('Acme Limited')])),
    ).toBeNull();
    expect(await companiesHouseFact('Acme', 'k', reply([co('Acme Trading Ltd')]))).toBeNull();
  });
  it('returns null for dissolved companies, errors and empty names', async () => {
    expect(await companiesHouseFact('Acme', 'k', reply([co('Acme Ltd', 'dissolved')]))).toBeNull();
    expect(await companiesHouseFact('Acme', 'k', reply([]))).toBeNull();
    expect(await companiesHouseFact(null, 'k', reply([co('Acme Ltd')]))).toBeNull();
    const boom = (async () => {
      throw new Error('down');
    }) as unknown as typeof callFixedApi;
    expect(await companiesHouseFact('Acme', 'k', boom)).toBeNull();
  });
});
