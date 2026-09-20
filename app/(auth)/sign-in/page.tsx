import Link from 'next/link';
import { signInAction } from '../actions';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { next } = await searchParams;

  return (
    <div className="border-line bg-surface shadow-card rounded-xl border p-6">
      <h1 className="font-display text-ink mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-ink-2 mb-6 text-sm">Your cards are waiting.</p>

      <AuthForm
        action={signInAction}
        submitLabel="Sign in"
        hiddenNext={typeof next === 'string' ? next : undefined}
        fields={[
          {
            name: 'email',
            label: 'Email',
            type: 'email',
            autoComplete: 'email',
            required: true,
          },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            autoComplete: 'current-password',
            required: true,
          },
        ]}
      />

      <p className="text-ink-2 mt-6 text-center text-sm">
        No account?{' '}
        <Link href="/sign-up" className="text-accent font-medium underline underline-offset-2">
          Create one
        </Link>
      </p>
    </div>
  );
}
