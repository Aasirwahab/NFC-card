/**
 * How tapping works on an iPhone, in four lines. There is no button and no setting:
 * an iPhone XR or newer reads the tag by itself whenever the screen is on. A web page
 * cannot read NFC on iPhone, so the tap always opens the card's link in Safari.
 */
export function TapGuide() {
  return (
    <div className="border-line-soft mt-4 border-t pt-4 text-left">
      <p className="text-ink text-[13px] font-semibold">How tapping works</p>
      <ul className="text-ink-2 mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-snug">
        <li>
          Hold the <strong>top edge</strong> of your iPhone against the card, screen on. No app, no
          setting. A banner appears: tap it to open the card.
        </li>
        <li>
          Signed in on this phone in <strong>Safari</strong>? Then your own tap registers the card
          and opens its details.
        </li>
        <li>
          Not reading? Scan the QR on the card with the Camera app, or type the code printed on the
          back into the box above.
        </li>
        <li>A metal case, a thick case or a card lying on metal can block the tap.</li>
      </ul>
    </div>
  );
}
