'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, LayoutGrid, Settings, Tags } from 'lucide-react';

const tabs = [
  { href: '/dashboard', label: 'Today', icon: LayoutGrid },
  { href: '/events', label: 'Events', icon: Tags },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/settings', label: 'Setup', icon: Settings },
];

export function RepNavigation() {
  const pathname = usePathname();
  if (/^\/sessions\/[^/]+\/edit\/?$/.test(pathname)) return null;

  return (
    <nav
      id="rep-navigation"
      aria-label="Rep navigation"
      className="border-line-soft bg-surface/95 fixed inset-x-0 bottom-0 border-t backdrop-blur"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-4 pb-[env(safe-area-inset-bottom,0px)]">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}
            className="flex flex-col items-center gap-0.5 py-2.5"
          >
            <Icon aria-hidden="true" className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
