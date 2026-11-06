/**
 * One company-level fact from the UK Companies House register (free API, key from
 * developer.company-information.service.gov.uk). Company facts only: officers and
 * people are never requested, so nothing here is about an individual.
 *
 * Returns a fact only when exactly one ACTIVE company has this exact name (so two
 * firms with a similar name never get mixed up). Any failure returns null: the
 * register is a bonus, never a reason for the pitch to fail.
 */
import { callFixedApi } from '@/lib/http/fixed-api';

const API = 'https://api.company-information.service.gov.uk/search/companies';
const TIMEOUT_MS = 4_000;

type Item = { title?: string; company_status?: string; date_of_creation?: string };

/** "Smith & Co. Ltd" and "SMITH AND CO LIMITED" compare equal. */
function key(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(limited|ltd|plc|llp|the)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export async function companiesHouseFact(
  name: string | null,
  apiKey: string,
  call: typeof callFixedApi = callFixedApi,
): Promise<string | null> {
  const wanted = name ? key(name) : '';
  if (!wanted) return null;

  try {
    const body = (await call({
      url: `${API}?q=${encodeURIComponent(name!)}&items_per_page=10`,
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
      timeoutMs: TIMEOUT_MS,
    })) as { items?: Item[] };
    const items = body.items;
    const matches = (items ?? []).filter((i) => i.title && key(i.title) === wanted);
    if (matches.length !== 1) return null;

    const [match] = matches;
    const year = match!.date_of_creation?.slice(0, 4);
    if (match!.company_status !== 'active' || !year || !/^\d{4}$/.test(year)) return null;
    return `Registered with Companies House since ${year}`;
  } catch {
    return null;
  }
}
