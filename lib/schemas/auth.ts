import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z.object({
  fullName: z.string().min(2, 'Enter your name as a prospect would recognise it.'),
  email: z.string().email('Enter a valid email address.'),
  // Supabase enforces its own minimum; this is the one reps see first.
  password: z.string().min(10, 'Use at least 10 characters.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** What every auth action returns to its form. */
export type AuthFormState = {
  error?: string;
  notice?: string;
};
