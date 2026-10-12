import Link from 'next/link';
import { Mic } from 'lucide-react';
import styles from '@/app/ui-slice.module.css';
import { printedCode } from '@/lib/cards/issue-batch';
import { COLOUR_HEX, type ColourTag } from '@/lib/domain/colours';
import type { SessionListItem } from '@/lib/db/rep';

/**
 * One lead in the dashboard list.
 *
 * Leads with "Card 3 (Blue)" because that is how a rep remembers the
 * conversation before a name exists (§10.3) — the colour and number are the
 * memory cue the whole capture flow is built around.
 *
 * Never shows `memorable_info`. The list query does not even select it.
 */
export function SessionRow({ session }: { session: SessionListItem }) {
  const hex = COLOUR_HEX[session.colour_tag as ColourTag] ?? '#6F685F';
  const who = [session.prospect_name, session.prospect_company].filter(Boolean).join(' · ');

  return (
    <Link href={`/sessions/${session.id}/edit`} className={styles.sessionRow}>
      <span aria-hidden="true" className={styles.miniCard} style={{ borderColor: hex }}>
        {session.cards ? printedCode(session.cards.code) : session.event_sequence_number}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-ink text-base font-semibold wrap-anywhere">
          {who || <span className="text-ink-3 italic">No details yet</span>}
        </p>
        <p className="text-ink-3 mt-1 font-mono text-[11px] wrap-anywhere">
          Card {session.event_sequence_number} · {session.colour_tag}
          {session.cards ? ` · ${printedCode(session.cards.code)}` : ''}
        </p>
      </div>

      <div className="flex max-w-[30%] shrink-0 flex-col items-end gap-1">
        {!session.details_completed_at ? (
          <span className={styles.captureIcon} aria-hidden="true">
            <Mic className="h-5 w-5" />
          </span>
        ) : null}
        <StatusPill session={session} />
        {session.first_viewed_at ? (
          <span className="text-ok text-[11px] font-medium">Tapped</span>
        ) : null}
      </div>
    </Link>
  );
}

function StatusPill({ session }: { session: SessionListItem }) {
  const { label, className } = describe(session);
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${className}`}>{label}</span>
  );
}

function describe(session: SessionListItem): { label: string; className: string } {
  if (!session.details_completed_at) {
    return { label: 'needs details', className: 'bg-warn-bg text-warn' };
  }

  switch (session.enrichment_status) {
    case 'completed':
      return { label: 'ready', className: 'bg-ok-bg text-ok' };
    case 'failed':
      // Not an error to the prospect — they get the template pitch (§16) — so
      // this is informational rather than alarming.
      return { label: 'template', className: 'bg-surface-2 text-ink-3' };
    case 'queued':
    case 'processing':
      return { label: 'working', className: 'bg-accent-soft text-accent' };
    default:
      return { label: 'pending', className: 'bg-surface-2 text-ink-3' };
  }
}
