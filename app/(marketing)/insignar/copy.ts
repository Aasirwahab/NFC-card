/**
 * Every string on the INSIGNAR landing page. Source: insignar-design/COPY.md and film/FILM_SCRIPT.md.
 * Voice: the page speaks to the visitor (the rep) as "you". Daniel (prospect) and Maya (rep) appear only inside labelled EXAMPLE mockups. Every number is EXAMPLE until sourced.
 * Strings marked BUILD-DRAFT are not in COPY.md; they were written for layout and need sign-off.
 */
export const EXAMPLE = 'EXAMPLE';

export const meta = {
  title: 'Make every introduction worth more',
  description:
    'INSIGNAR is introduction software. You record what you heard; they get a private page about their problem.',
};

export const hero = {
  eyebrow: 'Introduction software',
  headline: 'Open with their problem, not yours.',
  subStrong: 'Generic pitches get deleted. You listen for 60 seconds instead.',
  subSoft:
    'Record a voice note after you meet someone. INSIGNAR turns it into a private page about their problem, researched with sources and ready for you to approve.',
  primary: 'Discuss a founding pilot',
  secondary: 'Watch the film',
  chipCaption: 'What they told you',
  chipQuote: 'Tickets double after every release.',
  chipTag: EXAMPLE,
  fig: 'FIG 0.1 · card A·07, handed 19:42, tapped 07:58',
  figNote: EXAMPLE,
};

export const steps = {
  fig: (n: number) => `FIG 0.${n + 1} · 0${n}`,
  items: [
    {
      title: 'You listen.',
      lead: 'Record 60 seconds in your own voice.',
      body: 'Their words, saved from a voice note. Nothing to type.',
    },
    {
      title: 'We research.',
      lead: 'What the problem costs their company.',
      body: 'A range with sources. You confirm it before anything is sent.',
    },
    {
      title: 'You send a page, not a pitch.',
      lead: 'Their problem, a team like theirs, one next step.',
      body: 'Private to them, in their own words.',
    },
  ],
};

export const film = {
  label: '[ THE FILM · 42 SECONDS ]',
  title: 'You met them. Here is what happens next.',
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
      h: 'Numbered. Named. Yours.',
      p: 'Every card carries your name and its own number, A·07.',
    },
    {
      n: '02',
      h: 'The back says who wrote the notes.',
      p: 'Your name and the event, so they know the page is from you. Private. Tap to read.',
    },
    {
      n: '03',
      h: 'Tap here.',
      p: 'The NFC point opens their page. When they tap, we already know who it is for. No form.',
    },
    { n: '04', h: 'No NFC? Scan.', p: 'Every card carries a QR code that opens the same page.' },
  ],
};

export const page = {
  label: '[ WHAT THEY GET ]',
  title: 'A page about their problem. Not a pitch.',
  lead: 'Five parts, in this order. Private to the person you met, with a way out on every screen.',
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
  exampleNote: 'All figures on this page are EXAMPLE.',
  trust: [
    { h: 'One tap to remove.', p: 'They can remove their details in one tap.' },
    { h: 'Their ideas stay theirs.', p: 'Quoted back as theirs.' },
    { h: 'Drafts wait for you.', p: 'Nothing is sent until you send it.' },
  ],
};

export const exploded = {
  label: '[ THE CARD, EXPLODED ]',
  title: 'One card. One person. One page.',
  body: 'Every card is numbered and live before the event. When they tap it, we already know who it is for. No form.',
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
  note: 'For sales directors only. Never on the page your prospect sees.',
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
    'Three or more of your reps, ten numbered cards each',
    'A scorecard you agree in writing before day one',
    'A CSV export and a clean exit',
  ],
  outline: '3+ reps, 10 cards each, 4 weeks.',
  trust:
    'You record. INSIGNAR prepares. You review before anything is shared. They can remove their details in one tap.',
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
    submit: 'Send request',
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
      q: 'Is this a business card company?',
      a: 'No. The card is only the key. The product is the software that turns what you heard into a page about their problem.',
    },
    {
      q: 'What if their phone has no NFC?',
      a: 'Every card carries a QR code that opens the same page.',
    },
    { q: 'Does it send emails for me?', a: 'No. It drafts; you review and send.' },
    {
      q: 'What does the pilot involve?',
      a: 'Ten cards for you, ten real conversations, and we measure taps and meetings booked.',
    },
  ],
};

export const footer = {
  line: 'INSIGNAR · Introduction software',
  privacy: 'Privacy',
  readFilm: 'Read the film',
  note: 'Concept page. Nothing here is a claim about results.',
};
