'use client';

import { Button } from '@/components/ui/button';

/** A submit button that asks first. For actions that are awkward to undo. */
export function ConfirmButton({
  message,
  children,
}: {
  message: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="secondary"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
