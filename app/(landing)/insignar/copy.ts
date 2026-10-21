/**
 * Every string on the INSIGNAR landing page. Source: insignar-design/COPY_V3_SELL.md.
 */
export const EXAMPLE = 'EXAMPLE';

export const meta = {
  title: 'Be the one they call back',
  description:
    'Turn event introductions into booked meetings. Say what they told you; INSIGNAR builds a private page about their problem. Request a UK founding pilot.',
};

export const hero = {
  eyebrow: 'Introduction software',
  headline: 'Be the one they call back.',
  subStrong: 'Introduction and follow-up software, written from what they told you.',
  subSoft:
    'Say it once, in under a minute. INSIGNAR builds a private page about their problem, what it costs them and how you would fix it. Only the person you give the card to sees it.',
  primary: 'Request a founding pilot',
  secondary: 'Watch the film',
  assure: 'Founding pilot for UK teams: four weeks, ten numbered cards per rep.',
  chipCaption: 'What they told you',
  chipQuote: 'Tickets double after every release.',
  fig: 'Card A·07. Handed over at 19:42, tapped at 07:58 the next morning.',
};

export const steps = {
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
      title: 'You hand it over. They book.',
      lead: 'Nothing reaches them until they tap your card',
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
  note: 'Muted by default. Every figure on screen is an example.',
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
      h: 'A card they keep.',
      p: 'Nobody bins a card that was handed over after a real conversation. One tap opens a page about their problem, not yours.',
    },
    {
      h: 'Numbered to them.',
      p: 'Each card carries a number, so the page that opens is the one you wrote for that person.',
    },
    {
      h: 'No app. No sign-up.',
      p: 'It opens in their phone browser the moment they tap. Nothing to download, nothing to remember.',
    },
    {
      h: 'No NFC? They scan it.',
      p: 'The QR on the back opens the same page on any phone.',
    },
  ],
};

export const page = {
  title: 'This is what lands on their phone.',
  lead: 'A page about their problem: what it costs them and how you would fix it.',
  figs: 'Example page for Daniel at Northwind',
  header: 'For Daniel, Northwind',
  example: 'Example',
  initial: 'D',
  time: '07:58',
  url: 'Private page for Daniel',
  hint: 'Scroll the phone to read the whole page.',
  one: {
    h: 'Your problem',
    q: '“Tickets double after every release.”',
    by: 'You, at the event',
  },
  two: {
    h: 'What it costs your team',
    range: '£38k to £92k a year',
    sources: ['Built from your figures and public data. You confirm it.'],
    confirmed: 'Rep confirmed by Maya Okafor',
  },
  three: { h: 'What we checked', q: 'Northwind ships every two weeks, so the pattern repeats.' },
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
    ai: '',
  },
  concept: 'CONCEPT',
  trust: [
    { h: 'They can delete it.', p: 'Every page has a button that removes their details.' },
    { h: 'Their words stay theirs.', p: 'Shown back to them as they said it, never rewritten.' },
    { h: 'Drafts wait for you.', p: 'Nothing is sent until you send it.' },
  ],
};

export const exploded = {
  title: 'Built to be kept.',
  body: 'One card, one page. The NFC tag opens it, the QR is the fallback for any phone, and the number ties it to the person you gave it to.',
  layers: [
    'Debossed mark',
    'QR code, for any phone',
    'NFC tag, one per card',
    'The card, numbered A·07',
  ],
  fig: 'Card A·07, taken apart',
};

export const five = {
  title: 'Fifty names from one event. Five are worth your next hour.',
  note: 'Only you see this. Never on the page they get.',
  manager: {
    label: 'Example team view',
    note: 'Running a team? See which introductions turned into meetings.',
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
  title: 'Your next ten introductions, done properly.',
  offer: ['Ten numbered cards per rep', 'Four weeks', 'A written scorecard at the end'],
  outline: '',
  trust: 'You record. INSIGNAR prepares the page. You choose who gets the card.',
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
      q: 'How is this different from a digital business card?',
      a: 'A digital business card shares your contact details. INSIGNAR builds a private page about their problem and gets the meeting booked. The card is only the key.',
    },
    {
      q: 'Will it feel creepy?',
      a: 'It only uses what they told you, and you can edit the page any time. They can delete it in one tap.',
    },
  ],
};

export const nav = {
  home: 'INSIGNAR home',
  signIn: 'Sign in',
  pilot: 'Request a pilot',
};

export const footer = {
  line: 'INSIGNAR. Make every introduction count.',
  privacy: 'Privacy',
  readFilm: 'Read the film',
  facts: 'Facts',
  compare: 'vs digital business cards',
};
