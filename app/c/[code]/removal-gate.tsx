'use client';

import { createContext, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';

/** Called by "Remove my details" once the server has deleted the record. */
export const RemovedContext = createContext<() => void>(() => {});

/**
 * Wraps a whole prospect page. When the prospect removes their details the page is replaced
 * at once by a calm closing state: no note, no chat, nothing that still looks like theirs.
 */
export function RemovalGate({ children }: { children: React.ReactNode }) {
  const [removed, setRemoved] = useState(false);
  if (removed)
    return (
      <div className={`${styles.surface} ${styles.publicPage}`}>
        <main className="flex-1">
          <h1 className={`${styles.holdLine} ${styles.holdLineTop}`} role="status">
            Your details have been removed.
          </h1>
          <p className={styles.holdQuiet}>
            Nothing about you is kept on this page any more. You can close it.
          </p>
        </main>
        <footer className={styles.footer}>
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
        </footer>
      </div>
    );
  return (
    <RemovedContext.Provider value={() => setRemoved(true)}>{children}</RemovedContext.Provider>
  );
}
