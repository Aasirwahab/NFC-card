/**
 * What counts as a tap (spec §10.4).
 *
 * "Only a prospect-view render sets first_viewed_at." Two further guards live
 * here: known bot and link-preview user agents do not count, and a second view
 * from the same IP within 60 seconds does not increment the counter.
 *
 * Why link previews specifically: if a prospect pastes the URL into Slack,
 * WhatsApp or Outlook, the platform fetches the page to build a preview card.
 * Counting that as a tap would mark the session as viewed when no human has
 * looked at it — and silently suppress the 24-hour no-tap follow-up for someone
 * who never actually saw the page.
 *
 * PURE, so it is unit-testable. The spec is explicit that the rep-self-tap
 * exclusion must be a test rather than a comment; the same applies here.
 */

/** Substrings that identify a crawler or an unfurler. Matched case-insensitively. */
const NON_HUMAN_AGENTS = [
  // Generic crawler vocabulary.
  'bot',
  'crawler',
  'spider',
  'scraper',
  'headlesschrome',
  'phantomjs',
  'python-requests',
  'curl/',
  'wget',
  'go-http-client',
  'java/',
  'okhttp',
  'axios',
  'node-fetch',
  'undici',
  // Link unfurlers — the ones that actually matter for a URL pasted into a chat.
  'slackbot',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'skypeuripreview',
  'outlook',
  'microsoftpreview',
  'google-inspectiontool',
  // Named previewers, not the bare word: a loose substring match silently
  // un-counts real people, which sends a "you haven't looked" follow-up to
  // someone who did.
  'google web preview',
  'bingpreview',
  'embedly',
  'redditbot',
  'applebot',
  'pinterest',
  'vkshare',
  'w3c_validator',
  // Uptime and security scanners.
  'pingdom',
  'uptimerobot',
  'statuscake',
  'datadog',
  'newrelic',
  'lighthouse',
  'chrome-lighthouse',
  'pagespeed',
  'ahrefs',
  'semrush',
  'mj12bot',
  'dotbot',
];

/**
 * True when the user agent is a crawler, unfurler or monitor rather than a person.
 * An absent user agent counts as non-human: every real mobile browser sends one.
 */
export function isNonHumanAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;

  // Real phone models that contain a needle. "CUBOT" is an Android brand, and
  // its model name appears in every UA its phones send.
  const agent = userAgent.toLowerCase().replaceAll('cubot', '');
  return NON_HUMAN_AGENTS.some((needle) => agent.includes(needle));
}

/** The window within which a repeat view from one IP is the same look (§10.4). */
export const VIEW_DEDUPE_SECONDS = 60;

/**
 * The key a repeat view is deduplicated by. Scoped to the session so two
 * prospects behind one corporate NAT do not suppress each other's first view.
 */
export function viewDedupeKey(sessionId: string, ip: string): string {
  return `view:${sessionId}:${ip}`;
}
