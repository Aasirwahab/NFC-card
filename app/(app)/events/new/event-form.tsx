'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { apiSend } from '@/lib/http/client';
import type { Niche } from '@/lib/db/rep';

/**
 * Creating an event, including its niches and quick-select problem sets.
 *
 * The problem sets are NOT a UI convenience — they are proprietary domain
 * knowledge that a generic personalisation tool cannot replicate without doing
 * the same work (§3), and they are second on the defensibility list (§5.2).
 *
 * So this is a real editor rather than a textarea: nobody builds a good problem
 * set by typing pipe-separated strings, and the spec is explicit that asking a
 * salesperson to hand-write structured text kills adoption before first use (§6).
 */
export function EventForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [niches, setNiches] = useState<Niche[]>([{ name: '', problems: [''] }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateNiche(index: number, next: Partial<Niche>) {
    setNiches((current) =>
      current.map((niche, i) => (i === index ? { ...niche, ...next } : niche)),
    );
  }

  function updateProblem(nicheIndex: number, problemIndex: number, value: string) {
    setNiches((current) =>
      current.map((niche, i) =>
        i === nicheIndex
          ? { ...niche, problems: niche.problems.map((p, j) => (j === problemIndex ? value : p)) }
          : niche,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const { event } = await apiSend<{ event: { id: string } }>('/api/events', 'POST', {
        name,
        event_date: date,
        location: location || undefined,
        // Drop the empty rows the editor leaves behind rather than storing them.
        niches: niches
          .map((niche) => ({
            name: niche.name.trim(),
            problems: niche.problems.map((p) => p.trim()).filter(Boolean),
          }))
          .filter((niche) => niche.name !== ''),
      });

      router.push(`/dashboard?event=${event.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the event.');
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Event name" htmlFor="name">
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Plant Hire Expo"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="date">
          <Input
            id="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="NEC Birmingham"
          />
        </Field>
      </div>

      <div className="border-line-soft border-t pt-4">
        <h2 className="text-ink-2 text-sm font-medium">Niches and the problems they raise</h2>
        <p className="text-ink-3 mt-0.5 text-[13px] leading-snug">
          What you tap at the event instead of typing. Be specific — &ldquo;idle machine
          tracking&rdquo; writes a better page than &ldquo;efficiency&rdquo;.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {niches.map((niche, nicheIndex) => (
            <div key={nicheIndex} className="border-line bg-surface rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={niche.name}
                  onChange={(e) => updateNiche(nicheIndex, { name: e.target.value })}
                  placeholder="Niche, e.g. plant hire"
                  className="h-11"
                  aria-label={`Niche ${nicheIndex + 1} name`}
                />
                {niches.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setNiches((c) => c.filter((_, i) => i !== nicheIndex))}
                    className="text-ink-3 hover:text-crit shrink-0 p-2"
                    aria-label={`Remove niche ${nicheIndex + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex flex-col gap-2 pl-1">
                {niche.problems.map((problem, problemIndex) => (
                  <div key={problemIndex} className="flex items-center gap-2">
                    <span aria-hidden="true" className="bg-accent/40 h-1 w-1 rounded-full" />
                    <Input
                      value={problem}
                      onChange={(e) => updateProblem(nicheIndex, problemIndex, e.target.value)}
                      placeholder="A problem they actually describe"
                      className="h-10 text-[15px]"
                      aria-label={`Problem ${problemIndex + 1} for niche ${nicheIndex + 1}`}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => updateNiche(nicheIndex, { problems: [...niche.problems, ''] })}
                  className="text-accent flex items-center gap-1 self-start pl-3 text-[13px] font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add problem
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setNiches((c) => [...c, { name: '', problems: [''] }])}
            className="text-accent flex items-center gap-1 self-start text-[13px] font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add niche
          </button>
        </div>
      </div>

      {error ? (
        <p className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      <Button size="block" onClick={save} disabled={saving || name.trim() === '' || date === ''}>
        {saving ? 'Creating…' : 'Create event'}
      </Button>
    </div>
  );
}
