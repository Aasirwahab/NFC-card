import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { RepNavigation } from '@/components/rep-navigation';
import { Wordmark } from '@/components/brand';
import { TimezoneSync } from '@/components/timezone-sync';
import { isStaffEmail } from '@/lib/auth/staff-check';
import { requireRep } from '@/lib/db/server';
import { env } from '@/lib/env';
import { signOutAction } from '../(auth)/actions';
import { SignOutButton } from '@/components/sign-out-button';

/**
 * The authenticated rep app.
 *
 * Phone-first: this is used standing up, at a loud venue, one-handed. The
 * navigation sits at the bottom where a thumb reaches, and the layout never
 * assumes a desktop.
 *
 * The proxy already redirects an unauthenticated visitor here, but this calls
 * requireRep() as well — the proxy is an optimistic convenience, not the
 * authorisation boundary (§22.6).
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const rep = await requireRep();
  const isStaff = isStaffEmail(rep.email, env.STAFF_EMAILS);

  return (
    <div className={`${styles.appShell} rep-app flex min-h-dvh flex-col`}>
      <TimezoneSync />
      <header className="border-line-soft bg-surface sticky top-0 z-10 border-b px-5 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/dashboard">
            <Wordmark />
          </Link>
          {isStaff ? (
            <Link
              href="/ops"
              className="bg-ink text-surface rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase"
            >
              Operator console
            </Link>
          ) : null}
          <SignOutButton action={signOutAction} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-5 pb-28">{children}</main>

      <RepNavigation />
    </div>
  );
}
