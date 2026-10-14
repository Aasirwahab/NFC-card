'use client';

import { createContext, useEffect, useRef, useState } from 'react';
import styles from '@/app/ui-slice.module.css';

export const ChatOpenContext = createContext(false);

/** Observe the existing chat without changing its state, handlers or internals. */
export function ProspectShell({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const chat = page.querySelector(`.${styles.chatRegion}`);
    const chatObserver = new MutationObserver(() => {
      setChatOpen(Boolean(chat?.querySelector('[role="dialog"]')));
    });
    if (chat) chatObserver.observe(chat, { childList: true });

    const scrollStyle = document.documentElement.style;
    const previousHeight = scrollStyle.getPropertyValue('--book-bar-height');
    function updateScrollHeight() {
      const height = getComputedStyle(page!).getPropertyValue('--book-bar-height');
      if (height !== scrollStyle.getPropertyValue('--book-bar-height')) {
        scrollStyle.setProperty('--book-bar-height', height);
      }
    }
    const heightObserver = new MutationObserver(updateScrollHeight);
    heightObserver.observe(page, { attributes: true, attributeFilter: ['style'] });
    updateScrollHeight();

    const viewport = window.visualViewport;
    function updateViewport() {
      page!.style.setProperty(
        '--visual-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      page!.style.setProperty('--visual-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    }
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport);
    return () => {
      chatObserver.disconnect();
      heightObserver.disconnect();
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      if (previousHeight) scrollStyle.setProperty('--book-bar-height', previousHeight);
      else scrollStyle.removeProperty('--book-bar-height');
    };
  }, []);

  return (
    <ChatOpenContext.Provider value={chatOpen}>
      <div ref={root} className={className} data-chat-open={chatOpen}>
        {children}
      </div>
    </ChatOpenContext.Provider>
  );
}
