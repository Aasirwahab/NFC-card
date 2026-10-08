import { requireStaff } from '@/lib/auth/staff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { serviceClient } from '@/lib/db/service';
import { getOpsRep } from '@/lib/ops/data';
import { issueBatchAction, saveUserAction } from '../../actions';

export const metadata = { title: 'Rep · Operator console' };

export default async function OpsUser({ params, searchParams }: PageProps<'/ops/users/[id]'>) {
  await requireStaff();
  const { id } = await params;
  const { saved, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const rep = await getOpsRep(id);
  if (!rep) notFound();

  const db = serviceClient();
  const [
    { data: batches },
    { data: profile },
    { data: business },
    { data: trail },
    { count: plays },
  ] = await Promise.all([
    db
      .from('card_batches')
      .select('id, label, size, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    db
      .from('business_profiles')
      .select('company_name, tagline, website, services')
      .eq('user_id', id)
      .maybeSingle(),
    db
      .from('staff_audit_log')
      .select('id, actor_email, action, target_code, at')
      .eq('target_user_id', id)
      .order('at', { ascending: false })
      .limit(15),
    db.from('playbook_entries').select('id', { count: 'exact', head: true }).eq('user_id', id),
  ]);

  return (
    <div>
      <Link href="/ops" className="text-ink-3 text-[13px] underline underline-offset-2">
        All reps
      </Link>
      <h1 className="font-display text-ink mt-2 text-2xl font-bold tracking-tight">
        {rep.name ?? 'No name yet'}
      </h1>
      <p className="text-ink-3 text-[13px]">{rep.email}</p>
      <p className="text-ink-2 mt-3 font-mono text-[13px]">
        {rep.stock.inStock} in stock · {rep.stock.handedOut} out · {rep.stock.lost} lost
      </p>

      {!rep.name ? (
        <p className="bg-accent/10 text-ink mt-4 rounded-xl px-4 py-3 text-[14px]" role="note">
          This rep has no name yet. Until they finish Setup (or you add one under Details), anyone
          tapping their cards sees a &ldquo;not active&rdquo; page instead of their portfolio.
        </p>
      ) : null}

      <details
        className="border-line bg-surface shadow-card mt-5 rounded-xl border p-4"
        open={Boolean(error)}
      >
        <summary className="text-ink cursor-pointer text-[14px] font-semibold">
          Details and settings
        </summary>
        {saved ? (
          <p className="text-ok mt-2 text-[13px]" role="status">
            Saved.
          </p>
        ) : null}
        {error ? (
          <p className="text-crit mt-2 text-[13px]" role="alert">
            {error === 'invalid'
              ? 'Check the fields: name needs two letters, booking must be a Cal.com link, email must be valid.'
              : 'Could not save.'}
          </p>
        ) : null}
        <form action={saveUserAction} className="mt-3 flex flex-col gap-2.5">
          <input type="hidden" name="userId" value={rep.id} />
          <Field name="full_name" label="Name" value={profile?.full_name} required />
          <Field name="title" label="Job title" value={profile?.title} />
          <Field name="phone" label="Phone" value={profile?.phone} />
          <Field
            name="contact_email"
            label="Contact email (on the vCard)"
            value={profile?.contact_email}
          />
          <Field name="linkedin_url" label="LinkedIn URL" value={profile?.linkedin_url} />
          <Field name="booking_url" label="Cal.com link" value={profile?.booking_url} />
          <Field name="timezone" label="Timezone" value={profile?.timezone ?? 'UTC'} />
          <label className="text-ink-3 flex flex-col gap-1 text-[12px]">
            Language
            <select
              name="language"
              defaultValue={profile?.language ?? 'en-GB'}
              className="border-line bg-bg text-ink rounded-lg border px-3 py-2.5 text-[14px]"
            >
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
            </select>
          </label>
          <label className="text-ink-3 flex flex-col gap-1 text-[12px]">
            Bio
            <textarea
              name="bio"
              defaultValue={profile?.bio ?? ''}
              rows={3}
              maxLength={600}
              className="border-line bg-bg text-ink rounded-lg border px-3 py-2.5 text-[14px]"
            />
          </label>
          <Field
            name="low_stock_at"
            label="Warn when in-stock cards are at or below"
            value={String(profile?.low_stock_at ?? 5)}
            type="number"
          />
          <Button type="submit" className="mt-1">
            Save details
          </Button>
        </form>
        <p className="text-ink-3 mt-3 text-[12px]">
          Email and password are not editable here. Photo and playbook are managed by the rep.
        </p>
      </details>

      <section className="border-line-soft mt-5 rounded-xl border p-4">
        <p className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">Business</p>
        {business ? (
          <>
            <p className="text-ink mt-1 text-[15px] font-medium">{business.company_name}</p>
            {business.tagline ? <p className="text-ink-2 text-[13px]">{business.tagline}</p> : null}
            <p className="text-ink-3 mt-1 text-[12px]">
              {business.services.length} services · {plays ?? 0} playbook entries
            </p>
          </>
        ) : (
          <p className="text-ink-2 mt-1 text-[14px]">Not set up yet.</p>
        )}
      </section>

      <form
        action={issueBatchAction}
        className="border-line bg-surface shadow-card mt-5 rounded-xl border p-4"
      >
        <input type="hidden" name="userId" value={rep.id} />
        <p className="text-ink text-[14px] font-semibold">Issue cards</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            name="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            defaultValue={10}
            aria-label="How many cards"
            className="sm:w-28"
          />
          <Input name="label" placeholder="Label, e.g. Pilot" maxLength={80} aria-label="Label" />
          <Button type="submit" className="shrink-0">
            Issue and start writing
          </Button>
        </div>
      </form>

      <h2 className="text-ink-3 mt-6 font-mono text-[11px] tracking-[0.08em] uppercase">Batches</h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {(batches ?? []).map((b) => (
          <li key={b.id}>
            <Link
              href={`/ops/batches/${b.id}`}
              className="border-line bg-surface block rounded-xl border px-3.5 py-3"
            >
              <p className="text-ink text-[15px] font-medium">{b.label || 'Card batch'}</p>
              <p className="text-ink-3 mt-0.5 font-mono text-[11px]">
                {b.size} cards · {new Date(b.created_at).toLocaleDateString('en-GB')}
              </p>
            </Link>
          </li>
        ))}
        {(batches ?? []).length === 0 ? (
          <li className="text-ink-2 text-[14px]">No batches issued yet.</li>
        ) : null}
      </ul>

      <h2 className="text-ink-3 mt-6 font-mono text-[11px] tracking-[0.08em] uppercase">
        Staff activity
      </h2>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {(trail ?? []).map((t) => (
          <li key={t.id} className="text-ink-2 text-[13px]">
            <span className="font-mono text-[12px]">{t.action}</span>
            {t.target_code ? <span className="font-mono"> {t.target_code}</span> : null} ·{' '}
            {t.actor_email} · {new Date(t.at).toLocaleString('en-GB')}
          </li>
        ))}
        {(trail ?? []).length === 0 ? (
          <li className="text-ink-3 text-[13px]">Nothing yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

function Field({
  name,
  label,
  value,
  required,
  type = 'text',
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="text-ink-3 flex flex-col gap-1 text-[12px]">
      {label}
      <Input name={name} type={type} defaultValue={value ?? ''} required={required} />
    </label>
  );
}
