import { z } from 'zod';

/** Blank optional fields become null rather than empty strings. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null);

/**
 * The early access form on the home page. The database repeats every length
 * limit (20261001090000_early_access_requests.sql); this is the one people see.
 */
export const earlyAccessSchema = z.object({
  name: z.string().trim().min(1, 'Please add your name.').max(120, 'That name is too long.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'That email address is too long.')
    .email('Please enter a valid email address.'),
  role: optionalText(200, 'Keep your role and company under 200 characters.'),
  nextEvent: optionalText(200, 'Keep the event under 200 characters.'),
  consent: z.literal('on', { message: 'Please tick the box so we can contact you.' }),
  // Cards link to /?ref=card. Anything that is not a short plain token is dropped
  // rather than refused: a bad ref must never cost us an application.
  ref: z
    .string()
    .nullable()
    .default(null)
    .transform((value) => (value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null)),
});

export type EarlyAccessInput = z.infer<typeof earlyAccessSchema>;

export type EarlyAccessState = {
  error?: string;
  done?: boolean;
};
