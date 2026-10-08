/**
 * Shown the instant a rep navigates, while the next screen's data loads. Without it
 * a tap on the bottom bar looks like nothing happened for a second or more.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <div className="bg-line-soft h-7 w-40 rounded-lg" />
      <div className="mt-5 flex gap-3">
        <div className="bg-line-soft h-16 flex-1 rounded-xl" />
        <div className="bg-line-soft h-16 flex-1 rounded-xl" />
        <div className="bg-line-soft h-16 flex-1 rounded-xl" />
      </div>
      <div className="bg-line-soft mt-6 h-24 rounded-xl" />
      <div className="bg-line-soft mt-3 h-24 rounded-xl" />
    </div>
  );
}
