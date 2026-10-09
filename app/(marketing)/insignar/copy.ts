/**
 * Every string on the INSIGNAR landing page. Source: insignar-design/COPY.md and film/FILM_SCRIPT.md.
 * Names: rep = Maya Okafor, prospect = Daniel at Northwind. Every number is EXAMPLE until sourced.
 * Strings marked BUILD-DRAFT are not in COPY.md; they were written for layout and need sign-off.
 */
export const EXAMPLE = 'EXAMPLE';

export const meta = {
  title: 'Make every introduction worth more',
  description:
    'INSIGNAR is introduction software. A numbered card opens a private page about the other person’s problem.',
};

export const hero = {
  eyebrow: 'Introduction software',
  quote: 'Tickets double after every release.',
  subStrong: 'Daniel told you that at the event.',
  subSoft:
    'INSIGNAR turns it into a private page for his company, so you open with his problem, not yours.',
  primary: 'Request a pilot',
  secondary: 'Watch the film',
  fig: 'FIG 0.1 · card A·07, handed 19:42, tapped 07:58',
  figNote: EXAMPLE,
  headline: 'Make every introduction worth more.',
};

export const steps = {
  fig: (n: number) => `FIG 0.${n + 1} · 0${n}`,
  items: [
    {
      title: 'They tell you.',
      lead: '60 seconds, in your own voice.',
      body: 'Their words, saved from a voice note. Nothing to type.',
    },
    {
      title: 'We research.',
      lead: 'What it costs his company.',
      body: 'A range with sources, confirmed by you before it is sent.',
    },
    {
      title: 'They get a page, not a pitch.',
      lead: 'Their problem, a team like theirs, one next step.',
      body: 'Private to Daniel. Quoted back as his.',
    },
  ],
};

export const film = {
  label: '[ THE FILM · 46 SECONDS ]',
  title: 'Daniel told Maya one thing.',
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  transcript: 'Transcript',
  note: 'Muted by default. All figures on screen are EXAMPLE.',
  scenes: [
    {
      t: '0:00',
      start: 0,
      end: 5,
      line: 'Daniel runs support. He told Maya one thing at the event.',
    },
    {
      t: '0:05',
      start: 5,
      end: 11,
      line: 'By Thursday, most people send him a pitch about themselves.',
    },
    { t: '0:11', start: 11, end: 17, line: 'INSIGNAR starts with his problem. In his own words.' },
    {
      t: '0:17',
      start: 17,
      end: 25,
      line: 'Then what it costs his company. Researched, with sources.',
    },
    {
      t: '0:25',
      start: 25,
      end: 32,
      line: 'You said it. We listened. Here is a team like yours that fixed it.',
    },
    { t: '0:32', start: 32, end: 38, line: 'He taps the card and reads it.' },
    { t: '0:38', start: 38, end: 42, line: 'A meeting.' },
    { t: '0:42', start: 42, end: 46, line: 'INSIGNAR. Make every introduction worth more.' },
  ],
  /** v6 fast cut: one entry per beat. `key` = word indexes that punch in the karaoke caption. */
  beats: [
    { t: '0:00', start: 0, end: 1.2, line: 'You met him.', key: [2] },
    { t: '0:01', start: 1.2, end: 2.6, line: 'Great conversation.', key: [1] },
    { t: '0:02', start: 2.6, end: 4, line: 'Then six more.', key: [1] },
    { t: '0:04', start: 4, end: 6, line: 'By Thursday?', key: [1] },
    { t: '0:06', start: 6, end: 8, line: 'Gone.', key: [0] },
    { t: '0:08', start: 8, end: 10.5, line: 'You send the same email as everyone.', key: [3, 6] },
    { t: '0:10', start: 10.5, end: 12.5, line: 'He doesn’t open it.', key: [1] },
    { t: '0:12', start: 12.5, end: 15, line: 'The deal walks.', key: [2] },
    { t: '0:15', start: 15, end: 16.6, line: '', key: [] },
    { t: '0:16', start: 16.6, end: 19, line: 'Not this time.', key: [0] },
    { t: '0:19', start: 19, end: 22, line: 'Sixty seconds. His words.', key: [0, 3] },
    { t: '0:22', start: 22, end: 25.5, line: 'What it costs his company.', key: [2] },
    { t: '0:25', start: 25.5, end: 29, line: 'A team like his that fixed it.', key: [5] },
    { t: '0:29', start: 29, end: 32, line: 'One page. About him.', key: [1, 3] },
    { t: '0:32', start: 32, end: 34.5, line: 'He taps.', key: [1] },
    { t: '0:34', start: 34.5, end: 37.5, line: 'He reads it. Twice.', key: [3] },
    { t: '0:37', start: 37.5, end: 40.5, line: 'Booked.', key: [0] },
    { t: '0:40', start: 40.5, end: 42.5, line: 'Be the one they remember.', key: [4] },
    {
      t: '0:42',
      start: 42.5,
      end: 46,
      line: 'INSIGNAR. Make every introduction worth more.',
      key: [0, 5],
    },
  ],
  silence: '(silence)',
  ui: {
    email: [
      'Hi Daniel,',
      'I wanted to tell you all about our company, our platform and our award-winning team.',
      'Do you have 15 minutes this week?',
    ],
    emailTag: 'A pitch about us',
    voice: 'Voice note · 60 s · Maya Okafor',
    pageTitle: 'Your problem',
    costTitle: 'What it costs your team',
    costRange: '£38k to £92k a year',
    costSources: ['Source A', 'Source B'],
    confirmed: 'Rep confirmed',
    heard: 'We listened',
    heardBy: 'Daniel, at the event',
    team: 'A team like yours',
    teamBody: 'A support team of 40 cut repeat tickets after each release.',
    howSteps: ['Find the cause', 'Fix it with you', 'Check the next release'],
    tap: 'Tap',
    remove: 'Remove my details',
    meeting: 'Thu 10:00 · 20 minutes',
    meetingWho: 'Maya Okafor and Daniel, Northwind',
    group: 'Group slot',
    concept: 'CONCEPT',
    cardNo: 'A·07',
  },
};

export const card = {
  label: '[ THE CARD ]',
  stepsAria: 'How the card works',
  items: [
    {
      n: '01',
      h: 'Numbered. Named. Yours.',
      p: 'Every card carries the rep’s name and its own number, A·07.',
    },
    {
      n: '02',
      h: 'The back says whose notes these are.',
      p: 'Notes from Maya Okafor, from the event. Private. Tap to read.',
    },
    {
      n: '03',
      h: 'Tap here.',
      p: 'The NFC point opens Daniel’s page. When it is tapped, we already know who it is for. No form.',
    },
    { n: '04', h: 'No NFC? Scan.', p: 'Every card carries a QR code that opens the same page.' },
  ],
};

export const page = {
  label: '[ THE PROSPECT’S PAGE ]',
  title: 'A page about his problem. Not a pitch.',
  lead: 'Five parts, in this order. Private to Daniel, with a way out on every screen.',
  figs: 'FIG 3.1 · Daniel’s page at Northwind',
  header: 'For Daniel, Northwind',
  one: {
    h: 'Your problem',
    q: '“Tickets double after every release.”',
    by: 'Daniel, in his own words',
  },
  two: {
    h: 'What it costs your team',
    range: '£38k to £92k a year',
    sources: ['Source A, support cost survey', 'Source B, public headcount data'],
    confirmed: 'Rep confirmed by Maya Okafor',
  },
  three: { h: 'We listened', q: '“You said tickets double after every release.”' },
  four: {
    h: 'A team like yours',
    p: 'A support team of 40 with the same pattern. One case, not a logo wall.',
  },
  five: {
    h: 'How we fix it',
    steps: [
      'Find the cause in your release notes.',
      'Fix it with your team.',
      'Check the next release together.',
    ],
    book: 'Book 20 minutes',
    forward: 'Forward to your team',
    remove: 'Remove my details',
    ai: 'Written with AI. Checked and sent by Maya Okafor.',
  },
  concept: 'CONCEPT',
  exampleNote: 'All figures on this page are EXAMPLE.',
  trust: [
    { h: 'One tap to remove.', p: 'They can remove their details in one tap.' },
    { h: 'Their ideas stay theirs.', p: 'Quoted back as theirs.' },
    { h: 'Drafts wait for you.', p: 'Nothing is sent until the rep sends it.' },
  ],
};

export const exploded = {
  label: '[ THE CARD, EXPLODED ]',
  title: 'One card. One person. One page.',
  body: 'Every card is numbered and live before the event. When it is tapped, we already know who it is for. No form.',
  layers: [
    '[ 01 ] DEBOSSED MARK, BLIND',
    '[ 02 ] QR, FALLBACK FOR ANY PHONE',
    '[ 03 ] NFC STICKER, ONE PER CARD',
    '[ 04 ] MATTE BLACK CARD  A·07',
  ],
  fig: 'FIG 4.1 · card A·07, exploded',
};

export const five = {
  label: '[ THE 5 THAT MATTER ]',
  title: '500 contacts don’t close deals. The right five might.',
  note: 'For sales directors only. Never on the prospect’s page.',
  manager: {
    label: '[ MANAGER VIEW, DAY ONE ]',
    note: 'EXAMPLE numbers. Managers see status, never page content.',
    stats: [
      { v: '28', l: 'Cards in the field' },
      { v: '18 of 28', l: 'Claimed within 24 hours' },
      { v: '94 min', l: 'Handshake to tap' },
      { v: '3', l: 'Meetings booked per 10 claims' },
      { v: '21', l: 'Cards with context within an hour' },
    ],
    alertsTitle: 'Alerts',
    alerts: [
      'Unclaimed after 72 hours',
      'Claimed but untouched for 48 hours',
      'Email unsent after 24 hours',
      'No context after 30 minutes',
    ],
  },
};

export const pilot = {
  label: '[ PILOT ]',
  title: 'Ten introductions per rep. Four weeks. Your numbers decide.',
  offer: [
    'Three or more reps, ten numbered cards each',
    'A scorecard agreed in writing before day one',
    'A CSV export and a clean exit',
  ],
  noPrice: 'No price in the demo.',
  results: {
    title: 'Pilot results',
    items: [
      { l: 'Tapped within 24 hours', v: '—' },
      { l: 'Meetings booked per 10 taps', v: '—' },
      { l: 'Minutes saved', v: '—' },
    ],
    note: 'Blank until real.',
  },
  form: {
    name: 'Your name',
    email: 'Work email',
    company: 'Company',
    reps: 'Number of reps',
    submit: 'Request a pilot',
    demo: 'Demo: nothing was sent',
    privacy: 'How we handle your details',
  },
};

export const faq = {
  label: '[ QUESTIONS ]',
  title: 'Short answers.',
  items: [
    {
      q: 'Is this a business card company?',
      a: 'No. The card is a key; the product is the software behind it.',
    },
    {
      q: 'What if their phone has no NFC?',
      a: 'Every card carries a QR code that opens the same page.',
    },
    { q: 'Does it send emails for me?', a: 'No. It drafts; you review and send.' },
    {
      q: 'What does the pilot involve?',
      a: 'Ten cards, ten real conversations, and we measure taps and meetings booked.',
    },
  ],
};

export const footer = {
  line: 'INSIGNAR · Introduction software',
  privacy: 'Privacy',
  note: 'Concept page. Nothing here is a claim about results.',
};
