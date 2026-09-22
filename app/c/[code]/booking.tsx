'use client';

import { useState } from 'react';
import Cal from '@calcom/embed-react';
import { CalendarDays } from 'lucide-react';
import { SESSION_METADATA_KEY, type CalLink } from '@/lib/booking/link';
import { apiSend } from '@/lib/http/client';

/**
 * The booking calendar on the prospect page (spec §19.1).
 *
 * The rep's own Cal.com event, embedded — the calendar is never rebuilt. The
 * session id travels as booking metadata, which Cal.com returns in the webhook,
 * so the booking links back to this prospect.
 *
 * Hidden behind a button, so the embed script never costs the page its
 * two-second budget (§16), and so opening it can be counted ("clicked Book").
 */
export function Booking({
  code,
  sessionId,
  prospectName,
  link,
  preview,
}: {
  code: string;
  sessionId: string;
  prospectName: string | null;
  link: CalLink;
  preview: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (preview) {
    return (
      <p className="text-ink-3 mt-3 text-[13px]">
        Their booking calendar opens here. It is off in your preview, so you cannot book yourself by
        mistake.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // A count, not a gate: a failure here must never stop anyone booking.
          apiSend(`/api/landing/${code}/booking-opened`, 'POST').catch(() => {});
        }}
        className="bg-accent hover:bg-accent-hover mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-medium text-white"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Pick a time
      </button>
    );
  }

  // Cal.com's cloud serves its embed from app.cal.com; a self-hosted Cal serves its own.
  const cloud = link.calOrigin === 'https://cal.com';

  return (
    <div className="border-line-soft -mx-2 mt-4 h-[36rem] overflow-hidden rounded-lg border">
      <Cal
        calLink={link.calLink}
        calOrigin={cloud ? undefined : link.calOrigin}
        embedJsUrl={cloud ? undefined : `${link.calOrigin}/embed/embed.js`}
        config={{
          [`metadata[${SESSION_METADATA_KEY}]`]: sessionId,
          ...(prospectName ? { name: prospectName } : {}),
          layout: 'month_view',
        }}
        style={{ width: '100%', height: '100%', overflow: 'scroll' }}
      />
    </div>
  );
}
