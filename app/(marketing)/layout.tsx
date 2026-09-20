import Link from 'next/link';
import { Wordmark } from '@/components/brand';

export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-soft border-b px-5 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/">
            <Wordmark />
          </Link>
          <Link
            href="/sign-in"
            className="text-ink-2 hover:text-ink text-sm font-medium underline underline-offset-2"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">{children}</main>

      <footer className="border-line-soft text-ink-3 border-t px-5 py-6 text-[13px]">
        <div className="mx-auto flex max-w-2xl flex-wrap gap-x-4 gap-y-1">
          <Link href="/how-it-works" className="hover:text-ink-2 underline underline-offset-2">
            How it works
          </Link>
          <Link href="/privacy" className="hover:text-ink-2 underline underline-offset-2">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
