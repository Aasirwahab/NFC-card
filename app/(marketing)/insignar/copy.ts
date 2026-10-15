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
  subStrong: 'Your follow-up, written from what they told you.',
  subSoft:
    'Say it once, in under a minute. INSIGNAR builds a private page about their problem, what it costs them and how you would fix it. You approve it before they see it.',
  primary: 'Request a founding pilot',
  secondary: 'Watch the film',
  chipCaption: 'What they told you',
  chipQuote: 'Tickets double after every release.',
  fig: 'Card A·07, handed over at 19:42, tapped at 07:58 the next morning',
};

export const steps = {
  fig: () => '',
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
  label: '',
  title: 'Watch it. Then think about your last event.',
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  transcript: 'Transcript',
  note: 'Muted by default. All figures on screen are EXAMPLE.',
  voiceNote: 'Voice: optional. The film works muted.',
  beats: [
    { t: '0:00', start: 0, end: 4, line: 'Everyone pitched him.' },
    { t: '0:04', start: 4, end: 7, line: 'You listened.' },
    {
      t: '0:07',
      start: 7,
      end: 9,
      line: 'One note. Your private note · 60 s: “Release night. Every time.”',
    },
    { t: '0:09', start: 9, end: 13, line: 'He forgot them all. Except one. He kept your card.' },
    {
      t: '0:13',
      start: 13,
      end: 19,
      line: 'You were already prepared. His own words become his page; example cost, labelled.',
    },
    { t: '0:19', start: 19, end: 23, line: 'He booked. See you Thursday.' },
    { t: '0:23', start: 23, end: 27, line: 'Be the one they call back.' },
  ],
  silence: '(silence)',
};

export const card = {
  label: '',
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
  label: '',
  title: 'This is what lands on their phone.',
  lead: 'A page about their problem: what it costs them and how you would fix it.',
  figs: 'Example page for Daniel at Northwind',
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
    { h: 'They can delete it.', p: 'Every page has a button that removes their details.' },
    { h: 'Their words stay theirs.', p: 'Shown back to them as they said it, never rewritten.' },
    { h: 'Drafts wait for you.', p: 'Nothing is sent until you send it.' },
  ],
};

export const exploded = {
  label: '',
  title: 'Built to be kept.',
  body: '',
  layers: [
    '[ 01 ] DEBOSSED MARK, BLIND',
    '[ 02 ] QR, FALLBACK FOR ANY PHONE',
    '[ 03 ] NFC STICKER, ONE PER CARD',
    '[ 04 ] MATTE BLACK CARD  A·07',
  ],
  fig: 'Card A·07, taken apart',
};

export const five = {
  label: '',
  title: 'Fifty names from one event. Five are worth your next hour.',
  note: 'Only you see this. Never on the page they get.',
  manager: {
    label: '',
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
  label: '',
  title: 'Your next ten introductions, done properly.',
  offer: ['Ten numbered cards', 'Four weeks'],
  outline: '',
  trust: 'You record. INSIGNAR prepares. You review before anything is shared.',
  form: {
    name: 'Your name',
    email: 'Work email',
    company: 'Company',
    reps: 'Team size (just you is fine)',
    submit: 'Request a founding pilot',
    sending: 'Sending…',
    success: 'Thanks. We have your request and will be in touch to arrange your pilot.',
    error: 'Something went wrong. Please check your details and try again.',
    privacyLine: 'We use these details only to arrange your pilot. Remove them any time.',
    privacy: 'How we handle your details',
  },
};

export const faq = {
  label: '',
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
