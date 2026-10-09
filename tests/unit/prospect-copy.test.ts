import { describe, expect, it } from 'vitest';
import { publicEventName, templatePitch } from '@/lib/domain/pitch';

describe('what a prospect is told about where they met', () => {
  it('never shows the Unsorted filing label as a place', () => {
    expect(publicEventName('Unsorted')).toBeNull();
    expect(publicEventName('  unsorted ')).toBeNull();
    expect(publicEventName('Plant Hire Expo')).toBe('Plant Hire Expo');
    expect(publicEventName(null)).toBeNull();
  });

  it('the template pitch makes no claim about experience it cannot know', () => {
    const pitch = templatePitch({
      repName: 'Zaid',
      businessName: null,
      services: [],
      eventName: publicEventName('Unsorted'),
      prospectCompany: 'Taylor Plumbing',
      problems: ['Slow response to new enquiries'],
      customProblems: null,
    } as never);
    expect(pitch).not.toMatch(/Unsorted/);
    expect(pitch).not.toMatch(/spend most of our time|every week/);
    expect(pitch).toMatch(/Taylor Plumbing/);
  });
});
