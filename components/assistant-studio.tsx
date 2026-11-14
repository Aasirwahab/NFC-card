'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { BLOCKED_TOPIC_PRESETS, blockedTopicsSchema } from '@/lib/chat/settings';
import { ApiError, apiSend } from '@/lib/http/client';

export function AssistantStudio({
  blockedTopics,
  suggestions,
}: {
  blockedTopics: string[];
  suggestions: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ error?: string; saved?: boolean }>({});
  const [customTopics, setCustomTopics] = useState(() => [
    ...blockedTopics.filter(
      (topic) => !BLOCKED_TOPIC_PRESETS.some((preset) => preset.value === topic),
    ),
  ]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ reply: string; sourceLine?: string | null } | null>(null);
  const question = useRef<HTMLTextAreaElement>(null);

  async function save(formData: FormData) {
    setSaveStatus({});
    const parsed = blockedTopicsSchema.safeParse([
      ...formData.getAll('preset'),
      ...customTopics.map((topic) => topic.trim()).filter(Boolean),
    ]);
    if (!parsed.success) {
      setSaveStatus({
        error: parsed.error.issues[0]?.message || 'Check your topics and try again.',
      });
      return;
    }
    setSaving(true);
    try {
      await apiSend('/api/assistant/settings', 'POST', { blockedTopics: parsed.data });
      setSaveStatus({ saved: true });
      router.refresh();
    } catch (error) {
      setSaveStatus({
        error:
          error instanceof ApiError && error.status === 429
            ? 'A few too many saves. Wait a little and try again.'
            : 'Could not save your topics. Save your name in Setup first, then try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function tryQuestion(formData: FormData) {
    const message = String(formData.get('question') ?? '').trim();
    if (!message) return;
    setTesting(true);
    setTestError(null);
    setAnswer(null);
    try {
      setAnswer(await apiSend('/api/chat', 'POST', { test: true, message }));
    } catch (error) {
      setTestError(
        error instanceof ApiError && error.status === 429
          ? 'You have tried 30 questions. Wait a little before trying another.'
          : 'Could not try your assistant. Check your saved details and try again.',
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <section
      className="border-line bg-surface shadow-card min-w-0 rounded-xl border p-4"
      aria-labelledby="assistant-studio-heading"
    >
      <h2
        id="assistant-studio-heading"
        className="font-display text-ink font-semibold tracking-tight"
      >
        Your assistant
      </h2>
      <form action={save} className="mt-4 flex flex-col gap-4">
        <fieldset disabled={saving}>
          <legend className="text-ink text-sm font-medium">
            Questions your assistant should pass to you
          </legend>
          <p className="text-ink-2 mt-1 text-[13px] leading-snug">
            It will ask the contact to speak to you personally about these topics.
          </p>
          <div className="mt-3 flex flex-col">
            {BLOCKED_TOPIC_PRESETS.map((preset) => (
              <label
                key={preset.value}
                className="text-ink-2 flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="preset"
                  value={preset.value}
                  defaultChecked={blockedTopics.includes(preset.value)}
                  className="accent-accent h-5 w-5 shrink-0"
                />
                {preset.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {customTopics.map((topic, index) => (
              <div key={index} className="flex min-w-0 items-end gap-2">
                <Field
                  label={`Custom topic ${index + 1}`}
                  htmlFor={`assistant-custom-${index}`}
                  className="min-w-0 flex-1"
                >
                  <Input
                    id={`assistant-custom-${index}`}
                    value={topic}
                    maxLength={80}
                    onChange={(event) =>
                      setCustomTopics((current) =>
                        current.map((value, position) =>
                          position === index ? event.target.value : value,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove custom topic ${index + 1}`}
                  onClick={() =>
                    setCustomTopics((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {customTopics.length < 5 ? (
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                onClick={() => setCustomTopics((current) => [...current, ''])}
              >
                Add a custom topic
              </Button>
            ) : null}
          </div>
        </fieldset>
        {saveStatus.error ? (
          <p role="alert" className="text-crit text-sm">
            {saveStatus.error}
          </p>
        ) : null}
        {saveStatus.saved ? (
          <p role="status" className="text-ok text-sm">
            Saved.
          </p>
        ) : null}
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save topics'}
        </Button>
      </form>

      <div className="border-line-soft mt-6 border-t pt-5">
        <h3 className="font-display text-ink font-semibold">Try your assistant</h3>
        <p className="text-ink-2 mt-1 text-[13px] leading-snug">
          Ask as a prospect using your saved knowledge, voice and topics. Tests stay out of your
          contacts’ chat history.
        </p>
        <ul className="mt-3 flex flex-col gap-1">
          {suggestions.map((suggestion) => (
            <li key={suggestion} className="min-w-0">
              <button
                type="button"
                disabled={testing}
                className="text-accent min-h-11 w-full cursor-pointer py-2 text-left text-sm wrap-anywhere disabled:opacity-50"
                onClick={() => {
                  if (question.current) {
                    question.current.value = suggestion;
                    question.current.focus();
                  }
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
        <form action={tryQuestion} className="mt-3 flex flex-col gap-3">
          <Field label="Your test question" htmlFor="assistant-test-question">
            <Textarea
              ref={question}
              id="assistant-test-question"
              name="question"
              required
              maxLength={500}
              rows={3}
              disabled={testing}
            />
          </Field>
          <Button type="submit" disabled={testing} className="self-start">
            {testing ? 'Trying…' : 'Ask your assistant'}
          </Button>
        </form>
        {testError ? (
          <p role="alert" className="text-crit mt-3 text-sm">
            {testError}
          </p>
        ) : null}
        {answer ? (
          <div role="status" className="bg-surface-2 mt-4 rounded-lg p-3 text-sm wrap-anywhere">
            <p className="text-ink whitespace-pre-wrap">{answer.reply}</p>
            {answer.sourceLine ? (
              <p className="text-ink-3 mt-2 text-xs">{answer.sourceLine}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
