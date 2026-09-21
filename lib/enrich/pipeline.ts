import { generateText, Output, type LanguageModel } from 'ai';
import type { Json } from '@/lib/db/types';
import {
  PermanentJobError,
  RestartJobError,
  type JobContext,
  type JobHandler,
} from '@/lib/jobs/types';
import { composeBrief, type Brief } from './brief';
import { candidateDomains, companyKey, domainFromEmail, pageNamesCompany } from './domain';
import { qualityGate, type GateFailure } from './gate';
import { htmlToText } from './html';
import { pitchPrompt, researchPrompt } from './prompts';
import { EMPTY_RESEARCH, researchOutputSchema, verifyFacts, type Research } from './research';
import { snapshotSchema, type Snapshot } from './snapshot';

/**
 * The enrichment pipeline: the `enrich` job handler (spec §14).
 *
 *   snapshot   the inputs, read once and checkpointed
 *   1 resolve  company name -> domain                      cached by name, 30 days
 *   2 site     homepage + about page, via safeFetch         cached by domain, 7 days
 *   3 research structured, verified facts                   cached by domain + model, 7 days
 *   4 brief    pure
 *   5 pitch    the best model, under the concurrency limit  never cached
 *   6 gate     pure; one stricter retry of step 5, then the template
 *   7 commit   one transaction, refused if the rep edited mid-run
 *
 * Every effectful step goes through `step()`, so it checkpoints, a retry
 * resumes rather than restarts, and a step that will not fit in the remaining
 * time is never started (§13).
 *
 * All I/O is injected (EnrichDeps). Production wires Supabase, safeFetch, Redis
 * and the AI Gateway (deps.ts); the tests wire the in-process Postgres, a fake
 * web and the mock models — and run this exact code.
 */

export interface ResearchCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface Semaphore {
  /** A release function, or null when every slot is taken. Never waits. */
  tryAcquire(): Promise<(() => Promise<void>) | null>;
}

export type ModelHandle = { id: string; model: LanguageModel };

export type CommitOutcome = 'committed' | 'replay' | 'stale' | 'inactive' | 'missing';
export type RejectOutcome = 'rejected' | 'stale' | 'inactive' | 'missing';

export type EnrichDeps = {
  loadSnapshot(sessionId: string): Promise<unknown | null>;
  commit(input: {
    sessionId: string;
    research: Research;
    pitch: string;
    model: string;
    revision: number;
  }): Promise<CommitOutcome>;
  reject(input: {
    sessionId: string;
    research: Research;
    reason: string;
    revision: number;
  }): Promise<RejectOutcome>;
  /** safeFetch in production. Throws when a guard refuses; `ok: false` for a 404. */
  fetchPage(url: string): Promise<{ ok: boolean; body: string; url: string }>;
  cache: ResearchCache;
  semaphore: Semaphore;
  researchModel: ModelHandle;
  pitchModel: ModelHandle;
  log(event: string, details: Record<string, unknown>): void;
  /** Injected so tests do not wait in real time. */
  sleep?(ms: number): Promise<void>;
};

const DAY = 24 * 60 * 60;

/**
 * Upper bounds, in milliseconds, used to decide whether a step may START. Each
 * model call is aborted a little before its step's bound, so a slow provider
 * fails the step cleanly (and retries from the checkpoint) rather than being
 * killed mid-step by the platform.
 */
export const STEP_MS = {
  snapshot: 5_000,
  resolve: 45_000,
  site: 30_000,
  research: 60_000,
  pitch: 60_000,
} as const;

const MODEL_TIMEOUT_MS = 50_000;

/** How long a model call waits for a free concurrency slot before deferring. */
const SEMAPHORE_PATIENCE_MS = 10_000;
/** How far into the future a deferred job is put back. */
const DEFER_SECONDS = 30;

type Resolved = { domain: string | null; source: 'email' | 'guess' | null };
type Site = { text: string; pages: string[] };

// ------------------------------------------------------------- step 1

async function resolveDomain(snapshot: Snapshot, deps: EnrichDeps): Promise<Resolved> {
  // The prospect's own work address is the strongest evidence there is.
  const fromEmail = domainFromEmail(snapshot.session.prospect_email);
  if (fromEmail) return { domain: fromEmail, source: 'email' };

  const company = snapshot.session.prospect_company;
  const key = companyKey(company);
  if (!key) return { domain: null, source: null };

  const cached = await deps.cache.get<{ domain: string | null }>(`resolve:${key}`);
  if (cached) return { domain: cached.domain, source: cached.domain ? 'guess' : null };

  // Guesses are checked in parallel but chosen in order, most likely first. A
  // guess counts only if that site's own homepage names the company.
  const candidates = candidateDomains(company);
  const verdicts = await Promise.all(
    candidates.map(async (domain) => {
      try {
        const page = await deps.fetchPage(`https://${domain}/`);
        if (!page.ok) return null;
        const { title, description, text } = htmlToText(page.body);
        return pageNamesCompany(company, [title, description, text].join(' ')) ? domain : null;
      } catch {
        return null; // unreachable, refused by safeFetch, or not a website at all
      }
    }),
  );

  const domain = verdicts.find((d): d is string => d !== null) ?? null;
  // A miss is cached briefly: a company's site may simply have been down.
  await deps.cache.set(`resolve:${key}`, { domain }, domain ? 30 * DAY : DAY);
  return { domain, source: domain ? 'guess' : null };
}

// ------------------------------------------------------------- step 2

async function fetchSite(domain: string | null, deps: EnrichDeps): Promise<Site> {
  if (!domain) return { text: '', pages: [] };

  const cached = await deps.cache.get<Site>(`site:${domain}`);
  if (cached) return cached;

  // §24.3: a site that is unreachable degrades SILENTLY. No page is not an
  // error; it only means the pitch is written from the remaining signals.
  const read = async (path: string) => {
    try {
      const page = await deps.fetchPage(`https://${domain}${path}`);
      return page.ok && page.body ? { url: page.url, page: htmlToText(page.body) } : null;
    } catch {
      return null;
    }
  };

  const home = await read('/');
  const about = (await read('/about')) ?? (await read('/about-us'));

  const parts = [
    home?.page.title,
    home?.page.description,
    home?.page.text.slice(0, 6_000),
    about?.page.text.slice(0, 4_000),
  ].filter((p): p is string => Boolean(p));

  const site: Site = {
    text: parts.join('\n\n').slice(0, 10_000),
    pages: [home?.url, about?.url].filter((u): u is string => Boolean(u)),
  };

  // Only a successful read is cached; an outage is not remembered for a week.
  if (site.text) await deps.cache.set(`site:${domain}`, site, 7 * DAY);
  return site;
}

// ------------------------------------------------- the concurrency limit

async function withModelSlot<T>(
  deps: EnrichDeps,
  ctx: JobContext,
  fn: () => Promise<T>,
): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + SEMAPHORE_PATIENCE_MS;

  let release = await deps.semaphore.tryAcquire();
  while (!release && Date.now() < deadline) {
    await sleep(1_000);
    release = await deps.semaphore.tryAcquire();
  }

  if (!release) {
    // Busy, not broken: back in the queue for a moment, no attempt spent.
    deps.log('model_slot_busy', { jobId: ctx.job.id });
    ctx.defer(DEFER_SECONDS);
  }

  try {
    return await fn();
  } finally {
    await release();
  }
}

// ------------------------------------------------------------- step 3

async function research(
  snapshot: Snapshot,
  resolved: Resolved,
  site: Site,
  deps: EnrichDeps,
  ctx: JobContext,
): Promise<Research> {
  const base: Research = {
    ...EMPTY_RESEARCH,
    domain: resolved.domain,
    domainSource: resolved.source,
    pages: site.pages,
  };
  if (!site.text || !resolved.domain) return base;

  // Keyed by model as well as domain: output from one model (or the mock) must
  // never be served as another's.
  const key = `research:${resolved.domain}:${deps.researchModel.id}`;
  const cached = await deps.cache.get<Research>(key);
  if (cached) return { ...cached, domainSource: resolved.source };

  const { instructions, prompt } = researchPrompt(snapshot.session.prospect_company, site.text);

  const { output } = await withModelSlot(deps, ctx, () =>
    generateText({
      model: deps.researchModel.model,
      instructions,
      prompt,
      output: Output.object({ schema: researchOutputSchema }),
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    }),
  );

  const result: Research = {
    ...base,
    summary: output.summary,
    // Only facts whose quote is genuinely on the page survive (research.ts).
    facts: verifyFacts(output, site.text),
    model: deps.researchModel.id,
  };

  await deps.cache.set(key, result, 7 * DAY);
  return result;
}

// ------------------------------------------------------------- step 5

async function writePitch(
  brief: Brief,
  failures: GateFailure[],
  deps: EnrichDeps,
  ctx: JobContext,
): Promise<string> {
  const { instructions, prompt } = pitchPrompt(brief, failures);
  const { text } = await withModelSlot(deps, ctx, () =>
    generateText({
      model: deps.pitchModel.model,
      instructions,
      prompt,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    }),
  );
  return text.trim();
}

// ------------------------------------------------------------ the handler

export function createEnrichHandler(deps: EnrichDeps): JobHandler {
  return async (ctx) => {
    const { job, step } = ctx;
    const sessionId = job.session_id;
    if (!sessionId) throw new PermanentJobError('enrich job has no session');

    // The inputs, once. Every later step and every retry reads this checkpoint.
    const raw = await step('snapshot', STEP_MS.snapshot, async () => {
      const value = await deps.loadSnapshot(sessionId);
      if (value === null) throw new PermanentJobError('session no longer exists');
      return value as Json;
    });

    const parsed = snapshotSchema.safeParse(raw);
    if (!parsed.success)
      throw new PermanentJobError(`unreadable snapshot: ${parsed.error.message}`);
    const snapshot = parsed.data;
    if (snapshot.session.status !== 'active') throw new PermanentJobError('session was voided');

    const resolved = await step('resolve', STEP_MS.resolve, () => resolveDomain(snapshot, deps));
    const site = await step('site', STEP_MS.site, () => fetchSite(resolved.domain, deps));
    const found = (await step(
      'research',
      STEP_MS.research,
      async () => (await research(snapshot, resolved, site, deps, ctx)) as unknown as Json,
    )) as unknown as Research;

    const brief = composeBrief(snapshot, found);

    let pitch = await step('pitch', STEP_MS.pitch, () => writePitch(brief, [], deps, ctx));
    let verdict = qualityGate(pitch, brief);
    const firstFailures = verdict.failures;

    if (!verdict.pass) {
      // §14.2: re-run step 5 only, once, with a stricter prompt naming the faults.
      deps.log('quality_gate_retry', {
        sessionId,
        failures: verdict.failures.map((f) => f.check),
      });
      pitch = await step('pitch_strict', STEP_MS.pitch, () =>
        writePitch(brief, verdict.failures, deps, ctx),
      );
      verdict = qualityGate(pitch, brief);
    }

    const outcome = verdict.pass
      ? await deps.commit({
          sessionId,
          research: found,
          pitch,
          model: deps.pitchModel.id,
          revision: brief.revision,
        })
      : await deps.reject({
          sessionId,
          research: found,
          reason: verdict.failures.map((f) => f.detail).join('; '),
          revision: brief.revision,
        });

    if (outcome === 'stale') {
      // The rep edited the session while this ran. Start again from the new
      // details — the newest details always win (§10.2).
      throw new RestartJobError('the session was edited while this ran');
    }

    deps.log('enrichment_finished', {
      sessionId,
      outcome,
      gate: verdict.pass ? (firstFailures.length ? 'passed_on_retry' : 'passed') : 'rejected',
      rejectedFor: verdict.pass ? undefined : verdict.failures.map((f) => f.check),
      facts: found.facts.length,
      domainSource: found.domainSource,
    });
  };
}
