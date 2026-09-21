import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { mockPitchModel } from '@/lib/ai/mock';
import { templatePitch } from '@/lib/domain/pitch';
import type { Brief } from '@/lib/enrich/brief';
import { qualityGate, type GateCheck } from '@/lib/enrich/gate';
import { pitchPrompt } from '@/lib/enrich/prompts';

/**
 * The quality gate (§14.2). "It can be unit-tested; a prompt cannot." So every
 * check is tested both ways: a pitch that should pass does, and one that should
 * fail fails for the right reason.
 */

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    revision: 1,
    prospect: { firstName: 'Tom', company: 'BuildRite Plant' },
    problems: ['Idle machine tracking'],
    primaryProblem: 'Idle machine tracking',
    customProblem: null,
    niche: 'plant hire',
    toneNote: 'Arsenal fan, two kids, hates spreadsheets',
    rep: { firstName: 'Zaid', fullName: 'Zaid Hameer', title: 'Founder' },
    business: {
      name: 'TMA',
      tagline: 'Vertical AI for plant hire.',
      services: ['Plant hire automation', 'Maritime compliance reporting'],
      pricing: null,
      knowledge: '',
    },
    facts: ['BuildRite operates across seven depots in the Midlands.'],
    eventName: 'Plant Hire Expo',
    cta: 'Book 15 minutes on idle machine tracking',
    ...overrides,
  };
}

/** A pitch that passes every check, to mutate one thing at a time. */
const GOOD = [
  'It was good to meet you at the Plant Hire Expo. You mentioned idle machine tracking at',
  'BuildRite Plant, and it is the problem we spend most of our week on.',
  '',
  'Across seven depots, the hours a machine sits unbooked are the hours nobody is looking at.',
  'We built the reconciliation side of this for a hire firm with a similar spread, and the first',
  'thing it surfaced was not idle time at all but double-booked transport.',
  '',
  'The honest answer to whether the same applies to you takes about fifteen minutes to give',
  'properly. If it is useful, book 15 minutes below and I will come with specifics.',
  '— Zaid',
].join('\n');

function checks(body: string, b: Brief = brief()): GateCheck[] {
  return qualityGate(body, b).failures.map((f) => f.check);
}

describe('the baseline', () => {
  it('passes a specific, well-formed pitch', () => {
    const result = qualityGate(GOOD, brief());
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('rejects an empty pitch', () => {
    expect(checks('   ')).toEqual(['empty']);
  });
});

describe('1. references the stated problem', () => {
  it('fails a pitch that never touches what they raised', () => {
    const generic = GOOD.replace(/idle machine tracking/g, 'your operations')
      .replace(/machine sits unbooked/, 'resource sits unused')
      .replace('not idle time at all', 'not what anyone expected');
    expect(checks(generic)).toContain('references_problem');
  });

  it('accepts the problem in different grammatical forms', () => {
    const reworded = GOOD.replace('idle machine tracking', 'tracking idle machines');
    expect(checks(reworded)).not.toContain('references_problem');
  });
});

describe('2. never echoes the private note', () => {
  it.each([
    ['How are the kids? ', 'kids'],
    ['Hope Arsenal are treating you well. ', 'arsenal'],
    ['I know you hate spreadsheets. ', 'spreadsheet'],
  ])('fails: %s', (leak) => {
    expect(checks(leak + GOOD)).toContain('echoes_note');
  });

  it('allows a word the note shares with the legitimate context', () => {
    // The note mentions spreadsheets; if the services did too, using the word
    // about the services would not be an echo.
    const b = brief({ business: { ...brief().business, knowledge: 'We replace spreadsheets.' } });
    expect(checks(`We replace spreadsheets. ${GOOD}`, b)).not.toContain('echoes_note');
  });
});

describe('3. no placeholders or tells', () => {
  it.each([
    ['Hi [First Name], ', 'square brackets'],
    ['{{company}} ', 'template braces'],
    ['As an AI, ', 'announces the AI'],
    ['This note was AI-generated. ', 'announces the AI'],
    ['I hope this email finds you well. ', 'stock opener'],
    ['Dear Sir/Madam, ', 'stock opener'],
    ['<b>Hello</b> ', 'markup'],
    ['TODO: add fact. ', 'placeholder'],
  ])('fails: %s (%s)', (tell) => {
    expect(checks(tell + GOOD)).toContain('placeholder_or_tell');
  });

  it('allows the word AI when the business itself sells AI', () => {
    // TMA is "Vertical AI". Talking about the product is not announcing the author.
    expect(checks(`Our AI tooling handles the reconciliation. ${GOOD}`)).not.toContain(
      'placeholder_or_tell',
    );
  });
});

describe('§14.4 — research deep, say less', () => {
  it('fails competitor framing', () => {
    expect(checks(`Unlike your competitors, you move fast. ${GOOD}`)).toContain(
      'competitor_framing',
    );
  });

  it.each([
    'I looked at your website and saw the depots. ',
    'We researched BuildRite before writing. ',
    'I came across the Midlands expansion. ',
    'Your LinkedIn mentions the new depot. ',
    'From your homepage, the depots look busy. ',
  ])('fails a pitch that says how we know: %s', (tell) => {
    expect(checks(tell + GOOD)).toContain('reveals_research');
  });

  it('does not flag ordinary site language — this is construction', () => {
    expect(checks(`Your site managers will know the pattern. ${GOOD}`)).not.toContain(
      'reveals_research',
    );
  });
});

describe('4. no unsupported claims', () => {
  it('fails a price that is not in the pricing', () => {
    expect(checks(`It costs £499 a month. ${GOOD}`)).toContain('unsupported_price');
  });

  it('allows a price the pricing actually lists', () => {
    const b = brief({ business: { ...brief().business, pricing: 'From £499 per month.' } });
    expect(checks(`Plans start at £499 a month. ${GOOD}`, b)).not.toContain('unsupported_price');
  });

  it('fails an invented statistic', () => {
    expect(checks(`Clients cut idle time by 40%. ${GOOD}`)).toContain('unsupported_claim');
  });

  it('fails a credential the business never claimed', () => {
    expect(checks(`We are ISO 27001 certified. ${GOOD}`)).toContain('unsupported_claim');
    expect(checks(`We guarantee results. ${GOOD}`)).toContain('unsupported_claim');
  });

  it('allows a credential the business profile states', () => {
    const b = brief({
      business: { ...brief().business, knowledge: 'about: We are ISO 27001 certified.' },
    });
    expect(checks(`We are ISO 27001 certified. ${GOOD}`, b)).not.toContain('unsupported_claim');
  });
});

describe('5. length and shape', () => {
  it('fails under 60 words', () => {
    expect(checks('Idle machine tracking is our thing. Book 15 minutes below. — Zaid')).toContain(
      'length',
    );
  });

  it('fails over 180 words', () => {
    const padding = ' The detail matters a great deal in this line of work.'.repeat(20);
    expect(checks(GOOD + padding)).toContain('length');
  });

  it('fails a pitch with no call to action', () => {
    const noCta = GOOD.replace(/book 15 minutes below and /, '').replace(
      'about fifteen minutes to give\nproperly',
      'a while to explain',
    );
    expect(checks(noCta)).toContain('no_call_to_action');
  });
});

describe('6. names the right person', () => {
  it('fails a pitch addressed to someone else', () => {
    expect(checks(`Hi Sarah, ${GOOD}`)).toContain('wrong_name');
  });

  it("fails a stranger's name anywhere in the body", () => {
    expect(checks(GOOD.replace('I will come', 'James will come'))).toContain('wrong_name');
  });

  it('allows the prospect, the rep, and names that are part of the brief', () => {
    // "Morgan" is a common first name, but here it is part of the company.
    const b = brief({ prospect: { firstName: 'Tom', company: 'Morgan Plant Hire' } });
    const body = GOOD.replace('BuildRite Plant', 'Morgan Plant Hire');
    expect(checks(`Tom, ${body}`, b)).not.toContain('wrong_name');
  });

  it('does not mistake ordinary words for names', () => {
    // Will, Mark, Grace and friends are deliberately not on the names list.
    expect(checks(`We will mark the busy weeks. ${GOOD}`)).not.toContain('wrong_name');
  });
});

describe('the fallbacks must pass the gate too', () => {
  it('passes the deterministic template pitch', () => {
    // The template is what a prospect gets when the gate rejects twice. A
    // fallback the gate would itself reject is not a fallback.
    const b = brief();
    const body = templatePitch({
      prospectName: 'Tom Hargreaves',
      prospectCompany: b.prospect.company,
      problems: b.problems,
      customProblems: null,
      repName: 'Zaid',
      businessName: b.business.name,
      services: b.business.services,
      eventName: b.eventName,
    });
    expect(qualityGate(body, b).failures).toEqual([]);
  });

  it('passes the offline mock model’s pitch, so local runs exercise the happy path', async () => {
    const b = brief();
    const { instructions, prompt } = pitchPrompt(b);
    const { text } = await generateText({ model: mockPitchModel(), instructions, prompt });
    expect(qualityGate(text, b).failures).toEqual([]);
  });
});
