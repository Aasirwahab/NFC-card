'use client';

import { apiSend } from '@/lib/http/client';

/**
 * "Connect with Zaid on LinkedIn" (2026-09-25 review).
 *
 * The allowed way to use LinkedIn: no scraping, no automation. A prospect who
 * connects gives the rep a lasting follow-up channel, and the rep then sees
 * their real company. The tap is counted like "clicked Book"; the preview never
 * counts.
 */
export function LinkedInConnect({
  code,
  href,
  repName,
  preview,
}: {
  code: string;
  href: string;
  repName: string;
  preview: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (!preview) apiSend(`/api/landing/${code}/linkedin-opened`, 'POST').catch(() => {});
      }}
      className="border-line text-ink-2 hover:bg-surface mt-3 flex h-12 items-center justify-center gap-2 rounded-lg border-[1.5px] text-[15px] font-medium"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
      </svg>
      Connect with {repName} on LinkedIn
    </a>
  );
}
