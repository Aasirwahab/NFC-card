import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { printedCode } from '@/lib/cards/issue-batch';
import { tagUrl } from '@/lib/cards/urls';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { listReps } from '@/lib/ops/data';
import { cardProgress } from '@/lib/ops/stock';
import { Button } from '@/components/ui/button';
import { reassignCardAction, resetCardAction, voidCardAction } from '../../actions';

export const metadata = { title: 'Card · Operator console' };

export default async function OpsCard({ params, searchParams }: PageProps<'/ops/cards/[code]'>) {
  await requireStaff();
  const code = normaliseCode((await params).code);
  const { error, done } = await searchParams;
  if (!isValidCode(code)) notFound();
  const db = serviceClient();

  const { data: card } = await db
    .from('cards')
    .select('id, code, status, user_id, batch_id, written_at, verified_at, created_at')
    .eq('code', code)
    .maybeSingle();
  if (!card) notFound();

  const [{ data: profile }, { data: sessions }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', card.user_id).maybeSingle(),
    db.from('sessions').select('id, status, first_viewed_at').eq('card_id', card.id),
  ]);

  const unused = card.status === 'available' && (sessions?.length ?? 0) === 0;
  const reps = unused ? (await listReps()).filter((r) => r.id !== card.user_id) : [];

  const rows: [string, string][] = [
    ['Status', card.status],
    ['Programming', cardProgress(card)],
    ['Owner', profile?.full_name ?? card.user_id],
    ['Leads', String(sessions?.length ?? 0)],
    ['Tag link', tagUrl(env.NEXT_PUBLIC_APP_URL, card.code)],
  ];

  return (
    <div>
      <Link
        href={`/ops/users/${card.user_id}`}
        className="text-ink-3 text-[13px] underline underline-offset-2"
      >
        {profile?.full_name ?? 'Owner'}
      </Link>
      <h1 className="font-display text-ink mt-2 font-mono text-3xl font-bold tracking-wider">
        {printedCode(card.code)}
      </h1>
      <dl className="mt-4 flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="border-line-soft flex justify-between gap-4 border-b pb-2">
            <dt className="text-ink-3 text-[13px]">{k}</dt>
            <dd className="text-ink min-w-0 truncate text-right font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>

      {done ? (
        <p className="text-ok mt-3 text-[13px]" role="status">
          {done === 'voided' ? 'Card voided.' : 'Card moved.'}
        </p>
      ) : null}
      {error ? (
        <p className="text-crit mt-3 text-[13px]" role="alert">
          {error === 'in_use'
            ? 'This card is in use or already voided, so it cannot be changed here. A used card is voided from the rep\u2019s lead.'
            : error === 'no_user'
              ? 'That user does not exist.'
              : 'That did not work.'}
        </p>
      ) : null}

      {unused ? (
        <section className="mt-6 flex flex-col gap-4">
          <form action={reassignCardAction} className="border-line rounded-xl border p-4">
            <input type="hidden" name="code" value={card.code} />
            <p className="text-ink text-[14px] font-semibold">Move to another rep</p>
            <p className="text-ink-3 text-[12px]">Only works while the card has never been used.</p>
            <div className="mt-2 flex gap-2">
              <select
                name="userId"
                required
                defaultValue=""
                className="border-line bg-bg text-ink min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-[14px]"
                aria-label="New owner"
              >
                <option value="" disabled>
                  Choose a rep
                </option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name ?? r.email}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" className="shrink-0">
                Move
              </Button>
            </div>
          </form>

          <div className="border-line flex flex-wrap gap-2 rounded-xl border p-4">
            <form action={voidCardAction}>
              <input type="hidden" name="code" value={card.code} />
              <Button type="submit" variant="secondary">
                Void (lost or damaged)
              </Button>
            </form>
            {card.written_at || card.verified_at ? (
              <form action={resetCardAction}>
                <input type="hidden" name="code" value={card.code} />
                <input type="hidden" name="batchId" value={card.batch_id ?? ''} />
                <Button type="submit" variant="secondary">
                  Write again
                </Button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
