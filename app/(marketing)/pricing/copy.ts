/** Every string and number on /pricing. */

// PROPOSED 2026-11-13, confirm before merge
export const PRICE = {
  currency: 'GBP',
  perRepPerMonth: 39,
  founding: { total: 99, months: 3, cards: 10 },
};

const gbp = (n: number) => `£${n}`;
const standardOverFounding = PRICE.perRepPerMonth * PRICE.founding.months;

export const meta = {
  title: 'Pricing',
  description: `INSIGNAR costs ${gbp(PRICE.perRepPerMonth)} per rep per month. The founding offer is ${gbp(PRICE.founding.total)} for the first ${PRICE.founding.months} months, with ${PRICE.founding.cards} numbered cards included. Pre-launch, UK pilot by request.`,
};

export const copy = {
  h1: `${gbp(PRICE.perRepPerMonth)} per rep, per month`,
  lead: 'INSIGNAR is pre-launch. These are the prices for UK teams. You request a pilot first, and we agree the details with you before you pay anything.',
  founding: {
    label: 'Founding offer',
    price: gbp(PRICE.founding.total),
    per: `for your first ${PRICE.founding.months} months`,
    lines: [
      `${PRICE.founding.cards} numbered cards included.`,
      `${PRICE.founding.months} months at the standard price would be ${gbp(standardOverFounding)}.`,
    ],
    cta: 'Request a founding pilot',
  },
  standard: {
    label: 'Standard',
    price: gbp(PRICE.perRepPerMonth),
    per: 'per rep, per month',
    lines: ['The price once the founding offer ends, or if you join after it.'],
  },
  getTitle: 'What you get',
  get: [
    [
      'Numbered cards',
      'Each card opens a private page for the one person you gave it to. A QR code on the back works on any phone.',
    ],
    [
      'A voice note fills in the contact',
      'Say what they told you. INSIGNAR turns it into their name, company and problem for you to check.',
    ],
    [
      'A page that builds itself after the tap',
      'It is about their problem, in their words, and only they can open it.',
    ],
    ['A small chat on that page', 'It answers their questions from the knowledge you give it.'],
    [
      'A follow-up list',
      'You see what each person opened and asked, so you know who to call first.',
    ],
    [
      'Remove my details',
      'Every page has a button that deletes the person’s record straight away.',
    ],
  ] as [string, string][],
  stageTitle: 'Where we are',
  stage:
    'INSIGNAR has no customers yet, so there are no results to show. The pilot is how we find out whether it works for your team. We will quote results here once there are real ones.',
  cardTitle: 'Is a simple digital card enough?',
  card: 'Sometimes. If you only need people to have your details, a digital card does that for less. INSIGNAR is for the few conversations where you want to send something written about their problem.',
  cardLink: 'Digital business card or INSIGNAR',
  faqTitle: 'Questions',
  faq: [
    [
      'Do I pay on this website?',
      'No. There is no payment on this site. Request a pilot and we will reply with the details to agree first.',
    ],
    [
      'Are the pilot terms final?',
      'Not yet. They are in draft and under legal review. You can read them on the terms page.',
    ],
  ] as [string, string][],
  termsLink: 'Pilot terms (draft)',
  cta: 'Request a founding pilot',
};
