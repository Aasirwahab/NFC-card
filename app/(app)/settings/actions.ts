'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRep } from '@/lib/db/server';
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

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  title: blank(120),
  bio: blank(600),
  photo_url: blank(500),
  linkedin_url: blank(300),
  phone: blank(40),
});

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
