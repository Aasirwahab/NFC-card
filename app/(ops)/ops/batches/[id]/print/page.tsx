import { requireStaff } from '@/lib/auth/staff';
import QRCode from 'qrcode';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { printedCode } from '@/lib/cards/issue-batch';
import { qrUrl } from '@/lib/cards/urls';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { PrintButton } from './print-button';

export const metadata = { title: 'QR labels · Operator console' };

/**
 * The QR label sheet for one batch. Each QR carries `/c/CODE?src=qr`, the same code
 * as the NFC sticker, so a scan and a tap open the same card and only the source
 * differs. The printed code under the QR is the backup when a phone cannot scan.
 */
export default async function PrintPage({ params }: PageProps<'/ops/batches/[id]/print'>) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = serviceClient();

  const { data: batch } = await db
    .from('card_batches')
    .select('id, label, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!batch) notFound();

  const [{ data: cards }, { data: profile }] = await Promise.all([
    db.from('cards').select('code').eq('batch_id', id).order('created_at', { ascending: true }),
    db.from('profiles').select('full_name').eq('id', batch.user_id).maybeSingle(),
  ]);

  const labels = await Promise.all(
    (cards ?? []).map(async (c) => ({
      code: c.code,
      svg: await QRCode.toString(qrUrl(env.NEXT_PUBLIC_APP_URL, c.code), {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      }),
    })),
  );

  return (
    <div>
      <div className="print:hidden">
        <Link
          href={`/ops/batches/${id}`}
          className="text-ink-3 text-[13px] underline underline-offset-2"
        >
          Back to writing
        </Link>
        <h1 className="font-display text-ink mt-2 text-2xl font-bold tracking-tight">
          QR labels · {profile?.full_name ?? 'Rep'}
        </h1>
        <p className="text-ink-3 mt-1 text-[13px]">
          Print at 100% scale. Each label is 35 mm square; cut and stick on the card named under it.
        </p>
        <div className="mt-3">
          <PrintButton />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 print:mt-0 print:grid-cols-4 print:gap-2">
        {labels.map((l) => (
          <figure
            key={l.code}
            className="border-line flex break-inside-avoid flex-col items-center rounded-md border bg-white p-1.5 [print-color-adjust:exact]"
          >
            <div
              className="aspect-square w-full max-w-[35mm] [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: l.svg }}
            />
            <figcaption className="mt-1 font-mono text-[11px] font-semibold tracking-wider text-black">
              {printedCode(l.code)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
