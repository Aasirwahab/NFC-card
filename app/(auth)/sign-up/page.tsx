import Link from 'next/link';
import { signUpAction } from '../actions';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <div className="border-line bg-surface shadow-card rounded-xl border p-6">
      <h1 className="font-display text-ink mb-1 text-2xl font-semibold tracking-tight">
        Create an account
      </h1>
      <p className="text-ink-2 mb-6 text-sm">Two minutes, then print some cards.</p>

      <AuthForm
        action={signUpAction}
        submitLabel="Create account"
        fields={[
          {
            name: 'fullName',
            label: 'Your name',
            type: 'text',
            autoComplete: 'name',
            required: true,
            hint: 'Prospects see this on the page their card opens.',
          },
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
            autoComplete: 'new-password',
            required: true,
            hint: 'At least 10 characters.',
          },
        ]}
      />

      <p className="text-ink-2 mt-6 text-center text-sm">
        Already have one?{' '}
        <Link href="/sign-in" className="text-accent font-medium underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
