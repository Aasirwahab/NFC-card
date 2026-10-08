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
