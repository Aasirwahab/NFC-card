import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CopyField } from '@/components/copy-field';
import { printedCode } from '@/lib/cards/issue-batch';
import { tagUrl } from '@/lib/cards/urls';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { cardProgress, describeCard } from '@/lib/ops/stock';
import { markVerifiedAction, markWrittenAction, resetCardAction } from '../../actions';
import { Refresher } from './refresher';

export const metadata = { title: 'Write cards · Operator console' };

/**
 * The writing session. A web page cannot write NFC on an iPhone, so this walks the
 * person through it, one card at a time: copy the link, write it with NFC Tools,
 * then tap the sticker with the phone. The tap verifies it (see app/c/[code]).
 */
export default async function BatchPage({ params }: PageProps<'/ops/batches/[id]'>) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = serviceClient();

  const { data: batch } = await db
    .from('card_batches')
    .select('id, label, size, user_id, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!batch) notFound();

  const [{ data: cards }, { data: profile }] = await Promise.all([
    db
      .from('cards')
      .select('code, status, written_at, verified_at')
      .eq('batch_id', id)
      .order('created_at', { ascending: true }),
    db.from('profiles').select('full_name').eq('id', batch.user_id).maybeSingle(),
  ]);

  // Voided cards are out of the batch for counting: they will never be verified.
  const list = (cards ?? []).filter((c) => c.status !== 'voided');
  const voided = (cards ?? []).filter((c) => c.status === 'voided');
  const verified = list.filter((c) => c.verified_at).length;
  const current = list.find((c) => !c.verified_at && c.status === 'available');
  const currentProgress = current ? cardProgress(current) : null;

  return (
    <div>
      <Refresher />
      <Link
        href={`/ops/users/${batch.user_id}`}
        className="text-ink-3 text-[13px] underline underline-offset-2"
      >
        {profile?.full_name ?? 'Rep'}
      </Link>
      <h1 className="font-display text-ink mt-2 text-2xl font-bold tracking-tight">
        {batch.label || 'Card batch'}
      </h1>
      <p className="text-ink-3 mt-0.5 font-mono text-[12px]">
        {verified} of {list.length} verified
      </p>
      <div className="bg-line-soft mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-accent h-full"
          style={{ width: `${list.length ? (verified / list.length) * 100 : 0}%` }}
        />
      </div>

      {current ? (
        <section className="border-line bg-surface shadow-card mt-5 rounded-xl border p-4">
          <p className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
            Now writing
          </p>
          <p className="text-ink mt-1 font-mono text-3xl font-bold tracking-wider">
            {printedCode(current.code)}
          </p>

          <p className="text-ink-3 mt-4 text-[12px]">Link for the sticker</p>
          <CopyField
            value={tagUrl(env.NEXT_PUBLIC_APP_URL, current.code)}
            label="Link to write on the sticker"
          />

          {currentProgress === 'issued' ? (
            <>
              <ol className="text-ink-2 mt-4 list-decimal space-y-1 pl-5 text-[14px]">
                <li>Copy the link.</li>
                <li>Open NFC Tools, Write, Add a record, URL, paste it.</li>
                <li>Press Write and hold the sticker to the top of the phone.</li>
                <li>Press the button below.</li>
              </ol>
              <form action={markWrittenAction} className="mt-4">
                <input type="hidden" name="code" value={current.code} />
                <input type="hidden" name="batchId" value={id} />
                <Button type="submit" className="w-full">
                  I wrote it
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-ink mt-4 text-[15px] font-medium">
                Now tap the sticker with this phone to check it.
              </p>
              <p className="text-ink-3 mt-1 text-[13px]">
                Signed in as staff, the tap marks the card verified and does nothing else. This page
                updates by itself. Lock the tag (NFC Tools, Other, Lock tag) only after this check:
                locking is permanent.
              </p>
              <div className="mt-3 flex gap-2">
                <form action={markVerifiedAction}>
                  <input type="hidden" name="code" value={current.code} />
                  <input type="hidden" name="batchId" value={id} />
                  <Button type="submit" variant="secondary">
                    Mark verified by hand
                  </Button>
                </form>
                <form action={resetCardAction}>
                  <input type="hidden" name="code" value={current.code} />
                  <input type="hidden" name="batchId" value={id} />
                  <Button type="submit" variant="secondary">
                    Write again
                  </Button>
                </form>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="border-line bg-surface mt-5 rounded-xl border p-4">
          <p className="text-ink text-[15px] font-medium">
            Every card in this batch is active. Print the QR labels, stick each on its card, then
            send them to the rep. Until the rep adds an event or prospect details, a tap opens their
            portfolio.
          </p>
        </section>
      )}

      <Link
        href={`/ops/batches/${id}/print`}
        className="border-line text-ink mt-4 inline-block rounded-lg border px-4 py-2.5 text-[14px] font-medium"
      >
        Open QR label sheet
      </Link>

      <ul className="mt-6 flex flex-col gap-1.5">
        {[...list, ...voided].map((c) => (
          <li
            key={c.code}
            className="border-line-soft flex items-center justify-between border-b py-2 font-mono text-[13px]"
          >
            <Link href={`/ops/cards/${c.code}`} className="text-ink">
              {printedCode(c.code)}
            </Link>
            <span className="text-ink-3 text-[12px]">{describeCard(c).label.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
