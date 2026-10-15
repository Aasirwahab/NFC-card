'use client';

import { useState } from 'react';

type Key = 'intros' | 'missed' | 'reeng' | 'value' | 'close';

const FIELDS: {
  key: Key;
  label: string;
  hint: string;
  max: number;
  error: string;
  placeholder: string;
  prefix?: string;
  suffix?: string;
}[] = [
  {
    key: 'intros',
    label: 'Introductions a month',
    hint: 'people you meet in person',
    max: 100_000,
    error: 'Enter a number from 0 to 100,000',
    placeholder: 'e.g. 20',
  },
  {
    key: 'missed',
    label: 'With no timely follow-up',
    hint: 'share, %',
    max: 100,
    error: 'Enter a percentage from 0 to 100',
    placeholder: 'e.g. 40',
    suffix: '%',
  },
  {
    key: 'reeng',
    label: 'You’d re-engage',
    hint: 'share of those, %',
    max: 100,
    error: 'Enter a percentage from 0 to 100',
    placeholder: 'e.g. 25',
    suffix: '%',
  },
  {
    key: 'value',
    label: 'Average opportunity value',
    hint: '£',
    max: 100_000_000,
    error: 'Enter an amount in pounds',
    placeholder: 'e.g. 5,000',
    prefix: '£',
  },
  {
    key: 'close',
    label: 'Chance an opportunity closes',
    hint: '%',
    max: 100,
    error: 'Enter a percentage from 0 to 100',
    placeholder: 'e.g. 20',
    suffix: '%',
  },
];

/** Loaded only when the visitor asks for them, and labelled as examples. */
const EXAMPLE: Record<Key, string> = {
  intros: '20',
  missed: '40',
  reeng: '25',
  value: '5000',
  close: '20',
};

const EMPTY: Record<Key, string> = { intros: '', missed: '', reeng: '', value: '', close: '' };

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

function parse(raw: string): number | null {
  const cleaned = raw.trim().replace(/[£,%\s]/g, '');
  return cleaned === '' ? null : Number(cleaned);
}

/**
 * An illustrative calculator. Every number is the visitor's own; the copy says
 * plainly that it is not a forecast, because INSIGNAR has not measured anything
 * yet (landing brief: no invented numbers).
 */
export function Scenario() {
  const [values, setValues] = useState(EMPTY);
  const [usingExample, setUsingExample] = useState(false);

  const errors: Partial<Record<Key, string>> = {};
  const numbers: Partial<Record<Key, number>> = {};
  let complete = true;
  let any = false;

  for (const field of FIELDS) {
    const n = parse(values[field.key]);
    if (n === null) {
      complete = false;
      continue;
    }
    any = true;
    if (!Number.isFinite(n) || n < 0 || n > field.max) {
      errors[field.key] = field.error;
      complete = false;
      continue;
    }
    numbers[field.key] = n;
  }

  const n = numbers as Record<Key, number>;
  const exposed = complete ? (((n.intros * n.missed) / 100) * n.value * n.close) / 100 : 0;
  const brought = (exposed * (n.reeng ?? 0)) / 100;
  const cases = complete
    ? [
        { label: 'Half your assumption', share: Math.min(100, n.reeng / 2) },
        { label: 'As entered', share: n.reeng },
        { label: 'Double', share: Math.min(100, n.reeng * 2) },
      ].map((c) => ({ label: c.label, value: (exposed * c.share) / 100 }))
    : [];
  const tallest = Math.max(...cases.map((c) => c.value), 0) || 1;

  return (
    <div className="grid2">
      <form className="panel" noValidate autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <h3>Your assumptions</h3>
        <p className="note">Every number is yours to change.</p>
        <div className="fields">
          {FIELDS.map((field) => (
            <div className="fld" key={field.key}>
              <label htmlFor={`c-${field.key}`}>
                {field.label} <small>{field.hint}</small>
              </label>
              <div className="in">
                {field.prefix ? <span>{field.prefix}</span> : null}
                <input
                  id={`c-${field.key}`}
                  inputMode="decimal"
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(event) => {
                    setUsingExample(false);
                    setValues({ ...values, [field.key]: event.target.value });
                  }}
                />
                {field.suffix ? <span>{field.suffix}</span> : null}
              </div>
              {errors[field.key] ? <div className="err">{errors[field.key]}</div> : null}
            </div>
          ))}
        </div>
        <div className="btnrow">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setValues(EXAMPLE);
              setUsingExample(true);
            }}
          >
            Try example numbers
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setValues(EMPTY);
              setUsingExample(false);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <div className="panel res" aria-live="polite">
        {complete ? (
          <div>
            <div className="lbl">
              Expected value in introductions with no timely follow-up
              {usingExample ? (
                <span className="exlabel">Example numbers, not a benchmark</span>
              ) : null}
            </div>
            <div className="big">{gbp.format(exposed)} a month</div>
            <div className="lbl">About {gbp.format(exposed * 12)} over a year</div>
            <div className="line2">
              <div className="lbl">If you re-engaged {Math.round(n.reeng * 10) / 10}% of them</div>
              <div className="big alt">{gbp.format(brought)} a month</div>
              <div className="lbl">About {gbp.format(brought * 12)} over a year</div>
            </div>
            <div className="bars" aria-hidden="true">
              {cases.map((c, i) => (
                <div className={i === 1 ? 'bar mid' : 'bar'} key={c.label}>
                  <b>{gbp.format(c.value)}</b>
                  <i style={{ height: `${Math.max(3, Math.round((c.value / tallest) * 100))}%` }} />
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
            <p className="sr">
              {cases.map((c) => `${c.label}: ${gbp.format(c.value)} a month`).join('. ')}
            </p>
            <div className="formula">
              introductions × no follow-up × opportunity value × chance it closes × share re-engaged
            </div>
          </div>
        ) : (
          <div>
            <div className="empty">
              {any
                ? 'Fill in all five numbers to see the scenario.'
                : 'Enter your numbers, or try the example, to see the scenario.'}
            </div>
            <div className="ghost" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <p className="disc">
          <b>Illustrative scenario, not a forecast.</b> INSIGNAR hasn&rsquo;t yet measured how much
          follow-up it recovers, and results vary. The bars show what happens if your re-engagement
          assumption is half, as entered, or double.
        </p>
      </div>
    </div>
  );
}
