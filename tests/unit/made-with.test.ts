import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiSend } from '@/lib/http/client';
import { MadeWith } from '@/app/c/[code]/made-with';

afterEach(() => {
  vi.unstubAllGlobals();
});
describe('quiet footer tracking', () => {
  it('keeps the session event request alive during same-tab navigation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    MadeWith({ first: 'Sam', code: 'ABCDEFGH' }).props.onClick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/landing/ABCDEFGH/made-with-opened',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });
  it('does not record clicks from previews', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    MadeWith({ first: 'Sam' }).props.onClick();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('continues to restrict keepalive requests to the same origin', async () => {
    await expect(
      apiSend('https://other.example/event', 'POST', undefined, { keepalive: true }),
    ).rejects.toThrow('same-origin');
  });
});
