import { expect, it } from 'vitest';
import { GET } from '@/app/api/events/[id]/export/route';

it('redirects the legacy event export URL to the contacts export with 308', async () => {
  const id = 'a b/c?d';
  const request = new Request(`http://localhost/api/events/${encodeURIComponent(id)}/export`);
  const res = await GET(request, { params: Promise.resolve({ id }) });
  expect(res.status).toBe(308);
  expect(res.headers.get('location')).toBe(
    `http://localhost/api/contacts/export?event=${encodeURIComponent(id)}`,
  );
});
