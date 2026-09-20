import { describe, expect, it } from 'vitest';
import { decideAudience, shouldRecordTap, type Audience } from '@/lib/domain/audience';
import { isNonHumanAgent } from '@/lib/domain/bots';
import { viewForSession } from '@/lib/domain/render-state';

const REP = '11111111-1111-4111-8111-111111111111';
const OTHER_REP = '22222222-2222-4222-8222-222222222222';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('decideAudience (§8)', () => {
  it('sends the owner to the rep view', () => {
    expect(decideAudience({ user_id: REP }, REP)).toBe('rep');
  });

  it('sends an anonymous visitor to the prospect view', () => {
    expect(decideAudience({ user_id: REP }, null)).toBe('prospect');
  });

  it('treats a DIFFERENT signed-in rep as a prospect', () => {
    // Someone signed in to another account is just a visitor here. They must not
    // see the rep controls for a card they do not own.
    expect(decideAudience({ user_id: REP }, OTHER_REP)).toBe('prospect');
  });

  it('reports a missing card', () => {
    expect(decideAudience(null, REP)).toBe('missing');
    expect(decideAudience(null, null)).toBe('missing');
  });
});

describe('shouldRecordTap (§10.4) — the rule whose failure mode is silence', () => {
  it('A REP SELF-TAP IS NOT A TAP', () => {
    // If this ever returns true, every no-tap follow-up is suppressed for every
    // prospect, the feature silently never fires, and nothing errors. This is
    // the single most important assertion in the suite.
    expect(shouldRecordTap({ audience: 'rep', userAgent: IPHONE, firstInWindow: true })).toBe(
      false,
    );
  });

  it('a genuine prospect view on a phone IS a tap', () => {
    expect(shouldRecordTap({ audience: 'prospect', userAgent: IPHONE, firstInWindow: true })).toBe(
      true,
    );
  });

  it('a miss is never a tap', () => {
    expect(shouldRecordTap({ audience: 'missing', userAgent: IPHONE, firstInWindow: true })).toBe(
      false,
    );
  });

  it('a link unfurler is not a tap', () => {
    // Pasting the URL into Slack must not mark the session as viewed.
    for (const agent of [
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (compatible; Discordbot/2.0)',
    ]) {
      expect(
        shouldRecordTap({ audience: 'prospect', userAgent: agent, firstInWindow: true }),
        agent,
      ).toBe(false);
    }
  });

  it('a crawler or monitor is not a tap', () => {
    for (const agent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0',
      'UptimeRobot/2.0',
    ]) {
      expect(
        shouldRecordTap({ audience: 'prospect', userAgent: agent, firstInWindow: true }),
        agent,
      ).toBe(false);
    }
  });

  it('an absent user agent is not a tap', () => {
    // Every real mobile browser sends one.
    expect(shouldRecordTap({ audience: 'prospect', userAgent: null, firstInWindow: true })).toBe(
      false,
    );
  });

  it('a repeat view inside the dedupe window is not a second tap', () => {
    expect(shouldRecordTap({ audience: 'prospect', userAgent: IPHONE, firstInWindow: false })).toBe(
      false,
    );
  });

  it('is false for every combination that is not a first, human, prospect view', () => {
    const audiences: Audience[] = ['missing', 'rep', 'prospect'];
    const agents = [IPHONE, 'Slackbot-LinkExpanding 1.0', null];
    const windows = [true, false];

    for (const audience of audiences) {
      for (const userAgent of agents) {
        for (const firstInWindow of windows) {
          const expected = audience === 'prospect' && !isNonHumanAgent(userAgent) && firstInWindow;
          expect(
            shouldRecordTap({ audience, userAgent, firstInWindow }),
            `${audience} / ${userAgent} / first=${firstInWindow}`,
          ).toBe(expected);
        }
      }
    }
  });
});

describe('viewForSession — the four render states (§16)', () => {
  it('maps every enrichment status to a designed state', () => {
    expect(viewForSession({ enrichment_status: 'completed', generated_pitch: 'A pitch.' })).toEqual(
      { state: 'completed', pitch: 'A pitch.' },
    );
    expect(viewForSession({ enrichment_status: 'queued', generated_pitch: null })).toEqual({
      state: 'crafting',
    });
    expect(viewForSession({ enrichment_status: 'processing', generated_pitch: null })).toEqual({
      state: 'crafting',
    });
    expect(viewForSession({ enrichment_status: 'failed', generated_pitch: null })).toEqual({
      state: 'failed',
    });
    expect(viewForSession({ enrichment_status: 'pending', generated_pitch: null })).toEqual({
      state: 'pending',
    });
  });

  it('falls back to the template when a completed session has no pitch', () => {
    // Should be impossible, but a blank page is the one failure this product
    // cannot have.
    expect(viewForSession({ enrichment_status: 'completed', generated_pitch: null })).toEqual({
      state: 'failed',
    });
    expect(viewForSession({ enrichment_status: 'completed', generated_pitch: '' })).toEqual({
      state: 'failed',
    });
  });

  it('treats an unrecognised status as pending rather than throwing', () => {
    // A future migration adding a status must not take the landing page down.
    expect(viewForSession({ enrichment_status: 'something_new', generated_pitch: null })).toEqual({
      state: 'pending',
    });
  });
});
