import { TapMark, Wordmark } from '@/components/brand';

/**
 * Shown for the moment between tapping a card and the page arriving. Branded and
 * calm, never a blank screen: the first thing anyone sees after a tap should say
 * whose card this is. Motion stops for people who ask for less of it.
 */
export default function CardLoading() {
  return (
    <div
      role="status"
      aria-label="Opening your card"
      className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-center justify-center px-5"
    >
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="bg-accent/10 absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" />
        <span className="bg-accent/10 absolute inset-3 rounded-full" />
        <TapMark className="text-accent relative h-10 w-10 animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="mt-6">
        <Wordmark />
      </div>
      <p className="text-ink-3 mt-2 text-[13px]">Opening card…</p>
    </div>
  );
}
