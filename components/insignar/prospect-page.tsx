import { page } from '@/app/(marketing)/insignar/copy';

/** The prospect's page: five parts, in order. Always shows a way out and the written-with-AI label. */
export function ProspectPage() {
  return (
    <article className="pg" aria-label={page.figs}>
      <header>
        <p className="fig">{page.header}</p>
      </header>
      <section>
        <p className="tag">01 · {page.one.h}</p>
        <q>{page.one.q}</q>
        <p className="srcs">{page.one.by}</p>
      </section>
      <section>
        <p className="tag">
          02 · {page.two.h} <span className="tag ex">EXAMPLE</span>
        </p>
        <p className="rng">{page.two.range}</p>
        <p className="srcs">{page.two.sources.join(' · ')}</p>
        <p className="srcs">✓ {page.two.confirmed}</p>
      </section>
      <section>
        <p className="tag">03 · {page.three.h}</p>
        <p className="quote" style={{ fontSize: 20 }}>
          {page.three.q}
        </p>
      </section>
      <section>
        <p className="tag">04 · {page.four.h}</p>
        <p>{page.four.p}</p>
      </section>
      <section>
        <p className="tag">05 · {page.five.h}</p>
        <ol>
          {page.five.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="actions">
          <button type="button" className="btn">
            {page.five.book}
          </button>
          <span className="srcs">
            {page.five.forward} <span className="tag ex">{page.concept}</span>
          </span>
        </div>
        <button type="button" className="linkish">
          {page.five.remove}
        </button>
        <p className="ai">{page.five.ai}</p>
      </section>
    </article>
  );
}
