import Link from 'next/link';
import { buttonStyles } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-ink text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        The handwritten note, at scale.
      </h1>

      <p className="text-ink-2 mt-4 text-lg">
        The best sales reps take out a pen and write, on the back of the card, the one specific
        reason that person should call them. TapLead does that for every card you hand out.
      </p>

      <p className="text-ink-2 mt-4">
        A cardboard card with a penny sticker. They tap it, and they get a page written for them
        alone — tied to the exact problem they described, with real facts about their business, a
        chat and a booking link. No form to fill in first.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/sign-in" className={buttonStyles({ size: 'lg' })}>
          Sign in
        </Link>
        <Link href="/how-it-works" className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
          How it works
        </Link>
      </div>
    </div>
  );
}
