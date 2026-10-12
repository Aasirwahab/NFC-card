import { Building2, CalendarDays, Globe, Mail, Phone } from 'lucide-react';
import styles from '@/app/ui-slice.module.css';
import type { Resolved } from '@/lib/db/landing';
import { parseBookingUrl } from '@/lib/booking/link';
import { linkedinHref } from '@/lib/domain/linkedin';
import { publicWebsiteHref } from '@/lib/domain/public-profile';
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
  const website = publicWebsiteHref(business?.website);
  const tagline = business?.tagline?.trim();
  const company = business?.companyName?.trim();
  const contactEmail = rep.contactEmail?.trim();
  const phone = rep.phone?.trim();
  const services = (business?.services ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className={`${styles.surface} ${styles.publicPage} ${styles.ownerPage}`}>
      <Header rep={rep} business={business} />

      <main className="flex-1">
        <h1 className={styles.headline}>Great to meet you.</h1>
        {tagline ? <p className={`${styles.tagline} mt-3`}>{tagline}</p> : null}

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
          ) : (
            <SaveContact code={code} repName={first} primary />
          )}
          {linkedin ? (
            // preview: no session to count against, so never recorded.
            <LinkedInConnect code={code} href={linkedin} repName={first} preview />
          ) : null}
          {booking ? <SaveContact code={code} repName={first} /> : null}
          {!booking ? (
            <p className="text-ink-3 mt-3 text-center text-sm">Save my details to reconnect.</p>
          ) : null}
        </div>

        {services.length > 0 ? (
          <section className={styles.ownerSection}>
            <h2 className={styles.sectionLabel}>What I do</h2>
            <ol className={styles.numberedServices}>
              {services.map((service, index) => (
                <li key={service}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <p>{service}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <p className={`${styles.tagline} mt-7`}>
            Let&rsquo;s discuss what you&rsquo;re looking for.
          </p>
        )}

        {company || website ? (
          <section className={styles.ownerSection}>
            <h2 className={styles.sectionLabel}>Business details</h2>
            {company ? (
              <div className={styles.publicDetail}>
                <Building2 aria-hidden="true" className="h-5 w-5" />
                <div>
                  <span>Company</span>
                  <p>{company}</p>
                </div>
              </div>
            ) : null}
            {website ? (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.publicDetail}
              >
                <Globe aria-hidden="true" className="h-5 w-5" />
                <div>
                  <span>Website</span>
                  <p>{business?.website}</p>
                </div>
              </a>
            ) : null}
          </section>
        ) : null}

        <section className={styles.ownerSection}>
          <h2 className={styles.sectionLabel}>Keep in touch</h2>
          <div className={styles.keepInTouch}>
            <SaveContact code={code} repName={first} compact />
            {linkedin ? (
              <LinkedInConnect code={code} href={linkedin} repName={first} preview />
            ) : null}
          </div>
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`} className={styles.publicDetail}>
              <Mail aria-hidden="true" className="h-5 w-5" />
              <div>
                <span>Email</span>
                <p>{contactEmail}</p>
              </div>
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`} className={styles.publicDetail}>
              <Phone aria-hidden="true" className="h-5 w-5" />
              <div>
                <span>Phone</span>
                <p>{phone}</p>
              </div>
            </a>
          ) : null}
        </section>
      </main>

      <Footer />
    </div>
  );
}
