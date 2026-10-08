import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { serviceClient } from '@/lib/db/service';
import { getOpsRep } from '@/lib/ops/data';
import { issueBatchAction } from '../../actions';

export const metadata = { title: 'Rep · Operator console' };

export default async function OpsUser({ params }: PageProps<'/ops/users/[id]'>) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const rep = await getOpsRep(id);
  if (!rep) notFound();

  const { data: batches } = await serviceClient()
    .from('card_batches')
    .select('id, label, size, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <Link href="/ops" className="text-ink-3 text-[13px] underline underline-offset-2">
        All reps
      </Link>
      <h1 className="font-display text-ink mt-2 text-2xl font-bold tracking-tight">
        {rep.name ?? 'No name yet'}
      </h1>
      <p className="text-ink-3 text-[13px]">{rep.email}</p>
      <p className="text-ink-2 mt-3 font-mono text-[13px]">
        {rep.stock.inStock} in stock · {rep.stock.handedOut} out · {rep.stock.lost} lost
      </p>

      <form
        action={issueBatchAction}
        className="border-line bg-surface shadow-card mt-5 rounded-xl border p-4"
      >
        <input type="hidden" name="userId" value={rep.id} />
        <p className="text-ink text-[14px] font-semibold">Issue cards</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            name="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            defaultValue={10}
            aria-label="How many cards"
            className="sm:w-28"
          />
          <Input name="label" placeholder="Label, e.g. Pilot" maxLength={80} aria-label="Label" />
          <Button type="submit" className="shrink-0">
            Issue and start writing
          </Button>
        </div>
      </form>

      <h2 className="text-ink-3 mt-6 font-mono text-[11px] tracking-[0.08em] uppercase">Batches</h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {(batches ?? []).map((b) => (
          <li key={b.id}>
            <Link
              href={`/ops/batches/${b.id}`}
              className="border-line bg-surface block rounded-xl border px-3.5 py-3"
            >
              <p className="text-ink text-[15px] font-medium">{b.label || 'Card batch'}</p>
              <p className="text-ink-3 mt-0.5 font-mono text-[11px]">
                {b.size} cards · {new Date(b.created_at).toLocaleDateString('en-GB')}
              </p>
            </Link>
          </li>
        ))}
        {(batches ?? []).length === 0 ? (
          <li className="text-ink-2 text-[14px]">No batches issued yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
