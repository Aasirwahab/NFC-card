import { z } from 'zod';
import { CODE_ALPHABET, CODE_LENGTH } from '@/lib/domain/codes';
import { domainFromWebsite } from '@/lib/enrich/domain';

/**
 * The boundary schemas for capture (spec §15.4).
 *
 * One schema per boundary, shared by the client, the server and the tests. These
 * are the shapes the offline outbox will replay in Phase 6, so the contract has
 * to be right before the outbox exists.
 */

const code = z
  .string()
  .trim()
  .toUpperCase()
  .length(CODE_LENGTH)
  .regex(new RegExp(`^[${CODE_ALPHABET}]+$`), 'not a valid card code');

/**
 * POST /api/sessions/register
 *
 * The session id is generated ON THE DEVICE. That is what makes an offline retry
 * safe: register_card returns the existing row when that id is already present,
 * so a duplicated outbox flush is harmless (§15.4, §17.1).
 */
export const registerRequestSchema = z.object({
  session_id: z.string().uuid(),
  code,
  event_id: z.string().uuid(),
  registered_by: z.string().trim().min(1).max(120),
  /** The optional two-second anchor taken at the table (§10.3). */
  first_name: z.string().trim().max(80).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Empty strings are what an untouched form field sends; treat them as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null);

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .refine((value) => value === null || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address.',
  });

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .refine((value) => value === null || z.string().url().safeParse(value).success, {
    message: 'Enter a full URL, starting with https://',
  });

/**
 * The prospect's website as a rep types it: "abc.co.uk", "www.abc.co.uk" or a
 * full URL. Stored as the bare host, which is what the pipeline fetches.
 */
const optionalWebsite = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .transform((value) => (value === null ? null : (domainFromWebsite(value) ?? value)))
  .refine((value) => value === null || domainFromWebsite(value) === value, {
    message: 'Enter their website, like abcservices.co.uk',
  });

/**
 * PATCH /api/sessions/[id] — phase two of capture (§10.2).
 *
 * Every field is optional because registration happens before the prospect
 * exists, and because a session can be reopened and edited at any time, before
 * or after the prospect taps. There is no "locked after save".
 */
export const sessionDetailsSchema = z.object({
  prospect_name: optionalText(120),
  prospect_company: optionalText(160),
  prospect_email: optionalEmail,
  prospect_phone: optionalText(40),
  /** Beats the email domain and any guess when deciding what to research. */
  prospect_website: optionalWebsite,
  linkedin_url: optionalUrl,
  niche: optionalText(80),
  /** Quick-select problems from the event's niche configuration (§3). */
  problems: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  custom_problems: optionalText(1000),
  /**
   * The free-text note — the most valuable field in the product and the one most
   * likely to cause a problem (§23.1). It is capped, never rendered to a
   * prospect, never quoted by the chatbot, and excluded from CSV export by
   * default. The UI carries the "business-relevant details only" hint.
   */
  memorable_info: optionalText(500),
});

export type SessionDetails = z.infer<typeof sessionDetailsSchema>;

/**
 * True when the rep has captured no way to reach this prospect if they never
 * tap. Drives the non-blocking save-time nudge, and the dashboard's no-channel
 * grouping (§19.3). The gap closes from both ends.
 */
export function hasNoFollowUpChannel(details: {
  linkedin_url: string | null;
  prospect_email: string | null;
}): boolean {
  return !details.linkedin_url && !details.prospect_email;
}

/** POST /api/cards/batch */
export const cardBatchSchema = z.object({
  size: z.number().int().min(1).max(500),
  label: z.string().trim().max(120).optional(),
});

/** POST /api/events */
export const eventSchema = z.object({
  name: z.string().trim().min(1).max(160),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  location: z.string().trim().max(160).optional(),
  niches: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        problems: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
      }),
    )
    .max(20)
    .default([]),
});

export type EventInput = z.infer<typeof eventSchema>;

/** PUT /api/sessions/[id]/pitch — the rep's own edit of the pitch (§14.5). */
export const repPitchSchema = z.object({
  text: z.string().trim().min(1, 'The pitch cannot be empty.').max(4000),
});

/** POST /api/sessions/[id]/pitch/rating — thumbs up or down on the model's pitch. */
export const pitchRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().trim().max(500).optional(),
});

/** POST /api/sessions/[id]/website — the rep confirms the suggested site. */
export const confirmWebsiteSchema = z.object({
  website: z
    .string()
    .trim()
    .transform((value) => domainFromWebsite(value))
    .refine((value): value is string => value !== null, { message: 'Not a valid website.' }),
});
