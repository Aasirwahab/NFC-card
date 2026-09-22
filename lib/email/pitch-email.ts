import type { Email } from './tap-alert';

/**
 * "Email me this page" (spec §19.2): the prospect's own copy of their page.
 *
 * PURE. It carries what the page shows — the greeting, the pitch, a link back —
 * and nothing more. The private note is not an input. No tracking pixel: the
 * prospect asked for this, and it should read like it.
 */
export type PitchEmailInput = {
  prospectName: string | null;
  repFullName: string;
  repTitle: string | null;
  businessName: string | null;
  pitch: string;
  /** The prospect's own page, so they can book or ask from it later. */
  pageUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function pitchEmail(input: PitchEmailInput): Email {
  const repFirst = input.repFullName.trim().split(/\s+/)[0] || input.repFullName;
  const first = input.prospectName?.trim().split(/\s+/)[0] || null;
  const signature = [input.repFullName, input.repTitle, input.businessName]
    .filter(Boolean)
    .join(' · ');
  const paragraphs = input.pitch
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const text = [
    first ? `Hi ${first},` : 'Hi,',
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    `Your page, to book a time or ask a question: ${input.pageUrl}`,
    '',
    signature,
  ].join('\n');

  const html = [
    `<p>${escapeHtml(first ? `Hi ${first},` : 'Hi,')}</p>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><a href="${escapeHtml(input.pageUrl)}">Book a time or ask a question</a></p>`,
    `<p style="color:#6b7977">${escapeHtml(signature)}</p>`,
  ].join('\n');

  return { subject: `Your note from ${repFirst}`, text, html };
}
