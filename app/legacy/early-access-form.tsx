'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { EarlyAccessState } from '@/lib/schemas/early-access';
import { requestEarlyAccess } from './actions';
import { Icon } from './icons';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-coral" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Request early access'}
      {pending ? null : <Icon name="arrow" />}
    </button>
  );
}

export function EarlyAccessForm() {
  const [state, formAction] = useActionState<EarlyAccessState, FormData>(requestEarlyAccess, {});

  if (state.done) {
    return (
      <div className="thanks" role="status">
        <h3>Thank you.</h3>
        <p>
          We&rsquo;ve got your request. We read every one, and we&rsquo;ll be in touch about the
          founding group.
        </p>
      </div>
    );
  }

  return (
    <form
      className="apply"
      action={formAction}
      // Cards link to /?ref=card. Read at submit time so the page itself stays static.
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem('ref') as HTMLInputElement;
        field.value = new URLSearchParams(window.location.search).get('ref') ?? '';
      }}
    >
      <div className="two">
        <div>
          <label className="f" htmlFor="f-name">
            Your name
          </label>
          <input type="text" id="f-name" name="name" autoComplete="name" required maxLength={120} />
        </div>
        <div>
          <label className="f" htmlFor="f-email">
            Work email
          </label>
          <input
            type="email"
            id="f-email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </div>
      </div>
      <div>
        <label className="f" htmlFor="f-role">
          Your role and company
        </label>
        <input
          type="text"
          id="f-role"
          name="role"
          autoComplete="organization-title"
          maxLength={200}
        />
      </div>
      <div>
        <label className="f" htmlFor="f-event">
          Next event you&rsquo;re attending (optional)
        </label>
        <input type="text" id="f-event" name="nextEvent" maxLength={200} />
      </div>
      <input type="hidden" name="ref" />
      <input
        className="hp"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div className="consent">
        <input type="checkbox" id="f-consent" name="consent" required />
        <label htmlFor="f-consent">
          I&rsquo;m happy for INSIGNAR to use these details to contact me about early access.
        </label>
      </div>
      <Link className="privlink" href="/privacy">
        How we use your details
      </Link>
      <div>
        <Submit />
      </div>
      {state.error ? (
        <p className="msg" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
