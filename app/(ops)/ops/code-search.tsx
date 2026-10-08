'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';

export function CodeSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);

  function go(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(value);
    if (!isValidCode(code)) return setBad(true);
    router.push(`/ops/cards/${code}`);
  }

  return (
    <form onSubmit={go} className="flex gap-2" noValidate>
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
        placeholder="Find a card: K7M3-PQ2X"
        autoComplete="off"
        autoCapitalize="characters"
        className="font-mono uppercase"
        aria-label="Card code"
        aria-invalid={bad}
      />
      <Button type="submit" variant="secondary" className="shrink-0">
        Find
      </Button>
    </form>
  );
}
