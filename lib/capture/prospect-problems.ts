import 'server-only';
import { listPlaybookProblems } from '@/lib/db/rep';

/**
 * Before the rep has saved details nobody knows the prospect's area, so the only honest
 * chips are the rep's own general "problems you solve" list. None: the question is hidden.
 */
export async function getProspectProblems(userId: string): Promise<string[]> {
  return (await listPlaybookProblems(userId)).slice(0, 5);
}
