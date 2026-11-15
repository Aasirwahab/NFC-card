import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FirstRunChecklist } from '@/components/first-run-checklist';
import type { SetupProgress } from '@/lib/db/rep';

const complete: SetupProgress = {
  photo: true,
  business: true,
  booking: true,
  playbook: true,
  tapTested: false,
};
const render = (progress: SetupProgress) =>
  renderToStaticMarkup(createElement(FirstRunChecklist, { progress }));

it('hides completed required setup even if the optional test tap is missing', () => {
  expect(render(complete)).toBe('');
});
it.each(['photo', 'business', 'booking', 'playbook'] as const)(
  'counts missing %s as a required step',
  (key) => {
    const html = render({ ...complete, [key]: false });
    expect(html).toContain('Setup: 3 of 4 done');
    expect(html).toContain('Finish');
    expect(html).not.toContain('<ul');
  },
);
it('points directly to the missing problems before handing out cards', () => {
  const html = render({ ...complete, playbook: false });
  expect(html).toContain('Add the problems you solve before handing out cards');
  expect(html).toContain('href="/settings#problems"');
});
it('keeps a missing booking link as quiet text in the setup row', () => {
  const html = render({ ...complete, booking: false });
  expect(html).toContain('Add a booking link before handing out cards');
  expect(html).not.toMatch(/text-crit|bg-crit|role="alert"/);
});
it('counts a completely new account', () => {
  expect(
    render({ photo: false, business: false, booking: false, playbook: false, tapTested: false }),
  ).toContain('Setup: 0 of 4 done');
});
