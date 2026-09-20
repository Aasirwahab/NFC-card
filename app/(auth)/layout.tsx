import Link from 'next/link';
import { Wordmark } from '@/components/brand';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 pt-6">
        <Link href="/" className="inline-block">
          <Wordmark />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <footer className="text-ink-3 px-5 pb-8 text-center text-[13px]">
        <Link href="/privacy" className="hover:text-ink-2 underline underline-offset-2">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/how-it-works" className="hover:text-ink-2 underline underline-offset-2">
          How it works
        </Link>
      </footer>
    </div>
  );
}
