'use client';

import { CopyButton } from '@/components/copy-button';

/** A read-only value that selects itself on focus, with a Copy button beside it. */
export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="border-line bg-bg text-ink min-w-0 flex-1 rounded-lg border px-3 py-2.5 font-mono text-[13px]"
        aria-label={label}
      />
      <CopyButton text={value} />
    </div>
  );
}
