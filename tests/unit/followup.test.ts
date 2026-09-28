import { describe, expect, it } from 'vitest';
import { composeFollowupDraft, followupChannel } from '@/lib/followup/draft';
import { createFollowupHandler, type FollowupData } from '@/lib/followup/handler';
import { csvCell, leadsCsv } from '@/lib/domain/leads-csv';
import type { Job, JobContext } from '@/lib/jobs/types';

const base = {
  prospectName: 'Tom Hargreaves',
  repFullName: 'Zaid Zameer',
  eventName: 'Property Nexus',
  problem: 'Idle machine tracking',
  businessName: 'TMA',
};

describe('the no-tap follow-up draft (§19.3)', () => {
  it('picks LinkedIn, then email, then none', () => {
    expect(followupChannel({ linkedin_url: 'x', prospect_email: 'y' })).toBe('linkedin');
    expect(followupChannel({ linkedin_url: null, prospect_email: 'y' })).toBe('email');
    expect(followupChannel({ linkedin_url: null, prospect_email: null })).toBe('none');
  });

  it('follows up on the conversation and never mentions tracking', () => {
    for (const channel of ['linkedin', 'email', 'none'] as const) {
      const draft = composeFollowupDraft({ ...base, channel });
      expect(draft).toContain('Hi Tom,');
      expect(draft).toContain('Property Nexus');
      expect(draft).toMatch(/idle machine tracking/);
      expect(draft).not.toMatch(/open|tap|card|look|saw|view|track(ed|ing) you/i);
    }
  });

  it('keeps the LinkedIn version short enough for a connection note', () => {
    expect(composeFollowupDraft({ ...base, channel: 'linkedin' }).length).toBeLessThanOrEqual(300);
  });

  it('still reads well with nothing but a name', () => {
    const draft = composeFollowupDraft({
      ...base,
      channel: 'email',
      prospectName: null,
      eventName: null,
      problem: null,
      businessName: null,
    });
    expect(draft.startsWith('Hi,')).toBe(true);
    expect(draft).not.toContain('null');
  });
});

describe('the followup handler', () => {
  const data: FollowupData = {
    status: 'active',
    firstViewedAt: null,
    prospectName: 'Tom',
    linkedinUrl: 'https://www.linkedin.com/in/tom',
    prospectEmail: null,
    problem: 'Idle machine tracking',
    eventName: 'Property Nexus',
    repFullName: 'Zaid',
    businessName: null,
  };

  function run(loaded: FollowupData | null) {
    const saved: { channel: string; text: string }[] = [];
    const handler = createFollowupHandler({
      load: async () => loaded,
      save: async (_id, channel, text) => {
        saved.push({ channel, text });
        return true;
      },
      log: () => {},
    });
    const context = {
      job: { id: 'j', session_id: 's1' } as Job,
      step: async (_n: string, _e: number, fn: () => Promise<unknown>) => fn(),
      defer: () => {
        throw new Error('unused');
      },
    } as unknown as JobContext;
    return handler(context).then(() => saved);
  }

  it('writes a LinkedIn draft for an unopened, live session', async () => {
    const saved = await run(data);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.channel).toBe('linkedin');
  });

  it('skips a session that was opened, voided or deleted since it was queued', async () => {
    expect(await run({ ...data, firstViewedAt: '2026-10-06T10:00:00Z' })).toHaveLength(0);
    expect(await run({ ...data, status: 'voided' })).toHaveLength(0);
    expect(await run(null)).toHaveLength(0);
  });
});

describe('leads CSV', () => {
  it('quotes, and defuses spreadsheet formulas', () => {
    expect(csvCell('Smith, Jones')).toBe('"Smith, Jones"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
  });

  it('writes one row per lead and never a private note column', () => {
    const csv = leadsCsv([
      {
        event_sequence_number: 3,
        colour_tag: 'Blue',
        prospect_name: 'Tom',
        prospect_company: 'BuildRite',
        prospect_email: null,
        prospect_phone: null,
        linkedin_url: null,
        prospect_website: 'buildrite.co.uk',
        problems: ['Idle machine tracking'],
        custom_problems: null,
        registered_at: '2026-10-05T18:00:00Z',
        first_viewed_at: null,
        booked: true,
      },
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).not.toMatch(/memorable|note/);
    expect(row).toBe(
      '3,Blue,Tom,BuildRite,,,,buildrite.co.uk,Idle machine tracking,2026-10-05T18:00:00Z,,yes',
    );
  });
});
