'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Copies text to the clipboard. Falls back to a selectable field when the browser refuses. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }

  return (
    <Button type="button" onClick={copy} className="shrink-0">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press and hold the link' : label}
    </Button>
  );
}
