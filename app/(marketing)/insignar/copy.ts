/**
 * Every string on the INSIGNAR landing page. Source: insignar-design/COPY_V3_SELL.md.
 */
export const EXAMPLE = 'EXAMPLE';

export const meta = {
  title: 'Be the one they call back',
  description:
    'Everyone follows up with a deck. With INSIGNAR you send a private page about their problem, what it costs them and how you fix it.',
};

export const hero = {
  eyebrow: 'Introduction software',
  headline: 'Be the one they call back.',
  subStrong: 'Everyone follows up with a deck.',
  subSoft:
    "You send a private page about their problem, what it's costing them and how you fix it. One minute of your voice. Approved by you.",
  primary: 'Request a founding pilot',
  secondary: 'Watch the film',
  chipCaption: 'What they told you',
  chipQuote: 'Tickets double after every release.',
  fig: 'FIG 0.1 · card A·07, handed 19:42, tapped 07:58',
};

export const steps = {
  fig: (n: number) => `FIG 0.${n + 1} · 0${n}`,
  items: [
    {
      title: 'Say it',
      lead: 'One minute, walking to the car',
      body: '',
    },
    {
      title: 'We build it',
      lead: 'Their problem, the cost, your fix',
      body: '',
    },
    {
      title: 'You approve. They book.',
      lead: 'Nothing reaches them until you say so',
      body: '',
    },
  ],
};

export const film = {
  label: '[ THE FILM · 42 SECONDS ]',
  title: 'Watch it. Then think about your last event.',
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  transcript: 'Transcript',
  note: 'Muted by default. All figures on screen are EXAMPLE.',
  voiceNote: 'Voice: AI-generated, licensed stock voice.',
  scenes: [
    {
      t: '0:00',
      start: 0,
      end: 5,
      line: 'You met them at an event. They told you one thing.',
    },
    {
      t: '0:05',
      start: 5,
      end: 11,
      line: 'By Thursday, your email is one more pitch about you.',
    },
    {
      t: '0:11',
      start: 11,
      end: 17,
      line: 'INSIGNAR starts with their problem. In their own words.',
    },
    {
      t: '0:17',
      start: 17,
      end: 25,
      line: 'Then what it costs their company. Researched, with sources.',
    },
    {
      t: '0:25',
      start: 25,
      end: 32,
      line: 'The page says we listened, and shows a team like theirs that fixed it.',
    },
    { t: '0:32', start: 32, end: 38, line: 'They tap your card and read it.' },
    { t: '0:38', start: 38, end: 42, line: 'A meeting.' },
    { t: '0:42', start: 42, end: 46, line: 'INSIGNAR. Make every introduction worth more.' },
  ],
  /** v6 fast cut: one entry per beat. `key` = word indexes that punch in the karaoke caption. */
  beats: [
    { t: '0:00', start: 0, end: 1.2, line: 'You met them.', key: [2] },
    { t: '0:01', start: 1.2, end: 2.6, line: 'Great conversation.', key: [1] },
    { t: '0:02', start: 2.6, end: 4, line: 'Six more. Fast.', key: [2] },
    { t: '0:04', start: 4, end: 6, line: 'By Thursday, they’re a name on your list.', key: [4] },
    { t: '0:06', start: 6, end: 8, line: 'Gone.', key: [0] },
    {
      t: '0:08',
      start: 8,
      end: 10.5,
      line: 'Same email. Same subject line. Same delete.',
      key: [6],
    },
    { t: '0:10', start: 10.5, end: 12.5, line: 'Unopened.', key: [0] },
    { t: '0:12', start: 12.5, end: 15, line: 'The deal walks.', key: [2] },
    { t: '0:15', start: 15, end: 16.6, line: '', key: [] },
    { t: '0:16', start: 16.6, end: 19, line: 'Not this time.', key: [0] },
    { t: '0:19', start: 19, end: 22, line: 'One minute. Their words.', key: [3] },
    { t: '0:22', start: 22, end: 25.5, line: 'What it costs their company.', key: [2] },
    { t: '0:25', start: 25.5, end: 29, line: 'A team like theirs that fixed it.', key: [5] },
    { t: '0:29', start: 29, end: 32, line: 'One page. About them.', key: [3] },
    { t: '0:32', start: 32, end: 34.5, line: 'They tap.', key: [1] },
    { t: '0:34', start: 34.5, end: 37.5, line: 'They read it. Twice.', key: [3] },
    { t: '0:37', start: 37.5, end: 40.5, line: 'Booked.', key: [0] },
    { t: '0:40', start: 40.5, end: 42.5, line: 'Be the one they remember.', key: [4] },
    {
      t: '0:42',
      start: 42.5,
      end: 46,
      line: 'INSIGNAR. Make every introduction worth more.',
      key: [5],
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
    costSources: ['EXAMPLE source 1', 'EXAMPLE source 2'],
    costSourceLine: 'EXAMPLE sources: placeholders, not real citations',
    illustrative: 'ILLUSTRATIVE',
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
      h: 'They keep the card.',
      p: 'The card opens the page.',
    },
    {
      n: '02',
      h: 'Numbered, named, matte black.',
      p: '',
    },
    {
      n: '03',
      h: 'No app.',
      p: '',
    },
    { n: '04', h: 'No NFC? They scan it.', p: '' },
  ],
};

export const page = {
  label: '[ WHAT THEY GET ]',
  title: 'This is what lands on their phone.',
  lead: 'No deck. No form. Their problem, priced and solved.',
  figs: 'FIG 3.1 · EXAMPLE page for Daniel at Northwind',
  header: 'For Daniel, Northwind',
  one: {
    h: 'Your problem',
    q: '“Tickets double after every release.”',
    by: 'You, at the event',
  },
  two: {
    h: 'What it costs your team',
    range: '£38k to £92k a year',
    sources: ['EXAMPLE source 1', 'EXAMPLE source 2'],
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
  trust: [
    { h: 'One tap to remove.', p: 'They can remove their details in one tap.' },
    { h: 'Their ideas stay theirs.', p: 'Quoted back as theirs.' },
    { h: 'Drafts wait for you.', p: 'Nothing is sent until you send it.' },
  ],
};

export const exploded = {
  label: '[ THE CARD, EXPLODED ]',
  title: 'Built to be kept.',
  body: '',
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
  title: 'Fifty names. Five that matter. Know which.',
  note: 'Only you see this. Never on the page they get.',
  manager: {
    label: '[ MANAGER VIEW ]',
    note: 'Running a team? See which introductions turned into meetings.',
    example: 'EXAMPLE',
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
  title: 'Your next ten introductions, done properly.',
  offer: ['Ten numbered cards', 'Four weeks', 'Founding places are limited'],
  outline: '',
  trust:
    'You record. INSIGNAR prepares. You review before anything is shared. They can remove their details in one tap.',
  form: {
    name: 'Your name',
    email: 'Work email',
    company: 'Company',
    reps: 'Number of reps',
    submit: 'Request a founding pilot',
    sending: 'Sending…',
    success: 'Request received (demo: not stored yet).',
    error: 'Something went wrong. Please check your details and try again.',
    privacyLine: 'We use these details only to arrange your pilot. Remove them any time.',
    privacy: 'How we handle your details',
  },
};

export const faq = {
  label: '[ QUESTIONS ]',
  title: 'Short answers.',
  items: [
    {
      q: "I don't have time.",
      a: "One minute, after you've walked away. Less than the email you'd write anyway.",
    },
    {
      q: 'What if their phone has no NFC?',
      a: 'Every card carries a QR code that opens the same page.',
    },
    {
      q: "Isn't it just a fancy business card?",
      a: 'The card is the key. The page wins the meeting.',
    },
    {
      q: 'Will it feel creepy?',
      a: 'It only uses what they told you. You approve every word. They can delete it in one tap.',
    },
  ],
};

export const footer = {
  line: 'INSIGNAR. Make every introduction count.',
  privacy: 'Privacy',
  readFilm: 'Read the film',
};
