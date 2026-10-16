import { page } from '@/app/(landing)/insignar/copy';

/**
 * The prospect's page, shown as an example: five parts, in order. Always shows a way out.
 * `inert`: it is a picture of the page, so its buttons are not clickable or focusable here.
 */
export function ProspectPage() {
  return (
    <article className="pg" aria-label={page.figs} inert>
      <header>
        <p className="fig">{page.header}</p>
        <span className="tag ex">{page.example}</span>
      </header>
      <section>
        <p className="tag">{page.one.h}</p>
        <q>{page.one.q}</q>
        <p className="srcs">{page.one.by}</p>
      </section>
      <section>
        <p className="tag">{page.two.h}</p>
        <p className="rng">{page.two.range}</p>
        <p className="srcs">{page.two.sources.join(' ')}</p>
        <p className="srcs">✓ {page.two.confirmed}</p>
      </section>
      <section>
        <p className="tag">{page.three.h}</p>
        <p className="quote" style={{ fontSize: 20 }}>
          {page.three.q}
        </p>
      </section>
      <section>
        <p className="tag">{page.four.h}</p>
        <p>{page.four.p}</p>
      </section>
      <section>
        <p className="tag">{page.five.h}</p>
        <ol>
          {page.five.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="actions">
          <button type="button" className="btn">
            {page.five.book}
          </button>
          <span className="srcs">{page.five.forward}</span>
        </div>
        <button type="button" className="linkish">
          {page.five.remove}
        </button>
        {page.five.ai && <p className="ai">{page.five.ai}</p>}
      </section>
    </article>
  );
}
