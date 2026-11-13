import 'server-only';
import { chipProblemsForAll } from '@/lib/capture/chips';
import { getEvent, listPlaybookProblems } from '@/lib/db/rep';

/** The prospect chooses from the same rep-owned chips, before choosing any area. */
export async function getProspectProblems(userId: string, eventId: string): Promise<string[]> {
  const [event, fallback] = await Promise.all([
    getEvent(userId, eventId),
    listPlaybookProblems(userId),
  ]);
  const niches = event?.niches ?? [];
  return chipProblemsForAll(
    niches,
    niches.map((niche) => niche.name),
    fallback,
  ).slice(0, 6);
}
