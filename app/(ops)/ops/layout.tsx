import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { requireStaff } from '@/lib/auth/staff';

/**
 * The operator console. Staff only: anyone else gets a 404 from requireStaff(),
 * and every action and API route under here checks again. Never linked from the
 * rep app and never indexed.
 */
export const metadata = { title: 'Operator console', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children }: LayoutProps<'/ops'>) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-soft bg-surface sticky top-0 z-10 border-b px-5 py-3 print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/ops" className="flex items-center gap-2">
            <Wordmark />
            <span className="bg-ink text-surface rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase">
              Ops
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-ink-3 text-[12px] underline underline-offset-2">
              Rep app
            </Link>
            <span className="text-ink-3 hidden truncate text-[12px] sm:inline">{staff.email}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-5">{children}</main>
    </div>
  );
}
