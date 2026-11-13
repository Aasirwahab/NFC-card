type SignalInput = {
  viewCount: number;
  firstViewedAt: string | null;
  events: string[];
  questions: string[];
};

export function openingSummary(count: number, first: string | null) {
  const views = Math.max(count, first ? 1 : 0);
  return {
    count: views === 0 ? 'Not opened yet' : views === 1 ? 'Opened once' : `Opened ${views} times`,
    first,
    // Only the first view is timestamped. With repeats, the last is unknown.
    last: views === 1 ? first : null,
  };
}

/** Order recorded actions, never score or profile the person. */
export function strongestSignal(input: SignalInput): { label: string; rank: number } {
  if (input.questions.length) {
    return {
      label: input.questions.some((q) => /\b(?:pric(?:e|es|ing)|costs?)\b|\bhow much\b/i.test(q))
        ? 'Asked about pricing'
        : 'Asked a question',
      rank: 5,
    };
  }
  if (input.events.includes('booking_opened')) return { label: 'Opened the booking page', rank: 4 };
  if (input.events.includes('linkedin_opened')) return { label: 'Pressed LinkedIn', rank: 3 };
  if (input.events.includes('page_emailed')) return { label: 'Emailed the page', rank: 2 };
  const summary = openingSummary(input.viewCount, input.firstViewedAt);
  return { label: summary.count, rank: input.viewCount > 0 || input.firstViewedAt ? 1 : 0 };
}

type Message = { id: number; role: string; content: string; created_at: string };
type Unanswered = { question: string; created_at: string };
export type ChatTurn = {
  id: number;
  question: string;
  answer: string | null;
  createdAt: string;
  unanswered: boolean;
};

export function chatTurns(messages: Message[], unanswered: Unanswered[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  // A recorded turn shares one transaction timestamp; concurrent turns can interleave ids.
  for (const message of [...messages].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id - b.id,
  )) {
    if (message.role === 'user') {
      turns.push({
        id: message.id,
        question: message.content,
        answer: null,
        createdAt: message.created_at,
        unanswered: false,
      });
    } else if (message.role === 'assistant') {
      const turn = turns.at(-1);
      if (turn && turn.answer === null && turn.createdAt === message.created_at) {
        turn.answer = message.content;
        // Fixed fallbacks (including old logs) were not all written to chat_unanswered.
        turn.unanswered =
          /I can’t confirm that here\.|I can only confirm the information on this page\.|(?:do not|don['’]t) want to (?:guess|give you a wrong answer)/i.test(
            message.content,
          );
      }
    }
  }
  for (const entry of unanswered) {
    const turn = turns.findLast(
      (t) =>
        t.question.trim().slice(0, 500) === entry.question &&
        Date.parse(t.createdAt) <= Date.parse(entry.created_at),
    );
    if (turn) turn.unanswered = true;
  }
  return turns;
}
