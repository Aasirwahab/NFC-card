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
    guidance: null,
    privateNote: 'Arsenal fan, two kids, hates spreadsheets',
    rep: { firstName: 'Zaid', fullName: 'Zaid Hameer', title: 'Founder', language: 'en-GB' },
    voice: { tone: 'warm' as const, hook: null, avoid: [] as string[] },
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

describe('pitch-v2 tone: presumptuous or salesy phrasing is rejected', () => {
  it.each([
    ['As you know, we work on idle machine tracking every week.', 'presumes what they know'],
    ['We specialise in idle machine tracking for hire firms.', 'brags'],
    ['Our platform is a game-changer for idle machine tracking.', 'salesy buzzword'],
    ['I guarantee we can fix idle machine tracking for you.', 'promises an outcome'],
  ])('rejects %s', (phrase, tell) => {
    const body = GOOD.replace(
      'You mentioned idle machine tracking at',
      `${phrase} You mentioned idle machine tracking at`,
    );
    const failures = qualityGate(body, brief()).failures;
    expect(failures.map((f) => f.check)).toContain('placeholder_or_tell');
    expect(failures.map((f) => f.detail).join(' ')).toContain(tell);
  });

  it('still passes a calm, specific note', () => {
    expect(checks(GOOD)).toEqual([]);
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

describe("the rep's pitch voice", () => {
  it('rejects a note that uses a phrase the rep asked never to say', () => {
    const b = brief({ voice: { tone: 'direct', hook: null, avoid: ['cheap', 'synergy'] } });
    const body =
      'Idle machine tracking came up. It is a cheap fix compared with another idle week, and we can show you how in fifteen minutes. If useful, pick a time below. Zaid';
    const result = qualityGate(body, b);
    expect(result.failures.map((f) => f.check)).toContain('avoided_phrase');
  });

  it("treats the rep's own hook as supported content, and parses the avoid list", async () => {
    const { briefText, parseAvoid } = await import('@/lib/enrich/brief');
    const b = brief({
      voice: { tone: 'warm', hook: 'We install telematics in a day.', avoid: [] },
    });
    expect(briefText(b)).toContain('telematics in a day');
    expect(parseAvoid('cheap, jargon\nsynergy; x')).toEqual(['cheap', 'jargon', 'synergy']);
    expect(parseAvoid(null)).toEqual([]);
  });

  it('puts tone, own line and never_say in the prompt, and keeps the private note out', async () => {
    const { pitchPrompt } = await import('@/lib/enrich/prompts');
    const b = brief({ voice: { tone: 'formal', hook: 'We cut idle time.', avoid: ['cheap'] } });
    const { prompt, instructions } = pitchPrompt(b);
    expect(prompt).toContain('"tone": "formal"');
    expect(prompt).toContain('"own_line": "We cut idle time."');
    expect(prompt).toContain('"never_say"');
    expect(prompt).not.toContain('Arsenal');
    expect(instructions).toMatch(/never_say/);
  });
});

describe('no booking promise without a booking button', () => {
  it('rejects booking wording when the brief has no booking CTA', () => {
    const noLink = brief({ cta: 'A 15-minute conversation about idle machine tracking' });
    const body = GOOD.replace('book 15 minutes below and', 'have a short conversation and');
    expect(qualityGate(body, noLink).failures.map((f) => f.check)).not.toContain(
      'promises_booking',
    );
    expect(qualityGate(GOOD, noLink).failures.map((f) => f.check)).toContain('promises_booking');
  });
});

describe('no problem chosen: nothing is attributed to the prospect', () => {
  const noProblem = brief({
    problems: [],
    primaryProblem: null,
    customProblem: null,
    cta: 'A 15-minute conversation',
  });
  const NEUTRAL = [
    'It was good to meet you at the Plant Hire Expo. I wanted to follow up properly rather',
    'than leave you with a card, and to hear what matters most at BuildRite Plant right now.',
    '',
    'TMA builds plant hire automation, so the dull, repeated parts of running a hire business',
    'take less of the week. It would be useful to hear how things work for you today before',
    'saying anything about whether any of it fits, and that is a conversation worth having.',
    '',
    'If it is useful, have a short conversation with me and we can take it from there.',
    '— Zaid',
  ].join('\n');

  it('passes a neutral note about meeting them', () => {
    expect(qualityGate(NEUTRAL, noProblem).failures).toEqual([]);
  });

  it.each([
    'You mentioned that keeping track of conversations takes more effort than it should.',
    'You said following up afterwards is harder than it ought to be.',
    'As you described, the admin is eating into your week.',
    "You've mentioned a few things we could talk through.",
  ])('rejects a note that says "%s"', (sentence) => {
    const body = NEUTRAL.replace('It was good to meet you at the Plant Hire Expo.', sentence);
    expect(checks(body, noProblem)).toContain('invented_statement');
  });

  it.each([
    'You also mentioned that follow-ups slip.',
    "You'd mentioned the admin was heavy.",
    'You had mentioned a slow website.',
    'You did mention that leads go cold.',
    'You specifically mentioned the website.',
    "You've just mentioned the admin.",
    'You were saying that follow-up is hard.',
    'You were talking about lost enquiries.',
    'You spoke about missing calls.',
    'You noted that time is short.',
    'You flagged that follow-up is slow.',
    'You pointed out that leads go cold.',
    'As you noted, the admin is heavy.',
    'You\u2019ve mentioned a few things we could talk through.',
    'You\u2019re worried about leads going cold.',
  ])('also rejects the phrasing "%s"', (sentence) => {
    const body = NEUTRAL.replace('It was good to meet you at the Plant Hire Expo.', sentence);
    expect(checks(body, noProblem)).toContain('invented_statement');
  });

  it.each([
    'Once you have shared your details, I will be in touch.',
    'If you shared your email, I will follow up.',
    'If you tell me what matters most, we can start there.',
    'I would like to hear what you say about how it works today.',
  ])('does not reject the neutral phrasing "%s"', (sentence) => {
    const body = NEUTRAL.replace('It was good to meet you at the Plant Hire Expo.', sentence);
    expect(checks(body, noProblem)).not.toContain('invented_statement');
  });

  it('still allows "you mentioned" when they did raise a problem', () => {
    expect(checks(GOOD, brief())).not.toContain('invented_statement');
  });

  it('tells the model plainly there is no problem, and withdraws the tie-to-the-problem rule', () => {
    const none = pitchPrompt(noProblem).instructions;
    expect(none).toContain('did NOT raise a specific problem');
    expect(none).not.toContain('Tie it to the problem they described');
    const some = pitchPrompt(brief()).instructions;
    expect(some).toContain('Tie it to the problem they described');
    expect(some).not.toContain('did NOT raise');
  });
});
