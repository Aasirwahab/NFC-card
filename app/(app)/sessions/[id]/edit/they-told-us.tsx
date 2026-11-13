'use client';

import { useState } from 'react';
import type { Niche } from '@/lib/db/rep';
import {
  chipProblemsForAll,
  keepVisible,
  MAX_TICKED_PROBLEMS,
  nichesFit,
} from '@/lib/capture/chips';
import { comparable, reconcileCard, type CardConflict } from '@/lib/capture/reconcile';

type Current = {
  email: string;
  phone: string;
  problems: string[];
  selectedNiches: string[];
};

type Answers = {
  prospect_picked_problems?: string[] | null;
  prospect_submitted_email?: string | null;
  prospect_submitted_phone?: string | null;
};

/** Add the owning area too: a tick whose chip is hidden would be dropped on save. */
export function selectProspectProblem(
  problem: string,
  problems: string[],
  selectedNiches: string[],
  niches: Niche[],
  fallback: string[],
): Pick<Current, 'problems' | 'selectedNiches'> | null {
  const all = chipProblemsForAll(
    niches,
    niches.map((n) => n.name),
    fallback,
  );
  if (!all.includes(problem)) return null;
  const nextNiches = [...selectedNiches];
  if (!chipProblemsForAll(niches, nextNiches, fallback).includes(problem)) {
    const owner = niches.find((n) => n.problems.includes(problem));
    if (owner && !nextNiches.includes(owner.name)) nextNiches.push(owner.name);
  }
  if (!nichesFit(nextNiches)) return null;
  const nextProblems = [...new Set([...problems, problem])];
  const visible = chipProblemsForAll(niches, nextNiches, fallback);
  if (keepVisible(nextProblems, visible).length > MAX_TICKED_PROBLEMS) return null;
  return { problems: nextProblems, selectedNiches: nextNiches };
}

export function TheyToldUs({
  session,
  niches,
  fallbackProblems,
  current,
  onContact,
  onProblems,
}: {
  session: Answers;
  niches: Niche[];
  fallbackProblems: string[];
  current: Current;
  onContact: (field: 'email' | 'phone', value: string) => void;
  onProblems: (value: Pick<Current, 'problems' | 'selectedNiches'>) => void;
}) {
  const [conflicts, setConflicts] = useState<CardConflict[]>([]);
  const picks = session.prospect_picked_problems ?? [];
  const contacts = [
    { field: 'email' as const, value: session.prospect_submitted_email },
    { field: 'phone' as const, value: session.prospect_submitted_phone },
  ].filter((c): c is { field: 'email' | 'phone'; value: string } => Boolean(c.value));
  if (picks.length === 0 && contacts.length === 0) return null;

  function handleContact(field: 'email' | 'phone', value: string) {
    const result = reconcileCard(
      { name: '', company: '', website: '', email: current.email, phone: current.phone },
      {
        name: null,
        title: null,
        company: null,
        website: null,
        email: null,
        phone: null,
        [field]: value,
      },
    );
    if (result.fill[field]) onContact(field, result.fill[field]);
    setConflicts((list) => [...list.filter((c) => c.field !== field), ...result.conflicts]);
  }

  return (
    <section className="border-line mt-5 border-y py-4" aria-labelledby="they-told-us-title">
      <h2 id="they-told-us-title" className="text-ink text-sm font-semibold">
        They told us
      </h2>
      <ul className="mt-2 space-y-2">
        {picks.map((problem) => {
          const next = selectProspectProblem(
            problem,
            current.problems,
            current.selectedNiches,
            niches,
            fallbackProblems,
          );
          const used = current.problems.includes(problem);
          return (
            <li key={problem} className="flex items-center justify-between gap-3">
              <span className="text-ink-2 min-w-0 text-sm wrap-anywhere">{problem}</span>
              <button
                type="button"
                disabled={!next || used}
                aria-label={`Use problem: ${problem}`}
                className="border-line bg-surface text-ink h-11 shrink-0 rounded-lg border px-3 text-sm disabled:opacity-50"
                onClick={() => {
                  if (next) onProblems(next);
                }}
              >
                {used ? 'In form' : 'Use'}
              </button>
            </li>
          );
        })}
        {contacts.map(({ field, value }) => {
          const used = comparable(field, current[field]) === comparable(field, value);
          const conflict = conflicts.find(
            (c) => c.field === field && current[field].trim() === c.typed,
          );
          return (
            <li key={field} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2 min-w-0 text-sm wrap-anywhere">{value}</span>
                <button
                  type="button"
                  disabled={used}
                  aria-label={`Use their ${field}: ${value}`}
                  className="border-line bg-surface text-ink h-11 shrink-0 rounded-lg border px-3 text-sm disabled:opacity-50"
                  onClick={() => handleContact(field, value)}
                >
                  {used ? 'In form' : 'Use'}
                </button>
              </div>
              {conflict ? (
                <div className="border-accent bg-accent-soft space-y-2 rounded-xl border p-3">
                  <p className="text-ink-2 text-sm wrap-anywhere">
                    They gave us <strong>{conflict.card}</strong>. You typed{' '}
                    <strong>{conflict.typed}</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="border-line bg-surface text-ink h-11 rounded-lg border px-3 text-sm"
                      onClick={() => {
                        if (current[field].trim() === conflict.typed)
                          onContact(field, conflict.card);
                        setConflicts((list) => list.filter((c) => c.field !== field));
                      }}
                    >
                      Use theirs
                    </button>
                    <button
                      type="button"
                      className="border-line bg-surface text-ink h-11 rounded-lg border px-3 text-sm"
                      onClick={() => setConflicts((list) => list.filter((c) => c.field !== field))}
                    >
                      Keep mine
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
