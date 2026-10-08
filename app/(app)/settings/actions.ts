'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRep } from '@/lib/db/server';
import { parseBookingUrl } from '@/lib/booking/link';
import { serviceClient } from '@/lib/db/service';

/**
 * Business setup (spec §5.2, §6).
 *
 * Real niche knowledge enforced at business-profile setup is second on the
 * defensibility list: it prevents generic-sounding output, and a UX clone cannot
 * copy proprietary domain content.
 *
 * The knowledge base is a PLAIN TEXT BOX, deliberately. "Asking a salesperson to
 * hand-write a knowledge base in markdown will kill adoption before first use"
 * (§6). Auto-build from a website URL or a PDF is the first fast-follow after
 * v1 ships, not a launch blocker — hence the `source` column already carrying
 * 'url_import' and 'pdf_import' as valid values.
 */

export type SettingsState = { error?: string; saved?: boolean };

const blank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

/** An IANA zone name the runtime recognises, else UTC. Never trusts the client blindly. */
function knownTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  language: z.enum(['en-GB', 'en-US']).default('en-GB'),
  timezone: z
    .string()
    .trim()
    .max(64)
    .default('UTC')
    .transform((value) => knownTimezone(value || 'UTC')),
  title: blank(120),
  bio: blank(600),
  linkedin_url: blank(300),
  phone: blank(40),
  // The rep's Cal.com event, embedded on every prospect page (§19.1).
  booking_url: blank(300).refine(
    (v) => v === null || parseBookingUrl(v) !== null,
    'Paste your Cal.com link, e.g. https://cal.com/you/15min',
  ),
  // On the vCard a prospect saves from the page. Optional, and deliberately not
  // the sign-in address, which is not the rep's to publish by default.
  contact_email: blank(254).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'Enter a valid email, or leave it blank.',
  ),
});

const pitchVoiceSchema = z.object({
  pitch_tone: z.enum(['warm', 'direct', 'formal']).default('warm'),
  pitch_hook: blank(140),
  pitch_avoid: blank(200),
});

/** The rep's standing pitch voice: tone, one sentence of their own, and words to avoid. */
export async function savePitchVoiceAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rep = await requireRep();

  const parsed = pitchVoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Update, not upsert: a rep with no profile yet has nothing to attach a voice to.
  const { data, error } = await serviceClient()
    .from('profiles')
    .update(parsed.data)
    .eq('id', rep.userId)
    .select('id');

  if (error) return { error: 'Could not save your pitch voice.' };
  if (!data?.length) return { error: 'Save your name first, then set your voice.' };

  revalidatePath('/settings');
  return { saved: true };
}

const businessSchema = z.object({
  company_name: z.string().trim().min(1, 'Enter your company name.').max(160),
  tagline: blank(200),
  website: blank(300),
  /** One service per line. A list, entered the way people actually type lists. */
  services: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the form and try again.';
}

export async function saveProfileAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rep = await requireRep();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { error } = await serviceClient()
    .from('profiles')
    .upsert({ id: rep.userId, ...parsed.data }, { onConflict: 'id' });

  if (error) return { error: 'Could not save your profile.' };

  revalidatePath('/settings');
  return { saved: true };
}

export async function saveBusinessAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rep = await requireRep();

  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { error } = await serviceClient()
    .from('business_profiles')
    .upsert({ user_id: rep.userId, ...parsed.data }, { onConflict: 'user_id' });

  if (error) return { error: 'Could not save your business profile.' };

  revalidatePath('/settings');
  return { saved: true };
}

const knowledgeSchema = z.object({
  topic: z.enum(['services', 'pricing', 'faq', 'about', 'niche']),
  content: z.string().trim().max(20_000),
});

export async function saveKnowledgeAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rep = await requireRep();

  const parsed = knowledgeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const db = serviceClient();
  const { topic, content } = parsed.data;

  // One entry per topic in v1. The table allows several per topic for the
  // import fast-follow, so this replaces rather than accumulating.
  const { data: existing } = await db
    .from('knowledge_base')
    .select('id')
    .eq('user_id', rep.userId)
    .eq('topic', topic)
    .eq('source', 'manual')
    .maybeSingle();

  const { error } = existing
    ? await db.from('knowledge_base').update({ content }).eq('id', existing.id)
    : await db.from('knowledge_base').insert({ user_id: rep.userId, topic, content });

  if (error) return { error: 'Could not save that.' };

  revalidatePath('/settings');
  return { saved: true };
}

const playbookSchema = z.object({
  id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  problem: z.string().trim().min(2, 'Name the problem.').max(200),
  why: blank(300),
  check1: blank(200),
  check2: blank(200),
  check3: blank(200),
  resource_url: blank(300).refine(
    (v) => v === null || (v.startsWith('https://') && URL.canParse(v)),
    'The link must start with https://',
  ),
});

/** One playbook entry: what the rep tells a client about a problem. Shown to the prospect exactly as written. */
export async function savePlaybookAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rep = await requireRep();
  const parsed = playbookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { id, problem, why, resource_url } = parsed.data;
  const checks = [parsed.data.check1, parsed.data.check2, parsed.data.check3].filter(
    (c): c is string => Boolean(c),
  );
  const row = { user_id: rep.userId, problem, why, checks, resource_url };

  const db = serviceClient();
  const { data: mine } = await db
    .from('playbook_entries')
    .select('id, problem')
    .eq('user_id', rep.userId);
  const sameProblem = (mine ?? []).find(
    (e) => e.problem.trim().toLowerCase() === problem.toLowerCase(),
  );

  // Editing an entry, or saving a problem that already has one, updates it.
  const targetId = id ?? sameProblem?.id;
  if (id && sameProblem && sameProblem.id !== id) {
    return { error: 'You already have an entry for that problem.' };
  }

  const { error } = targetId
    ? await db.from('playbook_entries').update(row).eq('id', targetId).eq('user_id', rep.userId)
    : await db.from('playbook_entries').insert(row);
  if (error) return { error: 'Could not save that.' };

  revalidatePath('/settings');
  return { saved: true };
}

export async function deletePlaybookAction(formData: FormData): Promise<void> {
  const rep = await requireRep();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await serviceClient()
    .from('playbook_entries')
    .delete()
    .eq('id', id.data)
    .eq('user_id', rep.userId);
  revalidatePath('/settings');
}
