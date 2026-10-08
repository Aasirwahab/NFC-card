import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { printedCode } from '@/lib/cards/issue-batch';
import { tagUrl } from '@/lib/cards/urls';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { cardProgress } from '@/lib/ops/stock';

export const metadata = { title: 'Card · Operator console' };

export default async function OpsCard({ params }: PageProps<'/ops/cards/[code]'>) {
  await requireStaff();
  const code = normaliseCode((await params).code);
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
    </div>
  );
}
