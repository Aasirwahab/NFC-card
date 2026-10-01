import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { env } from '@/lib/env';
import { EarlyAccessForm } from './early-access-form';
import { Icon, type IconName } from './icons';
import { Scenario } from './scenario';
import { TryIt } from './try-it';
import './landing.css';

const DESCRIPTION =
  'INSIGNAR helps you remember what mattered in an in-person conversation and follow up with something thoughtful. Early access is open to a small group of founding members.';

export const metadata: Metadata = {
  // Link previews need absolute image URLs.
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { absolute: 'INSIGNAR · Make every introduction worth more' },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    title: 'INSIGNAR: Make every introduction worth more',
    description: DESCRIPTION,
    images: ['/landing/og.png'],
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', images: ['/landing/og.png'] },
};

/*
 * The public home page: Zaid's beta page (beta-site/index.html), rebuilt here
 * so there is one site. Every claim follows the landing brief's rules
 * (docs/handoff/2026-09-25-landing-page-brief.md): no invented numbers,
 * fictional people only, each capability tagged Prototype or Planned.
 */

const JOURNEY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'users',
    title: 'You meet someone important',
    body: 'The conversation is good and the moment is real.',
  },
  {
    icon: 'chat',
    title: 'Life gets busy',
    body: 'By the evening, the details have started to fade.',
  },
  {
    icon: 'clock',
    title: 'The follow-up gets delayed',
    body: '“I’ll do it tomorrow” becomes next week.',
  },
  {
    icon: 'doc',
    title: 'A real opportunity goes quiet',
    body: 'Not because it wasn’t there, but because it wasn’t continued.',
  },
];

const TIMELINE = [
  {
    when: 'Before the event',
    title: 'Get cards ready',
    body: 'Activate each card to the event, so your phone stays in your pocket.',
  },
  {
    when: 'In the room',
    title: 'Hand it over',
    body: 'Nothing to type. The conversation keeps your full attention.',
  },
  {
    when: 'That evening',
    title: 'Note what mattered',
    body: 'A few words on the person and the problem they raised. It stays private.',
  },
  {
    when: 'Next morning',
    title: 'See where you stand',
    body: 'A short summary of who you met, and who still needs a note.',
  },
  {
    when: 'A day later',
    title: 'Send a follow-up',
    body: 'If their page is still unopened, a draft is waiting for you to review and send.',
  },
  {
    when: 'When they open it',
    title: 'You’re told',
    body: 'A note that they’ve opened their page, with a way to book time with you.',
  },
];

const RULES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'shield',
    title: 'Your private note stays private.',
    body: 'What you write about someone is never shown to them and never quoted back.',
  },
  {
    icon: 'search',
    title: 'Only facts it can quote.',
    body: 'Anything about their business comes from their own public website. If it can’t be quoted, it isn’t used.',
  },
  {
    icon: 'users',
    title: 'No watching, no boasting.',
    body: 'A draft never mentions whether someone did or didn’t open their page.',
  },
  {
    icon: 'pen',
    title: 'You press send.',
    body: 'Every message is a draft for you to review. Nothing goes out in your name on its own.',
  },
];

const FEATURES: { icon: IconName; title: string; body: string; planned?: boolean }[] = [
  {
    icon: 'user',
    title: 'Remembers every person',
    body: 'Each introduction is tied to the card you handed over, with your note attached.',
  },
  {
    icon: 'search',
    title: 'Researches the opportunity',
    body: 'Facts from the company’s own website. Nothing invented.',
  },
  {
    icon: 'mail',
    title: 'Drafts your follow-up',
    body: 'For email or LinkedIn, if they haven’t opened their page after a day.',
  },
  {
    icon: 'bell',
    title: 'Tells you when to act',
    body: 'A note when someone opens their page, and a summary the morning after an event.',
  },
  {
    icon: 'cal',
    title: 'Prepares you for the next meeting',
    body: 'A short briefing with context and history before you walk in.',
    planned: true,
  },
  {
    icon: 'layers',
    title: 'Connects to your CRM',
    body: 'The first connection will be chosen with our founding members. Until then, your leads export as a spreadsheet.',
    planned: true,
  },
];

const CARD_POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'user', title: 'One card for each person', body: 'Yours to hand over, theirs to keep.' },
  { icon: 'tap', title: 'Tap or scan', body: 'NFC and a QR code, on any modern phone.' },
  { icon: 'link', title: 'No app, no account', body: 'It opens in their browser.' },
  {
    icon: 'shield',
    title: 'Prepared beforehand',
    body: 'Activate cards ahead of the event, and keep your phone away during the conversation.',
  },
];

const QUESTIONS = [
  {
    q: 'Does the person I meet need an app?',
    a: 'No. The card opens a page in their phone’s browser. There is nothing to install and no account to make.',
  },
  {
    q: 'What if their phone doesn’t support NFC?',
    a: 'Every card also carries a QR code that opens the same page, so any phone camera works.',
  },
  {
    q: 'Who can see my notes?',
    a: 'Only you. What you write about someone is never shown to them and never quoted back.',
  },
  {
    q: 'Where does the information about their company come from?',
    a: 'From their own public website, and only facts that can be quoted from it. If there’s nothing to quote, the page is written from what you told us.',
  },
  {
    q: 'Is it available now?',
    a: 'Not publicly. It’s a working prototype being tested with a small group. Founding members get it first, and we set it up with them.',
  },
  {
    q: 'What does it cost?',
    a: 'Founding members pay nothing. Pricing will be set after the founding group, and we’ll tell you before anything changes.',
  },
];

const GIVE = [
  'We set up your profile and what your business does',
  'You shape what gets built next',
  'No charge for founding members',
  'We read every application and choose the ten by fit',
];

function Eyebrow({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="eyebrow">
      <b>{n}</b>
      {children}
    </p>
  );
}

function Status({ planned }: { planned?: boolean }) {
  return planned ? (
    <span className="pill plan">Planned</span>
  ) : (
    <span className="pill proto">Prototype</span>
  );
}

export default function HomePage() {
  return (
    <div className="lp">
      <nav className="bar-top" aria-label="Main">
        <div className="wrap">
          <Link href="/" aria-label="INSIGNAR home">
            <Wordmark />
          </Link>
          <div className="links">
            <a href="#how">How it works</a>
            <a href="#discretion">Discretion</a>
            <a href="#card">The card</a>
            <a href="#faq">Questions</a>
          </div>
          <div className="nav-end">
            <Link className="signin" href="/sign-in">
              Sign in
            </Link>
            <a className="btn btn-ink" href="#early-access">
              Join the pilot
            </a>
          </div>
        </div>
      </nav>

      <main>
        <header className="hero">
          <div className="wrap">
            <div>
              <p className="eyebrow">
                <b>●</b>For people who think a few moves ahead
              </p>
              <h1>Make every introduction worth more.</h1>
              <p className="lede">
                INSIGNAR helps you remember what mattered in an in-person conversation, understand
                who you met, and follow up with something thoughtful. A smart card is where it
                begins.
              </p>
              <div className="cta">
                <a className="btn btn-coral" href="#early-access">
                  Join the pilot <Icon name="arrow" />
                </a>
                <a className="btn btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
              <p className="status-line">
                <i />
                Early access. The product is in development, and we&rsquo;re starting with ten
                founding members.
              </p>
            </div>
            <TryIt />
          </div>
        </header>

        <hr className="sep" />

        <section>
          <div className="wrap split">
            <div
              className="bd"
              role="img"
              aria-label="Two panels. Without INSIGNAR: an empty follow-up email. With INSIGNAR: a private note and a follow-up draft ready to review. Concept preview with fictional details."
            >
              <div className="bd-blank" aria-hidden="true">
                <span className="bd-cap">Without INSIGNAR · two days later</span>
                <div className="bd-row">
                  <b>To</b>
                  <span>Priya Nair</span>
                </div>
                <div className="bd-row">
                  <b>Subject</b>
                  <span className="ph" />
                </div>
                <div className="bd-body">
                  <i className="cur" />
                </div>
              </div>
              <div className="bd-ready" aria-hidden="true">
                <span className="tag" style={{ right: 12, top: 10 }}>
                  Concept preview
                </span>
                <span className="bd-cap">With INSIGNAR · ready when you are</span>
                <div className="k">Your note · private</div>
                <div className="note-l">Wants to speed up quoting. Asked about integrations.</div>
                <div className="k" style={{ marginTop: 14 }}>
                  Follow-up draft
                </div>
                <div className="draft">
                  Hi Priya, good to meet you at the freight forum. You mentioned quoting. I&rsquo;ve
                  put down a few thoughts on how we&rsquo;d approach it, and I&rsquo;d be glad to
                  walk you through them in fifteen minutes.
                </div>
                <div className="use" style={{ marginTop: 14 }}>
                  <span>You review it. You press send.</span>
                  <i>Review</i>
                </div>
              </div>
            </div>
            <div>
              <Eyebrow n="01">The problem</Eyebrow>
              <div className="head" style={{ margin: '14px 0 0' }}>
                <h2>Great conversations often go nowhere.</h2>
              </div>
              <p className="sub">
                You meet valuable people, then details fade, follow-ups slip and opportunities go
                quiet. It rarely happens on purpose.
              </p>
              <ol className="journey">
                {JOURNEY.map((step) => (
                  <li key={step.title}>
                    <span className="ic">
                      <Icon name={step.icon} />
                    </span>
                    <div>
                      <b>{step.title}</b>
                      {step.body}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <hr className="sep" />

        <section id="how">
          <div className="wrap">
            <div className="head">
              <Eyebrow n="02">After you say goodbye</Eyebrow>
              <h2>The follow-up starts before you&rsquo;ve left the room.</h2>
              <p>
                Here&rsquo;s what the prototype does, from the day before the event to the moment
                they open their page.
              </p>
            </div>
            <ol className="tl">
              {TIMELINE.map((step, i) => (
                <li key={step.title}>
                  <span className={i === TIMELINE.length - 1 ? 'dot on' : 'dot'} />
                  <span className="when">{step.when}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <Status />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="disc-sec" id="discretion">
          <div className="wrap">
            <div className="head">
              <Eyebrow n="03">Discretion</Eyebrow>
              <h2>Discretion, built in.</h2>
              <p>
                For people whose name is on the line, how a follow-up feels matters as much as
                whether it arrives.
              </p>
            </div>
            <div className="rules">
              {RULES.map((rule) => (
                <div key={rule.title}>
                  <span className="ic">
                    <Icon name={rule.icon} />
                  </span>
                  <h3>{rule.title}</h3>
                  <p>{rule.body}</p>
                </div>
              ))}
            </div>
            <p className="rules-note">
              These are how the prototype works today, and rules we intend to keep.
            </p>
          </div>
        </section>

        <section className="work">
          <div className="wrap split">
            <div>
              <Eyebrow n="04">Your side</Eyebrow>
              <div className="head" style={{ margin: '14px 0 0' }}>
                <h2>Remembers. Researches. Prepares. So you don&rsquo;t have to.</h2>
              </div>
              <ul className="feat">
                {FEATURES.map((feature) => (
                  <li key={feature.title}>
                    <span className="ic">
                      <Icon name={feature.icon} />
                    </span>
                    <div>
                      <b>
                        {feature.title} <Status planned={feature.planned} />
                      </b>
                      <span className="d">{feature.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="app"
              role="img"
              aria-label="Concept preview of a person’s record showing company insights, a suggested next move, a follow-up draft and meeting preparation"
            >
              <span className="tag" style={{ right: 14, top: 11 }}>
                Concept preview · fictional people
              </span>
              <div className="wbar" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="ws" aria-hidden="true">
                <div className="side">
                  <div className="lg">
                    <Image src="/landing/insignar-mark-white.png" alt="" width={20} height={20} />
                  </div>
                  <span>
                    <Icon name="home" />
                    Today
                  </span>
                  <span className="on">
                    <Icon name="users" />
                    People
                  </span>
                  <span>
                    <Icon name="mail" />
                    Follow-ups
                  </span>
                  <span>
                    <Icon name="cal" />
                    Events
                  </span>
                </div>
                <div className="main">
                  <div className="person">
                    <div className="av">PN</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>Priya Nair</div>
                      <small>Founder · Northwind Freight</small>
                    </div>
                  </div>
                  <div className="box">
                    <div className="h6">
                      About the company <span className="pill d-plan">planned</span>
                    </div>
                    <ul>
                      <li>Runs freight across the North of England</li>
                      <li>Recently opened a second depot</li>
                      <li>Hiring for operations</li>
                    </ul>
                  </div>
                  <div className="box">
                    <div className="h6">
                      Suggested next move <span className="pill d-plan">planned</span>
                    </div>
                    <div className="use">
                      <span style={{ color: 'var(--dtext)' }}>
                        Send a worked example on quoting
                      </span>
                      <i>Use draft</i>
                    </div>
                  </div>
                  <div className="box">
                    <div className="h6">What you noted</div>
                    Wants to speed up quoting. Asked about integrations.
                  </div>
                </div>
                <div className="aside">
                  <div className="h5">FOLLOW-UP DRAFT</div>
                  <div className="draft">
                    Hi Priya, good to meet you at the freight forum. You mentioned quoting…
                  </div>
                  <div className="h5" style={{ marginTop: 16 }}>
                    MEETING PREP <span className="pill d-plan">planned</span>
                  </div>
                  <div className="mv">
                    Key points<span>3 talking points</span>
                  </div>
                  <div className="mv">
                    History<span>Met 3 days ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cardsec" id="card">
          <div className="wrap split">
            <div>
              <Eyebrow n="05">The smart card</Eyebrow>
              <div className="head" style={{ margin: '14px 0 0' }}>
                <h2>Designed to be remembered.</h2>
              </div>
              <p className="sub">
                The card is where it starts. It opens what you&rsquo;ve prepared for that one
                person.
              </p>
              <div className="pf">
                {CARD_POINTS.map((point) => (
                  <div key={point.title}>
                    <Icon name={point.icon} />
                    <div>
                      <b>{point.title}</b>
                      {point.body}
                    </div>
                  </div>
                ))}
              </div>
              <p className="fineprint">
                Card design and materials are still being finalised for the pilot.
              </p>
            </div>
            <div className="cardstage">
              <div className="card3d" aria-hidden="true">
                <Image src="/landing/insignar-mark-white.png" alt="" width={86} height={86} />
                <small>PRIVATE ISSUE · 07 / 25</small>
              </div>
            </div>
          </div>
        </section>

        <section className="scen" id="scenario">
          <div className="wrap">
            <div className="head">
              <Eyebrow n="06">An illustrative scenario</Eyebrow>
              <h2>What could a missed follow-up be worth?</h2>
              <p>
                A simple way to think about it. Enter your own numbers, or try an example. Nothing
                here is a forecast.
              </p>
            </div>
            <Scenario />
          </div>
        </section>

        <hr className="sep" />

        <section className="faq" id="faq">
          <div className="wrap">
            <div className="head">
              <Eyebrow n="07">Questions</Eyebrow>
              <h2>Straight answers.</h2>
            </div>
            <div className="list">
              {QUESTIONS.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final" id="early-access">
          <div className="wrap split">
            <div>
              <p className="eyebrow">08 · Early access</p>
              <h2>Make the next introduction worth more.</h2>
              <p className="l">
                We&rsquo;re starting with ten founding members. We set everything up with you, and
                in return ask for an honest account of how it went.
              </p>
              <ul className="give">
                {GIVE.map((line) => (
                  <li key={line}>
                    <Icon name="check" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="quote">A system for people who think ahead.</p>
            </div>
            <div className="formcard">
              <h3>Request early access</h3>
              <EarlyAccessForm />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="fr">
            <Image src="/landing/insignar-lockup-white.png" alt="INSIGNAR" width={44} height={30} />
            <div className="fl">
              <a href="#how">How it works</a>
              <Link href="/privacy">Privacy</Link>
              <Link href="/sign-in">Sign in</Link>
            </div>
          </div>
          <p className="fine">
            INSIGNAR is in development. Features marked &ldquo;Planned&rdquo; are not available yet,
            and features marked &ldquo;Prototype&rdquo; are being tested and may change. Interface
            images are concept previews and use fictional people and companies. The scenario
            calculator is illustrative and isn&rsquo;t a prediction or a promise of results.
          </p>
          <p className="fine">© 2026 INSIGNAR</p>
        </div>
      </footer>
    </div>
  );
}
