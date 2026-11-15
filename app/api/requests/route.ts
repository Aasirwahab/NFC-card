import { z } from 'zod';
import { fail, json, withRep } from '@/lib/api';
import { listProspectRequests } from '@/lib/db/requests';

export const dynamic = 'force-dynamic';
export const GET = withRep(async (rep, request) => {
  const sessionId = new URL(request.url).searchParams.get('contact');
  if (sessionId && !z.uuid().safeParse(sessionId).success) return fail('not_found', 404);
  return json(
    { requests: await listProspectRequests(rep.userId, sessionId ?? undefined) },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
});
