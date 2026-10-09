/** Pure stock arithmetic for the overview, kept free of the database so it is testable. */
export type CardRow = {
  user_id: string;
  status: string;
  written_at: string | null;
  verified_at: string | null;
};

export type Stock = {
  inStock: number;
  handedOut: number;
  lost: number;
  /** Issued to the rep but not yet written to a sticker. */
  needsWriting: number;
  /** Written but not yet checked with a tap. */
  needsVerifying: number;
};

export function emptyStock(): Stock {
  return { inStock: 0, handedOut: 0, lost: 0, needsWriting: 0, needsVerifying: 0 };
}

export function stockByUser(cards: readonly CardRow[]): Map<string, Stock> {
  const byUser = new Map<string, Stock>();
  for (const card of cards) {
    const stock = byUser.get(card.user_id) ?? emptyStock();
    if (card.status === 'available') {
      stock.inStock += 1;
      if (!card.written_at && !card.verified_at) stock.needsWriting += 1;
      else if (!card.verified_at) stock.needsVerifying += 1;
    } else if (card.status === 'assigned') stock.handedOut += 1;
    else if (card.status === 'voided') stock.lost += 1;
    byUser.set(card.user_id, stock);
  }
  return byUser;
}

/** In-stock cards are what a rep can still hand out; at or under their level means reorder. */
export function isLowStock(inStock: number, lowStockAt: number): boolean {
  return inStock <= lowStockAt;
}

export type CardProgress = 'issued' | 'written' | 'verified';

export function cardProgress(card: {
  written_at: string | null;
  verified_at: string | null;
}): CardProgress {
  if (card.verified_at) return 'verified';
  if (card.written_at) return 'written';
  return 'issued';
}

/**
 * What a card does right now, in words staff can act on. A card is active once its
 * sticker has been checked; an active card opens its owner's portfolio until the
 * rep adds an event or prospect details, and from then on it carries that lead.
 */
export function describeCard(card: {
  status: string;
  written_at: string | null;
  verified_at: string | null;
}): { label: string; detail: string; tone: 'ok' | 'wait' | 'off' } {
  if (card.status === 'voided') {
    return {
      label: 'Voided',
      detail: 'Lost or damaged. Opens the portfolio only; cannot be used.',
      tone: 'off',
    };
  }
  if (card.status === 'assigned') {
    return { label: 'In use', detail: 'Has a lead. Opens that prospect’s brief.', tone: 'ok' };
  }
  if (card.verified_at) {
    return {
      label: 'Active',
      detail: 'Opens the rep’s portfolio until they add prospect details.',
      tone: 'ok',
    };
  }
  if (card.written_at) {
    return {
      label: 'Written, not checked',
      detail: 'Tap the sticker with a staff phone to activate it.',
      tone: 'wait',
    };
  }
  return { label: 'Issued', detail: 'Needs its sticker written.', tone: 'wait' };
}
