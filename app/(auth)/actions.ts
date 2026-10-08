'use server';

import { redirect } from 'next/navigation';
import { safeNextPath } from '@/lib/auth/safe-next';
import { isStaffEmail } from '@/lib/auth/staff-check';
import { createAuthClient } from '@/lib/db/server';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/db/service';
import { type AuthFormState, signInSchema, signUpSchema } from '@/lib/schemas/auth';

function safeNext(value: FormDataEntryValue | null): string {
  return safeNextPath(value);
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately identical for a wrong password and an unknown address: the
    // difference tells an attacker which emails have accounts.
    return { error: 'That email and password do not match an account.' };
  }

  // Staff land in the operator console unless they were sent somewhere specific
  // (the proxy sets `next` when it bounces a signed-out visitor).
  const requested = formData.get('next');
  const wentSomewhere = safeNextPath(requested, '') !== '';
  if (!wentSomewhere && isStaffEmail(data.user?.email, env.STAFF_EMAILS)) redirect('/ops');

  redirect(safeNext(requested));
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: error?.message ?? 'Could not create the account.' };
  }

  // The profile is written with the service role because sign-up may not return a
  // session at all when email confirmation is on, and the rep's name is needed on
  // the prospect page either way.
  const { error: profileError } = await serviceClient()
    .from('profiles')
    .upsert({ id: data.user.id, full_name: parsed.data.fullName }, { onConflict: 'id' });

  if (profileError) {
    return { error: 'Account created, but your profile could not be saved. Try signing in.' };
  }

  if (!data.session) {
    return { notice: 'Check your email to confirm the address, then sign in.' };
  }

  redirect('/dashboard');
}

export async function signOutAction() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
