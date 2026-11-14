'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveKnowledgeAction } from '@/app/(app)/settings/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { FollowupSendButton } from '@/components/followup-send-button';
import { composeAnswerDraft, guessKnowledgeTopic } from '@/lib/chat/answer';

export type AnswerQuestion = {
  id: number;
  question: string;
  handed_off?: boolean;
  resolved_at?: string | null;
  saved_answer?: string | null;
};

export type AnswerContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  pagePath: string | null;
};

function SaveAnswer() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save answer'}
    </Button>
  );
}

export function AnswerChatQuestion({
  question,
  contact,
  repName = 'Your contact',
}: {
  question: AnswerQuestion;
  contact?: AnswerContact;
  repName?: string;
}) {
  const [state, action] = useActionState(saveKnowledgeAction, {});
  const saved = state.answer ?? question.saved_answer;
  if (saved) {
    const name = contact?.name?.trim().split(/\s+/)[0] || 'your contact';
    return (
      <div className="mt-3 min-w-0">
        <p role="status" className="text-ok text-sm">
          Answer saved to your knowledge.
        </p>
        <p className="text-ink-2 mt-2 text-sm wrap-anywhere whitespace-pre-wrap">{saved}</p>
        {contact?.pagePath ? (
          <div className="mt-3">
            <FollowupSendButton
              draft={composeAnswerDraft({
                question: question.question,
                answer: saved,
                repName,
                contactName: contact.name,
              })}
              pagePath={contact.pagePath}
              email={contact.email}
              phone={contact.phone}
              label={`Send this answer to ${name}`}
            />
          </div>
        ) : (
          <p className="text-ink-3 mt-2 text-sm">This contact no longer has a page to send.</p>
        )}
      </div>
    );
  }
  if (question.resolved_at) return null;
  return (
    <details className="mt-2">
      <summary className="text-accent min-h-11 cursor-pointer py-3 text-sm font-medium">
        Answer this
      </summary>
      <form action={action} className="flex min-w-0 flex-col gap-3">
        <input type="hidden" name="unanswered_id" value={question.id} />
        <Field
          label="Question, as other prospects may see it"
          htmlFor={`answer-question-${question.id}`}
          hint="Rewrite it in general terms, without names, companies or numbers."
        >
          <Input
            id={`answer-question-${question.id}`}
            name="public_question"
            required
            maxLength={300}
            placeholder="How long does setup take?"
          />
        </Field>
        <Field
          label="Save under"
          htmlFor={`answer-topic-${question.id}`}
          hint="Choose Pricing for answers that include prices."
        >
          <select
            id={`answer-topic-${question.id}`}
            name="topic"
            defaultValue={guessKnowledgeTopic(question.question)}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 h-12 w-full rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
          >
            {['services', 'pricing', 'faq', 'about', 'niche', 'timeline', 'proof'].map((topic) => (
              <option key={topic} value={topic}>
                {topic === 'faq' ? 'FAQ' : topic.charAt(0).toUpperCase() + topic.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Your answer"
          htmlFor={`answer-${question.id}`}
          hint="Saved with your general question in your knowledge. Your answer is sent exactly as typed."
        >
          <Textarea
            id={`answer-${question.id}`}
            name="content"
            rows={3}
            maxLength={20_000}
            required
          />
        </Field>
        {state.error ? (
          <p role="alert" className="text-crit text-sm">
            {state.error}
          </p>
        ) : null}
        <SaveAnswer />
      </form>
    </details>
  );
}
