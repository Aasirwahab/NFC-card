import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * The wordmark: the INSIGNAR round mark beside the name in capitals. Typographic
 * on purpose, so it reads the same at header size on a phone.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-ink inline-flex items-center gap-2', className)}>
      <Image src="/brand/insignar-mark-black.png" alt="" width={24} height={24} priority />
      <span className="text-[17px] font-bold tracking-[0.14em]">INSIGNAR</span>
    </span>
  );
}

/**
 * The tap glyph printed on the card and shown on the rep view. A stylised wave
 * leaving a card edge — no phone, no robot, nothing that announces the AI (§16).
 */
export function TapMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('h-6 w-6', className)}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <rect x="2.5" y="5" width="10" height="14" rx="2" strokeLinejoin="round" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a9 9 0 0 1 0 12" opacity="0.55" />
    </svg>
  );
}
