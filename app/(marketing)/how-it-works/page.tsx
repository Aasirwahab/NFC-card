export const metadata = {
  title: 'How it works',
  description: 'What happens when you tap a TapLead card.',
};

/**
 * The transparency page (§16, §23). Linked from the footer of every prospect
 * page, and the thing that defuses the "what is this?" reaction.
 *
 * It is honest about the research without being creepy about it: it says plainly
 * that only public information is used, that the rep wrote the notes themselves,
 * and that nothing was taken from the prospect's device. It does not lead with
 * the technology, because sentiment toward outreach that "reads like AI" is
 * hostile and specificity is the thing worth claiming (§4).
 */
export default function HowItWorksPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">How it works</h1>

      <p className="text-ink-2 mt-4 text-lg">
        You were handed a cardboard card. You tapped it, and you got a page about your business
        rather than a generic advert. Here is exactly how that happened.
      </p>

      <Section title="Someone you met wrote it down">
        <p>
          After your conversation, the person who gave you the card noted what you told them — the
          problem you described, your company, and enough to remember you by. That is the whole
          input. Nothing was read off your phone, and tapping the card sent us nothing about you.
        </p>
      </Section>

      <Section title="We looked your company up, publicly">
        <p>
          We read your company&rsquo;s own website and other public sources to make the message
          specific rather than generic. It is the same research a diligent person would do before a
          follow-up call — just done for every card, rather than for the handful somebody gets round
          to.
        </p>
        <p>
          We do not buy data about you, and we do not look at anything you have not made public.
        </p>
      </Section>

      <Section title="Then we wrote the page">
        <p>
          The page you saw was written before you tapped and stored, which is why it loaded
          instantly. It is tied to the problem you actually raised. If the research turned up
          nothing useful, you got a simpler page rather than something invented.
        </p>
      </Section>

      <Section title="What we keep, and how to stop it">
        <p>
          We hold the notes from your conversation, your company, and anything you chose to give us
          afterwards. We do not add you to a mailing list, and nobody will email you because you
          tapped a card.
        </p>
        <p>
          You can ask for a copy of what we hold or have it deleted, at any time, and we will do it.
          The{' '}
          <a href="/privacy" className="text-accent underline underline-offset-2">
            privacy notice
          </a>{' '}
          says who to ask and what your rights are.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-soft mt-8 border-t pt-6">
      <h2 className="font-display text-ink text-lg font-semibold tracking-tight">{title}</h2>
      <div className="text-ink-2 mt-2 flex flex-col gap-3 text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
