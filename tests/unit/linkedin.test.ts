import { describe, expect, it } from 'vitest';
import { linkedinHref } from '@/lib/domain/linkedin';

describe('linkedinHref — only a real LinkedIn profile becomes a button', () => {
  it('accepts LinkedIn profile URLs', () => {
    expect(linkedinHref('https://www.linkedin.com/in/zaid')).toBe(
      'https://www.linkedin.com/in/zaid',
    );
    expect(linkedinHref(' https://uk.linkedin.com/in/zaid ')).toBe(
      'https://uk.linkedin.com/in/zaid',
    );
  });

  it('refuses anything else', () => {
    for (const url of [
      null,
      '',
      'linkedin.com/in/zaid',
      'http://www.linkedin.com/in/zaid',
      'https://linkedin.com.evil.example/in/zaid',
      'https://evil-linkedin.com/in/zaid',
      'javascript:alert(1)',
    ]) {
      expect(linkedinHref(url)).toBeNull();
    }
  });
});
