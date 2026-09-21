/**
 * HTML to plain text, for a page fetched from a prospect's company website.
 *
 * The page is HOSTILE INPUT (§22.4): it is reduced to text here, capped, and
 * then only ever handed to the research model inside a delimited block marked as
 * data. It is never evaluated and never rendered. So this does not need to be a
 * faithful HTML parser — it needs to never execute anything and to keep the
 * words a reader would see.
 *
 * PURE. No DOM, no dependencies.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  pound: '£',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      // Refuse control characters and out-of-range code points outright.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ' ';
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function collapse(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export type PageText = {
  title: string | null;
  description: string | null;
  text: string;
};

/** @param maxChars  cap on the body text; the title and description are capped separately */
export function htmlToText(html: string, maxChars = 6_000): PageText {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1];

  const BLOCK = '\u2029'; // a paragraph separator no web page puts in its text

  const body = html
    // Everything that is code, styling or not shown to a reader goes first.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|object|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    // Block-level boundaries are marked, so words either side do not fuse.
    .replace(
      /<\/?(p|div|section|article|li|ul|ol|h[1-6]|br|tr|td|th|header|footer|nav)\b[^>]*>/gi,
      BLOCK,
    )
    .replace(/<[^>]+>/g, ' ');

  // Each block becomes a sentence. A full stop is added only where one is
  // missing and something follows, so no stray punctuation lands in the text —
  // which matters, because research facts must quote this text verbatim.
  const segments = decodeEntities(body).split(BLOCK).map(collapse).filter(Boolean);

  const cleaned = segments
    .map((segment, i) =>
      i < segments.length - 1 && !/[.!?:;,]$/.test(segment) ? `${segment}.` : segment,
    )
    .join(' ');

  return {
    title: title ? collapse(decodeEntities(title)).slice(0, 200) || null : null,
    description: description ? collapse(decodeEntities(description)).slice(0, 400) || null : null,
    text: cleaned.slice(0, maxChars),
  };
}
