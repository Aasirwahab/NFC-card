import 'server-only';
import { env } from '@/lib/env';

/**
 * Server-to-self calls: the kick fanning out to /api/jobs/run.
 *
 * The target origin comes from configuration (NEXT_PUBLIC_APP_URL), NEVER from
 * the incoming request. The request carries WORKER_SECRET as a bearer token; if
 * the origin were derived from the caller's Host header, anyone able to influence
 * that header would be handed the secret that authorises the worker routes.
 *
 * Returns whether the call was accepted. Never throws: a dropped fan-out call
 * costs one worker, not correctness — the job it would have run stays queued for
 * the next sweep.
 */
export async function postToSelf(path: string, bearer: string): Promise<boolean> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`postToSelf takes an absolute path, got "${path}"`);
  }

  const url = new URL(path, env.NEXT_PUBLIC_APP_URL);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}` },
      // The run route answers 202 immediately and works in after(), so this
      // only has to cover the round trip, not the job.
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    return response.ok;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'post_to_self_failed',
        path,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}
