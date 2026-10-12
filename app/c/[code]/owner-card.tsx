import { CalendarDays } from 'lucide-react';
import styles from '@/app/ui-slice.module.css';
import type { Resolved } from '@/lib/db/landing';
import { parseBookingUrl } from '@/lib/booking/link';
import { linkedinHref } from '@/lib/domain/linkedin';
import { LinkedInConnect } from './linkedin-connect';
import { Footer, Header, SaveContact } from './prospect-view';

/**
 * "One card, two jobs" (2026-09-25 review).
 *
 * A card with no live prospect — not yet registered, released, or voided after a
 * mix-up at the table — is the rep's own business card. Whoever holds it sees who
 * gave it to them, what they do, and how to reach them. No card is ever a dead end:
 * no signal at the venue, a forgotten registration and a wrong card handed over
 * all land here instead of on a 404.
 *
 * Only the rep's public face. There is no session, so nothing about any prospect
 * can appear, and nothing here is counted as a tap.
 */
type OwnerResolved = Extract<Resolved, { audience: 'owner' }>;

export function OwnerCard({ resolved }: { resolved: OwnerResolved }) {
  const { code, rep, business } = resolved;
  const first = rep.fullName.trim().split(/\s+/)[0] || rep.fullName;
  const booking = parseBookingUrl(rep.bookingUrl);
  const linkedin = linkedinHref(rep.linkedinUrl);
  const services = (business?.services ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className={`${styles.surface} ${styles.publicPage} ${styles.ownerPage}`}>
      <Header rep={rep} business={business} />

      <main className="flex-1">
        <h1 className={styles.headline}>Great to meet you.</h1>
        <div className={styles.ownerIntro}>
          {business?.tagline ? <p className={styles.tagline}>{business.tagline}</p> : null}
          <p>If you want to pick up where we left off, {first} will come prepared.</p>
        </div>

        {services.length > 0 ? (
          <section className={styles.services}>
            <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
              What {business?.companyName ?? first} does
            </h2>
            <ul className="mt-1.5">
              {services.map((service) => (
                <li key={service} className={styles.service}>
                  <span aria-hidden="true" className={styles.serviceDot} />
                  <span>{service}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className={styles.ownerActions}>
          {booking ? (
            // A plain link, not the embed: there is no session to attach a
            // booking to, and the rep's Cal.com page stands on its own.
            <a
              href={`${booking.calOrigin}/${booking.calLink}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.primaryAction}
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Book a time with {first}
            </a>
          ) : null}
          {linkedin ? (
            // preview: no session to count against, so never recorded.
            <LinkedInConnect code={code} href={linkedin} repName={first} preview />
          ) : null}
          <SaveContact code={code} repName={first} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
