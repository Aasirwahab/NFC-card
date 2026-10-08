import { z } from 'zod';

/**
 * The pipeline's inputs, as read by `enrichment_snapshot()` in one round trip and
 * checkpointed as the first step (§14.1). Every later step, and every retry,
 * works from this — never from a fresh read — so a mid-run edit cannot give
 * one step old details and the next step new ones.
 *
 * Parsed with Zod because it crosses a boundary: jsonb from the database is
 * whatever was last written to it (§21: one schema per boundary).
 */

const text = z.string().nullable().catch(null);

export const snapshotSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    status: z.string(),
    details_revision: z.number().int(),
    prospect_name: text,
    prospect_company: text,
    prospect_email: text,
    prospect_website: text.optional().catch(null),
    niche: text,
    problems: z.array(z.string()).catch([]),
    custom_problems: text,
    /** Shapes the tone; never quoted (§5, §23.1). The gate enforces the second half. */
    memorable_info: text,
    /** A short style request from the rep for this draft ("shorter", "warmer"). Style only. */
    pitch_guidance: text.optional().catch(null),
  }),
  rep: z
    .object({
      full_name: z.string(),
      title: text,
      /** Which spelling the pitch uses. */
      language: z.enum(['en-GB', 'en-US']).catch('en-GB'),
      /** The rep's standing pitch voice. Style, one of their own sentences, and words to avoid. */
      pitch_tone: z.enum(['warm', 'direct', 'formal']).catch('warm'),
      pitch_hook: text.optional().catch(null),
      pitch_avoid: text.optional().catch(null),
    })
    .nullable()
    .catch(null),
  business: z
    .object({
      company_name: z.string(),
      tagline: text,
      website: text,
      services: z.array(z.string()).catch([]),
      pricing: z.unknown().nullable().catch(null),
    })
    .nullable()
    .catch(null),
  knowledge: z.array(z.object({ topic: z.string(), content: z.string() })).catch([]),
  event: z.object({ name: z.string() }).nullable().catch(null),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
