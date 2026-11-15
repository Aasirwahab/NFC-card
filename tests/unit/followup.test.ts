import { describe, expect, it } from 'vitest';
import { composeFollowupDraft, followupChannel } from '@/lib/followup/draft';
import { createFollowupHandler, type FollowupData } from '@/lib/followup/handler';
import { csvCell, leadsCsv } from '@/lib/domain/leads-csv';
import type { Job, JobContext } from '@/lib/jobs/types';

const base = {
  prospectName: 'Tom Hargreaves',
  repFullName: 'Zaid Zameer',
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
    followupClosed: false,
    prospectName: 'Tom',
    linkedinUrl: 'https://www.linkedin.com/in/tom',
    prospectEmail: null,
    problem: 'Idle machine tracking',
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

  it('skips a lead the rep already followed up, replied to or dropped', async () => {
    expect(await run({ ...data, followupClosed: true })).toHaveLength(0);
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

describe('drafts claim nothing the rep did not do', () => {
  it('quotes only a trimmed single line of at most 120 characters, without turning it into a claim', () => {
    const question = '  Is it really £1?\r\n  Do you guarantee results?\t' + 'x'.repeat(160);
    const text = composeFollowupDraft({
      channel: 'email',
      prospectName: 'Tom',
      repFullName: 'Zaid',
      problem: null,
      businessName: null,
      state: 'asked-question',
      question,
    });
    const quote = text.match(/You asked: “(.*?)”/u)?.[1];
    expect(quote).toBe(question.replace(/\s+/g, ' ').trim().slice(0, 120).trim());
    expect(quote!.length).toBeLessThanOrEqual(120);
    expect(text.endsWith("Reply stop and I won't write again.")).toBe(true);
    expect(text.replace(/You asked: “.*?”\n/u, '')).not.toMatch(/£1|guarantee|results/);
    expect(text).toContain(
      "I'm happy to send a couple of ideas, or to find fifteen minutes that suit you.",
    );
  });

  it('keeps quotes single-line even with control characters or Unicode separators', () => {
    const text = composeFollowupDraft({
      channel: 'linkedin',
      prospectName: null,
      repFullName: 'Zaid',
      problem: null,
      businessName: null,
      state: 'asked-question',
      question: '  Price?\u0000\u2028“£5”\u202e ',
    });
    expect(text).toContain('You asked: “Price? £5”');
    expect(text).not.toMatch(/[\u0000\u2028\u202e]/u);
  });

  it('never says the rep has been thinking about it, or that the prospect mentioned it', () => {
    for (const channel of ['linkedin', 'email'] as const) {
      const text = composeFollowupDraft({
        channel,
        prospectName: 'Tom Smith',
        repFullName: 'Zaid Zameer',
        problem: 'Manual timesheets',
        businessName: 'TMA',
      });
      expect(text).not.toMatch(/thinking about|you mentioned|you said/i);
      expect(text).toContain('Following up on our chat about manual timesheets');
    }
  });
});
