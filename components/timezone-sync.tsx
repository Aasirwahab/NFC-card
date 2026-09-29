'use client';

import { useEffect } from 'react';
import { apiSend } from '@/lib/http/client';

/** Tells the server this phone's time zone once per browser session. Renders nothing. */
export function TimezoneSync() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('insignar:tz')) return;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) return;
      window.sessionStorage.setItem('insignar:tz', '1');
      apiSend('/api/profile/timezone', 'POST', { timezone: zone }).catch(() => {});
    } catch {
      /* storage or Intl unavailable: the Setup page can still set it */
    }
  }, []);
  return null;
}
