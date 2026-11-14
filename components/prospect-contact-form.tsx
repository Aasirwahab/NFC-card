'use client';

import Link from 'next/link';
import { contactFormFields, contactFormText, type ContactForm } from '@/lib/domain/contact-form';
import styles from '@/app/ui-slice.module.css';

/** WCAG 1.3.5: let phones autofill what they know. The email-or-mobile field has no single token. */
const AUTOFILL: Record<string, string> = {
  name: 'name',
  company: 'organization',
  jobTitle: 'organization-title',
};

/** Shared field rendering for the holding page and Setup's inert live preview. */
export function ProspectContactForm({
  config,
  first,
  values,
  onChange,
  onFocus,
  onBlur,
  busy = false,
  readOnly = false,
  preview = false,
}: {
  config: ContactForm;
  first: string;
  values: Record<string, string>;
  onChange?: (key: string, value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  busy?: boolean;
  readOnly?: boolean;
  preview?: boolean;
}) {
  if (!config.enabled) return null;
  const prefix = preview ? 'preview' : 'prospect';
  return (
    <>
      <h2 className={`${styles.holdLabel} wrap-anywhere`}>
        {contactFormText(config.title, first)}
      </h2>
      {config.intro ? (
        <p id={`${prefix}-contact-help`} className={`${styles.holdHint} wrap-anywhere`}>
          {contactFormText(config.intro, first)}
        </p>
      ) : null}
      <fieldset disabled={preview || busy} className="w-full min-w-0 border-0 p-0">
        <legend className="sr-only">Your details</legend>
        {contactFormFields(config, first).map((field) => {
          const label = `${field.label}${field.required ? '' : ' (optional)'}`;
          const id = `${prefix}-${field.key}`;
          const shared = { name: field.key, onFocus, onBlur, className: styles.holdInput };
          if (field.type === 'choice')
            return (
              <fieldset key={field.key} disabled={readOnly} className="mt-3 min-w-0">
                <legend className={`${styles.holdLabel} wrap-anywhere`}>{label}</legend>
                <div className={styles.chips}>
                  {field.options.map((option, index) => (
                    <label
                      key={index}
                      className={`${styles.chip} relative flex min-h-11 cursor-pointer items-center gap-2`}
                    >
                      <input
                        type="radio"
                        name={field.key}
                        value={option}
                        checked={values[field.key] === option}
                        required={field.required}
                        onChange={() => onChange?.(field.key, option)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        className="accent-accent h-4 w-4 shrink-0"
                        id={`${id}-${index}`}
                      />
                      <span className="min-w-0">{contactFormText(option, first)}</span>
                    </label>
                  ))}
                </div>
                {!field.required && values[field.key] && !preview && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => onChange?.(field.key, '')}
                    aria-label={`Clear answer: ${field.label}`}
                    className={styles.holdLink}
                  >
                    Clear answer
                  </button>
                ) : null}
              </fieldset>
            );
          return (
            <div key={field.key} className="mt-3">
              <label htmlFor={id} className={`${styles.holdLabel} wrap-anywhere`}>
                {label}
              </label>
              {field.type === 'message' ? (
                <textarea
                  {...shared}
                  id={id}
                  rows={2}
                  maxLength={300}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => onChange?.(field.key, e.target.value)}
                  className={`${styles.holdInput} ${styles.holdTextarea}`}
                />
              ) : (
                <input
                  {...shared}
                  id={id}
                  type="text"
                  autoComplete={preview ? 'off' : (AUTOFILL[field.key] ?? 'off')}
                  autoCapitalize={field.type === 'contact' ? 'none' : undefined}
                  spellCheck={field.type === 'contact' ? false : undefined}
                  maxLength={field.type === 'contact' ? 254 : 300}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  readOnly={readOnly}
                  aria-describedby={
                    field.type === 'contact'
                      ? `${config.intro ? `${prefix}-contact-help ` : ''}${prefix}-consent`
                      : undefined
                  }
                  onChange={(e) => onChange?.(field.key, e.target.value)}
                />
              )}
            </div>
          );
        })}
        <p id={`${prefix}-consent`} className={`${styles.holdHint} wrap-anywhere`}>
          {first} will use this only to get back to you. You can remove it any time.{' '}
          {preview ? <span>Privacy</span> : <Link href="/privacy">Privacy</Link>}
        </p>
        {!readOnly ? (
          <button
            type={preview ? 'button' : 'submit'}
            disabled={busy || preview}
            className={styles.holdSubmit}
          >
            {busy ? 'Saving…' : contactFormText(config.button, first)}
          </button>
        ) : null}
      </fieldset>
    </>
  );
}
