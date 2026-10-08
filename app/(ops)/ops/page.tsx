import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { listReps, type OpsRep } from '@/lib/ops/data';
import { CodeSearch } from './code-search';

export const metadata = { title: 'Operator console' };

function todo(rep: OpsRep): string[] {
  return [
    rep.stock.needsWriting > 0 ? `${rep.stock.needsWriting} to write` : '',
    rep.stock.needsVerifying > 0 ? `${rep.stock.needsVerifying} to check` : '',
    rep.openOrders > 0 ? `${rep.openOrders} open order${rep.openOrders > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
}

export default async function OpsHome({ searchParams }: PageProps<'/ops'>) {
  await requireStaff();
  const { error } = await searchParams;
  const reps = await listReps();

  return (
    <div>
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Reps and stock</h1>

      {error ? (
        <p className="text-crit mt-3 text-[13px]" role="alert">
          {error === 'user_not_found' ? 'That user does not exist.' : 'Check the batch details.'}
        </p>
      ) : null}

      <div className="mt-4">
        <CodeSearch />
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {reps.map((rep) => (
          <li key={rep.id}>
            <Link
              href={`/ops/users/${rep.id}`}
              className="border-line bg-surface shadow-card block rounded-xl border px-4 py-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate text-[15px] font-semibold">
                    {rep.name ?? 'No name yet'}
                  </p>
                  <p className="text-ink-3 truncate text-[12px]">{rep.email}</p>
                </div>
                {rep.lowStock ? (
                  <span className="bg-crit/10 text-crit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    Low stock
                  </span>
                ) : null}
              </div>
              <p className="text-ink-2 mt-2 font-mono text-[12px]">
                {rep.stock.inStock} in stock · {rep.stock.handedOut} out · {rep.stock.lost} lost
              </p>
              {todo(rep).length > 0 ? (
                <p className="text-ink-3 mt-1 text-[12px]">{todo(rep).join(' · ')}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
