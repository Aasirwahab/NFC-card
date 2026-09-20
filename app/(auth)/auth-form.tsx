'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { AuthFormState } from '@/lib/schemas/auth';

type FieldSpec = {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="block" disabled={pending}>
      {pending ? 'One moment…' : label}
    </Button>
  );
}

/**
 * Both auth forms are the same shape, so they share one component. The action is
 * a Server Action, which means the password is never held in client state and the
 * form still works before hydration.
 */
export function AuthForm({
  action,
  fields,
  submitLabel,
  hiddenNext,
}: {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: FieldSpec[];
  submitLabel: string;
  hiddenNext?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hiddenNext ? <input type="hidden" name="next" value={hiddenNext} /> : null}

      {fields.map((field) => (
        <Field key={field.name} label={field.label} hint={field.hint} htmlFor={field.name}>
          <Input
            id={field.name}
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            required={field.required}
          />
        </Field>
      ))}

      {state.error ? (
        <p className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p className="bg-ok-bg text-ok rounded-lg px-3 py-2.5 text-sm font-medium" role="status">
          {state.notice}
        </p>
      ) : null}

      <Submit label={submitLabel} />
    </form>
  );
}
