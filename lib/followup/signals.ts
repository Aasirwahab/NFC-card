type SignalInput = {
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt?: string | null;
  events: string[];
  questions: string[];
  submittedEmail: string | null;
  submittedPhone: string | null;
  openRequest?: boolean;
};

export function openingSummary(count: number, first: string | null, last: string | null = null) {
  const views = Math.max(count, first ? 1 : 0);
  return {
    count: views === 0 ? 'Not opened yet' : views === 1 ? 'Opened once' : `Opened ${views} times`,
    first,
    last,
  };
}

/** Use the same UK calendar day on the dashboard and contact page. */
export function openedWhen(value: string, now: number, withTime = false): string {
  const date = new Date(value);
  const today = new Date(now);
  const dayFormat = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/London',
  });
  const yesterday = new Date(`${dayFormat.format(today)}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const day =
    dayFormat.format(date) === dayFormat.format(today)
      ? 'today'
      : dayFormat.format(date) === dayFormat.format(yesterday)
        ? 'yesterday'
        : new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeZone: 'Europe/London',
          }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(date);
  return withTime ? `${day} at ${time}` : day;
}

/** Order recorded actions, never score or profile the person. */
export function strongestSignal(
  input: SignalInput,
  now = Date.now(),
): { label: string; rank: number } {
  if (input.openRequest) return { label: 'Asked you to contact them', rank: 7 };
  const emailed = input.events.includes('prospect_note_emailed');
  if ((input.submittedEmail || input.submittedPhone) && !emailed) {
    return { label: 'Asked you to send their note', rank: 6 };
  }
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
  // Automatic delivery also records one page_emailed event.
  if (input.events.filter((e) => e === 'page_emailed').length > (emailed ? 1 : 0))
    return { label: 'Emailed the page', rank: 2 };
  const summary = openingSummary(input.viewCount, input.firstViewedAt, input.lastViewedAt);
  return {
    label: emailed
      ? 'We emailed them their note'
      : `${summary.count}${summary.last ? `, last ${openedWhen(summary.last, now)}` : ''}`,
    rank: input.viewCount > 0 || input.firstViewedAt ? 1 : 0,
  };
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
