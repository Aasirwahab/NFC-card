import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { looksLikeRequestContact } from '@/lib/domain/prospect-requests-view';

describe('prospect-requests-view', () => {
  const source = readFileSync('lib/domain/prospect-requests-view.ts', 'utf8');
  const imports = [...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gms)];

  it('never imports zod', () => {
    expect(source).not.toMatch(/from\s+['"]zod['"]/);
  });

  it('has no runtime import of prospect-requests or prospect-answers', () => {
    for (const [statement, path = ''] of imports) {
      if (/prospect-(requests|answers)/.test(path)) {
        expect(statement).toMatch(/^\s*import\s+type\b/);
      }
    }
  });

  it('gates contacts by channel', () => {
    expect(looksLikeRequestContact('email', 'Ben@Example.com')).toBe(true);
    expect(looksLikeRequestContact('email', '07700 900123')).toBe(false);
    expect(looksLikeRequestContact('text', '07712 345678')).toBe(true);
    expect(looksLikeRequestContact('call', 'ben@example.com')).toBe(false);
  });
});
