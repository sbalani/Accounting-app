/**
 * Cluster transactions that likely duplicate each other:
 * - Same absolute amount (within tolerance)
 * - Dates within `dayWindow` calendar days
 * - If crossAccount is false, payment_method_id must match
 */

const AMOUNT_EPS = 0.01;

export type TxForDuplicateScan = {
  id: string;
  amount: number;
  transaction_date: string;
  payment_method_id: string;
};

function absAmountMatch(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < AMOUNT_EPS;
}

function dayDiff(d1: string, d2: string): number {
  const a = d1.slice(0, 10);
  const b = d2.slice(0, 10);
  const t1 = new Date(`${a}T12:00:00`).getTime();
  const t2 = new Date(`${b}T12:00:00`).getTime();
  return Math.abs(Math.round((t1 - t2) / 86400000));
}

function createUnionFind(n: number): { find: (i: number) => number; union: (i: number, j: number) => void } {
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    let x = i;
    while (parent[x] !== x) x = parent[x];
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur];
      parent[cur] = x;
      cur = next;
    }
    return x;
  }

  function union(i: number, j: number) {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) parent[pj] = pi;
  }

  return { find, union };
}

export function clusterDuplicateTransactions<T extends TxForDuplicateScan>(
  rows: T[],
  options: { crossAccount: boolean; dayWindow: number }
): T[][] {
  const n = rows.length;
  if (n < 2) return [];

  const { find, union } = createUnionFind(n);
  const buckets = new Map<string, number[]>();

  function addToBucket(key: string, idx: number) {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(idx);
  }

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const cents = Math.round(Math.abs(Number(r.amount)) * 100);
    for (const delta of [-1, 0, 1] as const) {
      const key = options.crossAccount
        ? `k:${cents + delta}`
        : `${r.payment_method_id}:k:${cents + delta}`;
      addToBucket(key, i);
    }
  }

  for (const indices of buckets.values()) {
    const uniq = [...new Set(indices)];
    for (let a = 0; a < uniq.length; a++) {
      for (let b = a + 1; b < uniq.length; b++) {
        const i = uniq[a];
        const j = uniq[b];
        const ri = rows[i];
        const rj = rows[j];
        if (!options.crossAccount && ri.payment_method_id !== rj.payment_method_id) {
          continue;
        }
        if (!absAmountMatch(Number(ri.amount), Number(rj.amount))) continue;
        if (dayDiff(ri.transaction_date, rj.transaction_date) > options.dayWindow) continue;
        union(i, j);
      }
    }
  }

  const rootToMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!rootToMembers.has(r)) rootToMembers.set(r, []);
    rootToMembers.get(r)!.push(i);
  }

  const groups: T[][] = [];
  for (const members of rootToMembers.values()) {
    if (members.length < 2) continue;
    const txs = members
      .map((idx) => rows[idx])
      .sort((x, y) => {
        const d = x.transaction_date.localeCompare(y.transaction_date);
        return d !== 0 ? d : x.id.localeCompare(y.id);
      });
    groups.push(txs);
  }

  groups.sort((g, h) => {
    const d = h[0].transaction_date.localeCompare(g[0].transaction_date);
    return d !== 0 ? d : h[0].id.localeCompare(g[0].id);
  });

  return groups;
}
