import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { isLowStock, stockByUser, emptyStock, type Stock } from './stock';

export type OpsRep = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lowStockAt: number;
  stock: Stock;
  lowStock: boolean;
  openOrders: number;
};

/** Every account with its stock. Small by design (a pilot of a few reps), so one pass is fine. */
export async function listReps(): Promise<OpsRep[]> {
  const db = serviceClient();

  const users: { id: string; email: string; created_at: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const batch = data?.users ?? [];
    users.push(...batch.map((u) => ({ id: u.id, email: u.email ?? '', created_at: u.created_at })));
    if (batch.length < 200) break;
  }

  const [{ data: profiles }, { data: cards }, { data: orders }] = await Promise.all([
    db.from('profiles').select('id, full_name, low_stock_at'),
    db.from('cards').select('user_id, status, written_at, verified_at'),
    db.from('card_orders').select('user_id').in('status', ['requested', 'ordered']),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const stock = stockByUser(cards ?? []);
  const openOrders = new Map<string, number>();
  for (const o of orders ?? []) openOrders.set(o.user_id, (openOrders.get(o.user_id) ?? 0) + 1);

  return users
    .map((u) => {
      const profile = profileById.get(u.id);
      const s = stock.get(u.id) ?? emptyStock();
      const lowStockAt = profile?.low_stock_at ?? 5;
      return {
        id: u.id,
        email: u.email,
        name: profile?.full_name ?? null,
        createdAt: u.created_at,
        lowStockAt,
        stock: s,
        lowStock: isLowStock(s.inStock, lowStockAt),
        openOrders: openOrders.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

export async function getOpsRep(id: string): Promise<OpsRep | null> {
  return (await listReps()).find((r) => r.id === id) ?? null;
}
