import Link from 'next/link';
import { CreditCard, LayoutGrid, Settings, Tags } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { TimezoneSync } from '@/components/timezone-sync';
import { isStaffEmail } from '@/lib/auth/staff-check';
import { requireRep } from '@/lib/db/server';
import { env } from '@/lib/env';
import { signOutAction } from '../(auth)/actions';

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
    <div className="flex min-h-dvh flex-col">
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
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-5 pb-28">{children}</main>

      <nav className="border-line-soft bg-surface/95 fixed inset-x-0 bottom-0 border-t backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4 pb-[env(safe-area-inset-bottom,0px)]">
          <NavItem href="/dashboard" label="Today" icon={<LayoutGrid className="h-5 w-5" />} />
          <NavItem href="/events" label="Events" icon={<Tags className="h-5 w-5" />} />
          <NavItem href="/cards" label="Cards" icon={<CreditCard className="h-5 w-5" />} />
          <NavItem href="/settings" label="Setup" icon={<Settings className="h-5 w-5" />} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-ink-3 hover:text-accent flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
    >
      {icon}
      {label}
    </Link>
  );
}
