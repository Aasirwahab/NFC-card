'use client';

/**
 * Sign out, and first clear capture drafts kept on this phone: they can hold
 * prospect details and private notes, and must not outlive the session.
 */
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={() => {
        // Tells an open capture form to stop saving drafts before the page goes.
        (window as { insignarClosing?: boolean }).insignarClosing = true;
        try {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith('insignar:draft:')) window.localStorage.removeItem(key);
          }
        } catch {
          /* storage unavailable: nothing to clear */
        }
      }}
    >
      <button
        type="submit"
        className="text-ink-3 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink-2 text-[13px] underline underline-offset-2"
      >
        Sign out
      </button>
    </form>
  );
}
