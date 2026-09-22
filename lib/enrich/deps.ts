import 'server-only';
import { modelFor } from '@/lib/ai/models';
import type { Json } from '@/lib/db/types';
import { serviceClient } from '@/lib/db/service';
import { safeFetch } from '@/lib/http/safe-fetch';
import type { CommitOutcome, EnrichDeps, RejectOutcome } from './pipeline';
import { createModelSemaphore, redisResearchCache } from './redis';

/**
 * Production wiring for the pipeline: Supabase for the session, safeFetch for
 * the web, Redis for the cache and the semaphore, the AI Gateway for models.
 *
 * Built per job rather than once per process, so models are resolved against
 * the current configuration and nothing accumulates across jobs in a
 * long-lived instance.
 */
export function productionEnrichDeps(): EnrichDeps {
  const db = serviceClient();

  return {
    async loadSnapshot(sessionId) {
      const { data, error } = await db.rpc('enrichment_snapshot', { p_session_id: sessionId });
      if (error) throw new Error(`enrichment_snapshot failed: ${error.message}`);
      return data ?? null;
    },

    async commit({ sessionId, research, pitch, model, prompt, revision }) {
      const { data, error } = await db.rpc('complete_enrichment', {
        p_session_id: sessionId,
        p_research: research as unknown as Json,
        p_pitch: pitch,
        p_model: model,
        p_revision: revision,
        p_prompt: prompt,
      });
      if (error) throw new Error(`complete_enrichment failed: ${error.message}`);
      return data as CommitOutcome;
    },

    async reject({ sessionId, research, reason, revision }) {
      const { data, error } = await db.rpc('reject_enrichment', {
        p_session_id: sessionId,
        p_research: research as unknown as Json,
        p_reason: reason,
        p_revision: revision,
      });
      if (error) throw new Error(`reject_enrichment failed: ${error.message}`);
      return data as RejectOutcome;
    },

    fetchPage: (url) => safeFetch(url),
    cache: redisResearchCache,
    semaphore: createModelSemaphore(),
    researchModel: modelFor('research'),
    pitchModel: modelFor('pitch'),
    log: (event, details) => console.log(JSON.stringify({ event, ...details })),
  };
}
